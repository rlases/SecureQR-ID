"""Lista de revocacion firmada (SQRID-REVOKE/1)."""

from __future__ import annotations

import hmac

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
    revoked_credential_ids = list(revoked_credential_ids)
    if (
        not isinstance(kid, str)
        or not kid
        or type(issued_at) is not int
        or issued_at < 0
        or not all(isinstance(cid, str) and cid for cid in revoked_credential_ids)
        or len(set(revoked_credential_ids)) != len(revoked_credential_ids)
    ):
        raise RevocationError("Parametros de la lista de revocacion invalidos.")
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


ENVELOPE_FIELD_NAMES = frozenset({"v", "kid", "iat", "cids", "sig"})
SIGNATURE_SIZE = 2 * P256_SCALAR_SIZE


def _parse_envelope(signed_bytes: bytes) -> dict:
    """Decodifica el sobre y valida su forma; no verifica la firma."""
    if not isinstance(signed_bytes, (bytes, bytearray)):
        raise RevocationError("Formato de lista de revocacion invalido.")
    try:
        envelope = cbor2.loads(bytes(signed_bytes))
    except (cbor2.CBORDecodeError, ValueError, TypeError, OverflowError) as exc:
        raise RevocationError("Formato de lista de revocacion invalido.") from exc
    if not isinstance(envelope, dict) or set(envelope) != ENVELOPE_FIELD_NAMES:
        raise RevocationError("Formato de lista de revocacion invalido.")
    if envelope["v"] != FORMAT_VERSION:
        raise RevocationError("Version de lista de revocacion no soportada.")
    kid = envelope["kid"]
    issued_at = envelope["iat"]
    cids = envelope["cids"]
    signature = envelope["sig"]
    if not isinstance(kid, str) or not kid:
        raise RevocationError("Formato de lista de revocacion invalido.")
    if type(issued_at) is not int or issued_at < 0:
        raise RevocationError("Formato de lista de revocacion invalido.")
    # Una cadena tambien es iterable: frozenset("abc") revocaria "a", "b" y "c".
    if not isinstance(cids, list) or not all(
        isinstance(cid, str) and cid for cid in cids
    ):
        raise RevocationError("Formato de lista de revocacion invalido.")
    if len(set(cids)) != len(cids):
        raise RevocationError("Formato de lista de revocacion invalido.")
    if not isinstance(signature, bytes) or len(signature) != SIGNATURE_SIZE:
        raise RevocationError("Formato de lista de revocacion invalido.")
    return envelope


def read_key_id(signed_bytes: bytes) -> str:
    """Devuelve el `kid` declarado por la lista, sin verificarla.

    Sirve para elegir la clave de un directorio confiable, igual que con un
    token: el `kid` no es confiable hasta que la firma verifica con esa clave.
    """
    return _parse_envelope(signed_bytes)["kid"]


class RevocationList:
    """Lista de revocacion ya verificada, lista para consultar con is_revoked."""

    __slots__ = ("_issued_at", "_key_id", "_revoked_ids")

    def __init__(
        self,
        revoked_credential_ids: frozenset[str],
        *,
        key_id: str | None = None,
        issued_at: int | None = None,
    ) -> None:
        self._revoked_ids = revoked_credential_ids
        self._key_id = key_id
        self._issued_at = issued_at

    @property
    def key_id(self) -> str | None:
        return self._key_id

    @property
    def issued_at(self) -> int | None:
        """Marca temporal firmada de la lista (base para politicas de frescura)."""
        return self._issued_at

    @classmethod
    def from_signed_bytes(
        cls,
        signed_bytes: bytes,
        public_key: ec.EllipticCurvePublicKey,
        *,
        expected_key_id: str | None = None,
    ) -> "RevocationList":
        """Verifica la firma y construye la lista. Falla cerrado ante cualquier problema.

        La firma se valida con las mismas reglas que la de un token SQRID/1:
        P-256, firma compacta de 64 bytes y forma canonica *low-S*. Si se pasa
        `expected_key_id`, el `kid` firmado dentro de la lista debe coincidir.
        """
        envelope = _parse_envelope(signed_bytes)
        if expected_key_id is not None and not (
            isinstance(expected_key_id, str)
            and hmac.compare_digest(
                envelope["kid"].encode("utf-8"), expected_key_id.encode("utf-8")
            )
        ):
            raise RevocationError("La lista de revocacion no se pudo verificar.")
        if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(
            public_key.curve, ec.SECP256R1
        ):
            raise RevocationError("La lista de revocacion no se pudo verificar.")

        signature = envelope["sig"]
        r = int.from_bytes(signature[:P256_SCALAR_SIZE], "big")
        s = int.from_bytes(signature[P256_SCALAR_SIZE:], "big")
        if not 1 <= r < P256_ORDER or not 1 <= s <= P256_ORDER // 2:
            raise RevocationError("La lista de revocacion no se pudo verificar.")

        payload = _canonical_payload(envelope["kid"], envelope["iat"], envelope["cids"])
        try:
            public_key.verify(
                encode_dss_signature(r, s), payload, ec.ECDSA(hashes.SHA256())
            )
        except (InvalidSignature, ValueError) as exc:
            raise RevocationError(
                "La lista de revocacion no se pudo verificar."
            ) from exc

        return cls(
            frozenset(envelope["cids"]),
            key_id=envelope["kid"],
            issued_at=envelope["iat"],
        )

    def is_revoked(self, credential_id: str) -> bool:
        return credential_id in self._revoked_ids

    @classmethod
    def from_file(
        cls,
        path: str,
        public_key: ec.EllipticCurvePublicKey,
        *,
        expected_key_id: str | None = None,
    ) -> "RevocationList":
        """Lee la lista firmada desde un archivo y la verifica igual que from_signed_bytes."""
        try:
            with open(path, "rb") as file:
                signed_bytes = file.read()
        except (OSError, TypeError, ValueError) as exc:
            raise RevocationError(
                "No se pudo leer el archivo de la lista de revocacion."
            ) from exc
        return cls.from_signed_bytes(
            signed_bytes, public_key, expected_key_id=expected_key_id
        )
