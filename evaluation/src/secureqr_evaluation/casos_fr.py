"""Casos F (falsificación) y R (reemplazo) de ADR-0019, punto 3 (#152).

Todos atacan la firma: el motivo esperado es `signature`, salvo F1, que también puede
caer antes, en `token_format`, cuando los bytes ni siquiera forman un token.
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import replace

from cryptography.hazmat.primitives.asymmetric import ec
from secureqr_issuer import create_credential_id

from . import sqrid
from .casos import Caso, registrar
from .entorno import Entorno, Presentacion

FIRMA = frozenset({"signature"})


def _legitimo(entorno: Entorno) -> dict:
    """Un token válido recién emitido, como lo vería quien lo captura."""
    return sqrid.decodificar(entorno.emisor().issue_token(create_credential_id()))


def _bytes(rng: random.Random, n: int) -> bytes:
    return rng.randbytes(n)


def _identificador(rng: random.Random) -> str:
    return sqrid.b64url(_bytes(rng, 16))


def _f1(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    if i % 2 == 0:
        # Bytes al azar codificados en Base64url: no forman un mapa CBOR válido.
        variante = "bytes"
        token = sqrid.b64url(_bytes(rng, rng.randint(64, 160)))
    else:
        variante = "mapa"
        # Un mapa con los siete campos y tipos correctos, pero valores al azar.
        ahora = int(time.time())
        token = sqrid.codificar(
            {
                "v": sqrid.VERSION,
                "kid": _identificador(rng),
                "cid": _identificador(rng),
                "iat": ahora,
                "exp": ahora + 60,
                "n": _bytes(rng, 16),
                "sig": _bytes(rng, 64),
            }
        )
    return replace(entorno.verificar(token), variante=variante)


def _f2(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    campos = _legitimo(entorno)
    firma = bytearray(campos["sig"])
    bit = rng.randrange(len(firma) * 8)
    firma[bit // 8] ^= 1 << (bit % 8)
    return entorno.verificar(sqrid.codificar({**campos, "sig": bytes(firma)}))


CAMPOS_F3 = ("cid", "exp", "iat", "n", "kid")


def _alterar(campo: str, campos: dict, rng: random.Random) -> object:
    if campo in ("cid", "kid"):
        return _identificador(rng)
    if campo == "n":
        return _bytes(rng, 16)
    if campo == "exp":
        return campos["exp"] + rng.randint(1, 3600)
    return campos["iat"] - rng.randint(1, 3600)


def _f3(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    campos = _legitimo(entorno)
    # Los cinco campos por turnos: con N intentos, cada uno se prueba N/5 veces.
    campo = CAMPOS_F3[i % len(CAMPOS_F3)]
    token = sqrid.codificar({**campos, campo: _alterar(campo, campos, rng)})
    return replace(entorno.verificar(token), variante=campo)


def _f4(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    campos = _legitimo(entorno)
    r, s = campos["sig"][:32], int.from_bytes(campos["sig"][32:], "big")
    # La misma firma con s' = n − s también verifica en ECDSA: se exige low-S (SQRID/1).
    alto = (sqrid.ORDEN_P256 - s).to_bytes(32, "big")
    return entorno.verificar(sqrid.codificar({**campos, "sig": r + alto}))


def _con_clave(entorno: Entorno, privada: ec.EllipticCurvePrivateKey, kid: str) -> Presentacion:
    ahora = int(time.time())
    campos = {
        "v": sqrid.VERSION,
        "kid": kid,
        "cid": create_credential_id(),
        "iat": ahora,
        "exp": ahora + 60,
        "n": os.urandom(16),
    }
    return entorno.verificar(sqrid.codificar(sqrid.firmar(privada, campos)))


def _r1(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    return _con_clave(entorno, ec.generate_private_key(ec.SECP256R1()), entorno.kid_emision)


def _r2(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    ajena = ec.generate_private_key(ec.SECP256R1())
    return _con_clave(entorno, ajena, sqrid.kid_de(ajena.public_key()))


def _r3(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    # Firma válida, pero de la clave de revocación (ADR-0014): no es de confianza para tokens.
    return _con_clave(
        entorno, entorno.cargar_privada(entorno.revocacion_privada), entorno.kid_revocacion
    )


for caso in (
    Caso("F1", "F", "Bytes aleatorios con la forma de SQRID/1", True,
         frozenset({"token_format", "signature"}), _f1),
    Caso("F2", "F", "Token válido con un bit de la firma cambiado", True, FIRMA, _f2),
    Caso("F3", "F", "Campo firmado alterado (cid, exp, iat, nonce o kid) sin volver a firmar",
         True, FIRMA, _f3),
    Caso("F4", "F", "Firma con s alto (maleabilidad ECDSA)", True, FIRMA, _f4),
    Caso("R1", "R", "Firma de una clave P-256 ajena con un kid de confianza", True, FIRMA, _r1),
    Caso("R2", "R", "Firma de una clave P-256 ajena con un kid desconocido", True, FIRMA, _r2),
    Caso("R3", "R", "Firma válida de la clave de revocación presentada como de emisión",
         True, FIRMA, _r3),
):
    registrar(caso)
