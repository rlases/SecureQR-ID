"""Ejecutor de la batería: repite cada caso y anota una fila por intento."""

from __future__ import annotations

import random
from collections import defaultdict
from collections.abc import Callable
from dataclasses import asdict, dataclass

from .casos import CONTROL, Caso
from .entorno import Entorno
from .metricas import tiempos, wilson

BRAZO = "secureqr"
ACEPTADO = "aceptado"
RECHAZADO = "rechazado"


@dataclass(frozen=True, slots=True)
class Fila:
    """Un intento. `motivo_correcto` solo aplica a un caso malicioso rechazado."""

    brazo: str
    caso: str
    clase: str
    repeticion: int
    malicioso: bool
    decision: str
    motivo: str | None
    motivo_correcto: bool | None
    ms: float

    def como_dict(self) -> dict[str, object]:
        return asdict(self)


COLUMNAS = list(Fila.__dataclass_fields__)


def ejecutar(
    entorno: Entorno,
    casos: list[Caso],
    *,
    intentos: int,
    control: int,
    semilla: int,
    progreso: Callable[[str, int, int], None] | None = None,
) -> list[Fila]:
    filas: list[Fila] = []
    for caso in casos:
        # Un generador por caso: agregar o quitar casos no cambia lo que hace otro.
        rng = random.Random(f"{semilla}:{caso.id}")
        total = control if caso.id == CONTROL else intentos
        for repeticion in range(1, total + 1):
            p = caso.intentar(entorno, rng)
            correcto = None
            if caso.malicioso and not p.aceptado:
                correcto = p.motivo in caso.motivos_esperados
            filas.append(
                Fila(
                    BRAZO, caso.id, caso.clase, repeticion, caso.malicioso,
                    ACEPTADO if p.aceptado else RECHAZADO, p.motivo, correcto, round(p.ms, 3),
                )
            )
            if progreso is not None:
                progreso(caso.id, repeticion, total)
    return filas


def _tasa(exitos: int, total: int) -> dict[str, object]:
    intervalo = wilson(exitos, total)
    return {
        "intentos": total,
        "exitos": exitos,
        "tasa": exitos / total if total else None,
        "ic95": list(intervalo) if intervalo else None,
    }


def resumir(filas: list[Fila]) -> dict[str, object]:
    """Tasa de detección por clase y global (con Wilson), falso rechazo y tiempos."""
    brazos: dict[str, dict[str, object]] = {}
    for brazo in dict.fromkeys(f.brazo for f in filas):
        propias = [f for f in filas if f.brazo == brazo]
        maliciosas = [f for f in propias if f.malicioso]
        por_clase: dict[str, list[Fila]] = defaultdict(list)
        por_caso: dict[str, list[Fila]] = defaultdict(list)
        for f in maliciosas:
            por_clase[f.clase].append(f)
            por_caso[f.caso].append(f)
        controles = [f for f in propias if f.caso == CONTROL]
        detectados = lambda grupo: sum(f.decision == RECHAZADO for f in grupo)  # noqa: E731
        brazos[brazo] = {
            "deteccion_global": _tasa(detectados(maliciosas), len(maliciosas)),
            "deteccion_por_clase": {
                c: _tasa(detectados(g), len(g)) for c, g in sorted(por_clase.items())
            },
            "deteccion_por_caso": {
                c: _tasa(detectados(g), len(g)) for c, g in sorted(por_caso.items())
            },
            "falso_rechazo": _tasa(detectados(controles), len(controles)),
            "tiempo_validacion_ms": tiempos([f.ms for f in controles]),
            "motivos_incorrectos": [
                {"caso": f.caso, "repeticion": f.repeticion, "motivo": f.motivo}
                for f in maliciosas
                if f.motivo_correcto is False
            ],
        }
    return {"brazos": brazos}
