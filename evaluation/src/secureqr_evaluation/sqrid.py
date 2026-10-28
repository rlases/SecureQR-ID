"""Lo mínimo de SQRID/1 que un atacante necesita para fabricar tokens a mano.

La batería no importa `verifier/`: igual que un atacante, solo conoce el formato
publicado en `docs/SQRID-1.md` (CBOR determinista en Base64url sin relleno). Toda la
criptografía viene de `cryptography`; no se implementa ninguna primitiva propia.
"""

from __future__ import annotations

import base64
import hashlib

import cbor2
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

VERSION = "SQRID/1"
CAMPOS_FIRMADOS = ("v", "kid", "cid", "iat", "exp", "n")
# Orden del grupo de P-256 (SEC 2): define el s «alto» de una firma maleable.
ORDEN_P256 = int("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)


def b64url(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode("ascii")


def decodificar(token: str) -> dict:
    return cbor2.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))


def codificar(campos: dict) -> str:
    return b64url(cbor2.dumps(campos, canonical=True))


def kid_de(publica: ec.EllipticCurvePublicKey) -> str:
    """`kid` = primeros 128 bits del SHA-256 del SubjectPublicKeyInfo (SQRID/1)."""
    der = publica.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return b64url(hashlib.sha256(der).digest()[:16])


def firmar(privada: ec.EllipticCurvePrivateKey, campos: dict) -> dict:
    """Firma los seis campos como lo haría un emisor: ECDSA P-256, `r || s`, low-S."""
    firmados = {k: campos[k] for k in CAMPOS_FIRMADOS}
    der = privada.sign(cbor2.dumps(firmados, canonical=True), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    s = min(s, ORDEN_P256 - s)
    return {**firmados, "sig": r.to_bytes(32, "big") + s.to_bytes(32, "big")}
