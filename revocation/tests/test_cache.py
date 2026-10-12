import logging
import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from secureqr_revocation.cache import RevocationListCache
from secureqr_revocation.revocation import (
    RevocationError,
    RevocationList,
    sign_revocation_list,
)

KID = "kid-revocacion-1"
NOW = 1_800_000_000
DAY = 24 * 3600


class Clock:
    def __init__(self, now=NOW):
        self.now = now

    def __call__(self):
        return self.now


@pytest.fixture
def key():
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def clock():
    return Clock()


def _write(path, key, cids, issued_at):
    data = sign_revocation_list(key, KID, cids, issued_at)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def _cache(path, key, clock, **overrides):
    options = dict(
        max_age_seconds=DAY, refresh_seconds=30, clock_skew_seconds=30, clock=clock
    )
    options.update(overrides)
    loader = lambda data: RevocationList.from_signed_bytes(data, key.public_key())
    return RevocationListCache(path, loader, **options)


def test_consulta_la_lista_vigente(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, ["cred-001"], NOW - 60)

    cache = _cache(path, key, clock)

    assert cache.is_revoked("cred-001") is True
    assert cache.is_revoked("cred-002") is False


def test_recarga_en_caliente_una_lista_mas_nueva(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock)
    assert cache.is_revoked("cred-001") is False

    _write(path, key, ["cred-001"], NOW)
    assert cache.is_revoked("cred-001") is False  # aún no toca revisar el disco

    clock.now += 30
    assert cache.is_revoked("cred-001") is True


def test_no_instala_una_lista_mas_vieja(tmp_path, key, clock, caplog):
    path = tmp_path / "lista.sqrid"
    _write(path, key, ["cred-001"], NOW)
    cache = _cache(path, key, clock)

    _write(path, key, [], NOW - 3600)  # lista vieja válidamente firmada
    clock.now += 30
    with caplog.at_level(logging.WARNING):
        assert cache.is_revoked("cred-001") is True

    assert [r.reason_code for r in caplog.records] == ["list_rollback"]


def test_lista_nueva_invalida_conserva_la_vigente(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, ["cred-001"], NOW - 60)
    cache = _cache(path, key, clock)

    path.write_bytes(b"basura")
    clock.now += 30
    assert cache.is_revoked("cred-001") is True

    otra = ec.generate_private_key(ec.SECP256R1())
    _write(path, otra, [], NOW)  # firmada por una clave no autorizada
    clock.now += 30
    assert cache.is_revoked("cred-001") is True


def test_archivo_borrado_conserva_la_vigente(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, ["cred-001"], NOW - 60)
    cache = _cache(path, key, clock)

    path.unlink()
    clock.now += 30

    assert cache.is_revoked("cred-001") is True


def test_lista_vencida_falla_cerrado_y_se_recupera_sola(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock)

    clock.now = NOW - 60 + DAY + 1
    with pytest.raises(RevocationError):
        cache.is_revoked("cred-002")

    _write(path, key, [], clock.now)
    clock.now += 30
    assert cache.is_revoked("cred-002") is False


def test_lista_vencida_al_arrancar_no_impide_construir(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 2 * DAY)

    cache = _cache(path, key, clock)

    with pytest.raises(RevocationError):
        cache.is_revoked("cred-001")


def test_lista_con_iat_futuro_se_rechaza(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW + 31)
    with pytest.raises(RevocationError):
        _cache(path, key, clock)

    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock)
    _write(path, key, ["cred-001"], NOW + 3600)  # fijaría el antirretroceso
    clock.now += 30
    assert cache.is_revoked("cred-001") is False
    assert cache.current.issued_at == NOW - 60


def test_lista_ausente_o_invalida_al_arrancar_falla(tmp_path, key, clock):
    with pytest.raises(RevocationError):
        _cache(tmp_path / "no-existe", key, clock)

    path = tmp_path / "lista.sqrid"
    path.write_bytes(b"basura")
    with pytest.raises(RevocationError):
        _cache(path, key, clock)


def test_reloj_que_retrocede_fuerza_revision(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock)

    _write(path, key, ["cred-001"], NOW - 10)
    clock.now -= 5
    assert cache.is_revoked("cred-001") is True


@pytest.mark.parametrize(
    "overrides",
    [
        {"max_age_seconds": 59},
        {"max_age_seconds": 30 * DAY + 1},
        {"max_age_seconds": True},
        {"refresh_seconds": 0},
        {"refresh_seconds": 3601},
        {"max_age_seconds": 120, "refresh_seconds": 120},
        {"clock_skew_seconds": 61},
        {"clock_skew_seconds": -1},
    ],
)
def test_configuracion_fuera_de_limites(tmp_path, key, clock, overrides):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)

    with pytest.raises(RevocationError):
        _cache(path, key, clock, **overrides)


def test_reloj_invalido_falla_cerrado(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock)

    clock.now = float("nan")
    with pytest.raises(RevocationError):
        cache.is_revoked("cred-001")


def test_consultas_concurrentes_durante_una_recarga(tmp_path, key, clock):
    path = tmp_path / "lista.sqrid"
    _write(path, key, [], NOW - 60)
    cache = _cache(path, key, clock, refresh_seconds=1)
    _write(path, key, ["cred-001"], NOW)
    clock.now += 1

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: cache.is_revoked("cred-001"), range(64)))

    # Cada consulta ve una lista completa (la vieja o la nueva), nunca un estado a medias.
    assert set(results) <= {True, False}
    assert cache.is_revoked("cred-001") is True
