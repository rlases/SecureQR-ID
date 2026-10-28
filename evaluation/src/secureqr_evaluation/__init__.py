"""Batería de ataques reproducible de SecureQR-ID (ADR-0019).

Es una herramienta de evaluación, no un módulo del protocolo: no firma, no valida y no
agrega reglas. Ataca el sistema armado solo por sus interfaces públicas.
"""

from . import sqrid
from .casos import CASOS, Caso
from .entorno import Entorno, EntornoError, Presentacion

__all__ = ["CASOS", "Caso", "Entorno", "EntornoError", "Presentacion", "sqrid"]
