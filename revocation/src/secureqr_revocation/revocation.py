"""Lista de revocacion firmada (SQRID-REVOKE/1)."""

from __future__ import annotations

import cbor2
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

FORMAT_VERSION = "SQRID-REVOKE/1"
P256_ORDER = int(
    "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
    16,
)
P256_SCALAR_SIZE = 32


class RevocationError(Exception):
    """La lista de revocacion no se pudo firmar o verificar de forma segura."""


def _canonical_payload(kid: str, issued_at: int, revoked_credential_ids: list[str]) -> bytes:
    fields = {
        "v": FORMAT_VERSION,
        "kid": kid,
        "iat": issued_at,
        "cids": sorted(revoked_credential_ids),
    }
    return cbor2.dumps(fields, canonical=True)


def _compact_signature(private_key: ec.EllipticCurvePrivateKey, payload: bytes) -> bytes:
    der_signature = private_key.sign(payload, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_signature)
    if s > P256_ORDER // 2:
        s = P256_ORDER - s
    return r.to_bytes(P256_SCALAR_SIZE, "big") + s.to_bytes(P256_SCALAR_SIZE, "big")


def sign_revocation_list(
    private_key: ec.EllipticCurvePrivateKey,
    kid: str,
    revoked_credential_ids: list[str],
    issued_at: int,
) -> bytes:
    """Firma una lista de credenciales revocadas. Devuelve bytes listos para guardar/enviar."""
    payload = _canonical_payload(kid, issued_at, revoked_credential_ids)
    signature = _compact_signature(private_key, payload)
    envelope = {
        "v": FORMAT_VERSION,
        "kid": kid,
        "iat": issued_at,
        "cids": sorted(revoked_credential_ids),
        "sig": signature,
    }
    return cbor2.dumps(envelope, canonical=True)


class RevocationList:
    """Lista de revocacion ya verificada, lista para consultar con is_revoked."""

    __slots__ = ("_revoked_ids",)

    def __init__(self, revoked_credential_ids: frozenset[str]) -> None:
        self._revoked_ids = revoked_credential_ids

    @classmethod
    def from_signed_bytes(
        cls, signed_bytes: bytes, public_key: ec.EllipticCurvePublicKey
    ) -> "RevocationList":
        """Verifica la firma y construye la lista. Falla cerrado ante cualquier problema."""
        try:
            envelope = cbor2.loads(signed_bytes)
            if not isinstance(envelope, dict):
                raise RevocationError("Formato de lista de revocacion invalido.")

            signature = envelope.pop("sig")
            if envelope.get("v") != FORMAT_VERSION:
                raise RevocationError("Version de lista de revocacion no soportada.")

            payload = cbor2.dumps(envelope, canonical=True)

            r = int.from_bytes(signature[:P256_SCALAR_SIZE], "big")
            s = int.from_bytes(signature[P256_SCALAR_SIZE:], "big")
            der_signature = encode_dss_signature(r, s)
            public_key.verify(der_signature, payload, ec.ECDSA(hashes.SHA256()))

            revoked_ids = frozenset(envelope["cids"])
        except (
            InvalidSignature,
            KeyError,
            TypeError,
            ValueError,
            cbor2.CBORDecodeError,
        ) as exc:
            raise RevocationError(
                "La lista de revocacion no se pudo verificar."
            ) from exc

        return cls(revoked_ids)

    def is_revoked(self, credential_id: str) -> bool:
        return credential_id in self._revoked_ids