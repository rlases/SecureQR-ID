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