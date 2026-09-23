from cryptography.hazmat.primitives.asymmetric import ec

from secureqr_revocation.revocation import RevocationList, sign_revocation_list


def test_credencial_revocada_se_detecta():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    signed_bytes = sign_revocation_list(
        private_key,
        kid="kid-institucion-1",
        revoked_credential_ids=["cred-revocada-001"],
        issued_at=1_000_000,
    )

    revocation_list = RevocationList.from_signed_bytes(signed_bytes, public_key)

    assert revocation_list.is_revoked("cred-revocada-001") is True
    assert revocation_list.is_revoked("cred-vigente-002") is False

import pytest

from secureqr_revocation.revocation import RevocationError


def test_firma_con_clave_incorrecta_falla_cerrado():
    private_key = ec.generate_private_key(ec.SECP256R1())
    clave_equivocada = ec.generate_private_key(ec.SECP256R1())
    public_key_equivocada = clave_equivocada.public_key()

    signed_bytes = sign_revocation_list(
        private_key,
        kid="kid-institucion-1",
        revoked_credential_ids=["cred-revocada-001"],
        issued_at=1_000_000,
    )

    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(signed_bytes, public_key_equivocada)


def test_lista_alterada_falla_cerrado():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    signed_bytes = sign_revocation_list(
        private_key,
        kid="kid-institucion-1",
        revoked_credential_ids=["cred-revocada-001"],
        issued_at=1_000_000,
    )

    # Simulamos que alguien cambio un byte del archivo firmado
    bytes_alterados = bytearray(signed_bytes)
    bytes_alterados[-5] ^= 0xFF

    with pytest.raises(RevocationError):
        RevocationList.from_signed_bytes(bytes(bytes_alterados), public_key)

def test_lista_se_puede_guardar_y_leer_de_disco(tmp_path):
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    signed_bytes = sign_revocation_list(
        private_key,
        kid="kid-institucion-1",
        revoked_credential_ids=["cred-revocada-001"],
        issued_at=1_000_000,
    )

    ruta = tmp_path / "revocacion.sqrid"
    ruta.write_bytes(signed_bytes)

    revocation_list = RevocationList.from_file(str(ruta), public_key)

    assert revocation_list.is_revoked("cred-revocada-001") is True