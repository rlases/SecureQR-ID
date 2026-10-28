"""El entorno arranca un verifier-service real y lee su motivo interno."""

from pathlib import Path

import pytest
from secureqr_evaluation import Entorno
from secureqr_evidence_log.evidence_log import EvidenceLog
from secureqr_issuer import create_credential_id


@pytest.fixture
def entorno(tmp_path: Path):
    with Entorno(tmp_path / "entorno") as e:
        yield e


def test_token_legitimo_se_acepta_y_queda_en_la_bitacora(entorno: Entorno) -> None:
    cid = create_credential_id()
    p = entorno.verificar(entorno.emisor().issue_token(cid))
    assert p.aceptado is True
    assert p.motivo is None
    assert p.ms > 0
    entorno.detener()
    bitacora = EvidenceLog(str(entorno.base_bitacora))
    try:
        assert bitacora.verify_chain() is True
        assert [e.credential_id for e in bitacora.events] == [cid]
    finally:
        bitacora.close()


def test_el_motivo_sale_del_registro_interno_y_no_de_la_respuesta(entorno: Entorno) -> None:
    p = entorno.verificar("esto-no-es-un-token")
    assert p.aceptado is False
    assert p.motivo == "token_format"
    # La respuesta pública es genérica (ADR-0012): el motivo no viaja en ella.
    token = entorno.emisor().issue_token(create_credential_id())
    assert entorno.verificar(token).aceptado is True
    repetido = entorno.verificar(token)
    assert (repetido.aceptado, repetido.motivo) == (False, "replay")


def test_cada_corrida_tiene_claves_propias_y_distintas(tmp_path: Path) -> None:
    a = Entorno(tmp_path / "a")
    b = Entorno(tmp_path / "b")
    assert a.kid_emision != b.kid_emision
    assert a.kid_emision != a.kid_revocacion
    assert a.claves_emision != a.claves_revocacion
    # Las claves privadas viven cifradas y solo en la carpeta de la corrida.
    privada = a.emision_privada.read_bytes()
    assert b"ENCRYPTED" in privada
    assert a.emision_privada.is_relative_to(tmp_path / "a")


def test_los_nonces_persisten_al_reiniciar(entorno: Entorno) -> None:
    token = entorno.emisor().issue_token(create_credential_id())
    assert entorno.verificar(token).aceptado is True
    entorno.reiniciar()
    p = entorno.verificar(token)
    assert (p.aceptado, p.motivo) == (False, "replay")
