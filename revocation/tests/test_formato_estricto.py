import cbor2
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from secureqr_revocation.revocation import (
    P256_ORDER,
    P256_SCALAR_SIZE,
    RevocationError,
    RevocationList,
    read_key_id,
    sign_revocation_list,
)

KID = "kid-revocacion-1"


@pytest.fixture
def private_key():
    return ec.generate_private_key(ec.SECP256R1())


def _signed(private_key, cids=("cred-001",), issued_at=1_000_000):
    return sign_revocation_list(private_key, KID, list(cids), issued_at)


def _tamper(signed_bytes, **changes):
    envelope = cbor2.loads(signed_bytes)
    for key, value in changes.items():
        if value is ...:
            envelope.pop(key)
        else:
            envelope[key] = value
    return cbor2.dumps(envelope, canonical=True)


def test_expone_kid_e_iat_firmados(private_key):
    signed = _signed(private_key)

    lista = RevocationList.from_signed_bytes(signed, private_key.public_key())

    assert read_key_id(signed) == KID
    assert lista.key_id == KID
    assert lista.issued_at == 1_000_000


def test_kid_esperado_debe_coincidir(private_key):
    signed = _signed(private_key)

    RevocationList.from_signed_bytes(
        signed, private_key.public_key(), expected_key_id=KID
    )
    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(
            signed, private_key.public_key(), expected_key_id="otro-kid"
        )


def test_firma_high_s_se_rechaza_aunque_sea_matematicamente_valida(private_key):
    signed = _signed(private_key)
    sig = cbor2.loads(signed)["sig"]
    r = sig[:P256_SCALAR_SIZE]
    s = int.from_bytes(sig[P256_SCALAR_SIZE:], "big")
    high_s = r + (P256_ORDER - s).to_bytes(P256_SCALAR_SIZE, "big")

    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(
            _tamper(signed, sig=high_s), private_key.public_key()
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"cids": "abc"},
        {"cids": ["cred-001", 7]},
        {"cids": ["cred-001", ""]},
        {"cids": ["cred-001", "cred-001"]},
        {"iat": "1000000"},
        {"iat": True},
        {"iat": -1},
        {"kid": ""},
        {"kid": 5},
        {"sig": b"\x01" * 63},
        {"sig": "firma"},
        {"sig": ...},
        {"extra": "campo"},
        {"v": "SQRID-REVOKE/2"},
    ],
)
def test_sobre_malformado_falla_cerrado(private_key, changes):
    signed = _tamper(_signed(private_key), **changes)

    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(signed, private_key.public_key())


@pytest.mark.parametrize("raw", [b"", b"\xff\xff", cbor2.dumps([1, 2]), "texto"])
def test_bytes_no_cbor_fallan_cerrado(private_key, raw):
    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(raw, private_key.public_key())
    with pytest.raises(RevocationError):
        read_key_id(raw)


def test_clave_que_no_es_p256_se_rechaza(private_key):
    otra_curva = ec.generate_private_key(ec.SECP384R1()).public_key()

    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(_signed(private_key), otra_curva)


def test_lista_vacia_firmada_es_valida(private_key):
    lista = RevocationList.from_signed_bytes(
        _signed(private_key, cids=()), private_key.public_key()
    )

    assert lista.is_revoked("cred-001") is False


@pytest.mark.parametrize(
    ("kid", "cids", "issued_at"),
    [
        ("", ["cred-001"], 1),
        (KID, ["cred-001", "cred-001"], 1),
        (KID, [""], 1),
        (KID, ["cred-001"], -1),
        (KID, ["cred-001"], 1.5),
    ],
)
def test_firmar_parametros_invalidos_falla(private_key, kid, cids, issued_at):
    with pytest.raises(RevocationError):
        sign_revocation_list(private_key, kid, cids, issued_at)


def test_archivo_inexistente_falla_cerrado(private_key, tmp_path):
    with pytest.raises(RevocationError):
        RevocationList.from_file(str(tmp_path / "no-existe"), private_key.public_key())
