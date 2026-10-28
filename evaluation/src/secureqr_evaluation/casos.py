"""Catálogo de casos de ADR-0019, punto 3.

Cada caso tiene un identificador estable, que el documento de grado cita tal cual. Un
caso sabe preparar y presentar **un** intento contra el entorno; el ejecutor lo repite.

- Un caso malicioso debe terminar en rechazo, y por uno de sus `motivos_esperados`: un
  rechazo por otro motivo indica un error de la batería, no una detección.
- El grupo de control (`control`) son tokens legítimos presentados una sola vez dentro
  de su vigencia; mide el falso rechazo y el tiempo de validación.
"""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass

from secureqr_issuer import create_credential_id

from .entorno import Entorno, Presentacion

CONTROL = "control"


@dataclass(frozen=True, slots=True)
class Caso:
    id: str
    clase: str
    descripcion: str
    malicioso: bool
    motivos_esperados: frozenset[str]
    # (entorno, generador del caso, número de intento desde 0) → lo observado.
    intentar: Callable[[Entorno, random.Random, int], Presentacion]


def _control(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    cid = create_credential_id()
    return entorno.verificar(entorno.emisor().issue_token(cid))


CASOS: dict[str, Caso] = {}


def registrar(caso: Caso) -> Caso:
    if caso.id in CASOS:
        raise ValueError(f"Caso duplicado: {caso.id}")
    if caso.malicioso != bool(caso.motivos_esperados):
        raise ValueError(f"{caso.id}: un caso malicioso declara sus motivos esperados")
    CASOS[caso.id] = caso
    return caso


registrar(
    Caso(
        CONTROL,
        CONTROL,
        "Token legítimo, emitido y presentado una sola vez dentro de su vigencia",
        False,
        frozenset(),
        _control,
    )
)


def seleccionar(ids: str) -> list[Caso]:
    """`todos` o una lista separada por comas; el control siempre va primero."""
    if ids.strip() == "todos":
        elegidos = list(CASOS)
    else:
        elegidos = [i.strip() for i in ids.split(",") if i.strip()]
        desconocidos = [i for i in elegidos if i not in CASOS]
        if desconocidos or not elegidos:
            raise ValueError(
                f"Casos desconocidos: {', '.join(desconocidos) or '(ninguno)'}. "
                f"Disponibles: {', '.join(CASOS)}."
            )
    unicos = list(dict.fromkeys(elegidos))
    return sorted((CASOS[i] for i in unicos), key=lambda c: c.id != CONTROL)


# Cada clase del catálogo registra sus casos al importarse.
from . import casos_fr  # noqa: E402,F401
