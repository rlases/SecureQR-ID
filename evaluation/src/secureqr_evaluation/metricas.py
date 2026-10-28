"""Métricas de ADR-0019, punto 5."""

from __future__ import annotations

import math
import statistics

# Cuantil 0,975 de la normal estándar: intervalo de confianza del 95 %.
Z_95 = 1.959963984540054


def wilson(exitos: int, total: int, z: float = Z_95) -> tuple[float, float] | None:
    """Intervalo de Wilson para una proporción; None si no hubo intentos."""
    if total <= 0:
        return None
    p = exitos / total
    denominador = 1 + z * z / total
    centro = (p + z * z / (2 * total)) / denominador
    margen = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominador
    # En los extremos la fórmula deja un residuo de coma flotante; el límite es exacto.
    bajo = 0.0 if exitos == 0 else max(0.0, centro - margen)
    alto = 1.0 if exitos == total else min(1.0, centro + margen)
    return bajo, alto


def percentil(valores: list[float], q: float) -> float:
    """Percentil por rango más cercano: el menor valor con al menos q de la muestra."""
    if not valores:
        raise ValueError("Sin valores")
    ordenados = sorted(valores)
    return ordenados[max(0, math.ceil(q * len(ordenados)) - 1)]


def tiempos(valores: list[float]) -> dict[str, float] | None:
    if not valores:
        return None
    return {
        "media": statistics.fmean(valores),
        "mediana": statistics.median(valores),
        "p95": percentil(valores, 0.95),
    }
