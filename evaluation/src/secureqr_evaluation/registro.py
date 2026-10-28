"""Registro interno del servicio bajo prueba, en líneas JSON.

`verifier-service` registra el motivo de cada rechazo en el campo `reason_code` de sus
registros de `logging` (ADR-0012): la respuesta pública es siempre la misma. Para leer
ese motivo sin tocar el servicio, la batería lo arranca con una configuración de
`logging` que escribe esos registros en un archivo, una línea JSON por registro.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

# Loggers de los paquetes que componen el servicio; ninguno registra claves ni cid.
LOGGERS_DEL_SERVICIO = ("secureqr_verifier", "secureqr_revocation", "secureqr_verifier_service")


class FormatoJson(logging.Formatter):
    """Una línea JSON con el evento y su `reason_code`, si lo tiene."""

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "logger": record.name,
                "evento": record.getMessage(),
                "reason_code": getattr(record, "reason_code", None),
            },
            ensure_ascii=False,
        )


def configuracion_logging(archivo: Path) -> dict:
    """Configuración para `uvicorn --log-config` que escribe el registro en `archivo`."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": f"{__name__}.FormatoJson"}},
        "handlers": {
            "motivos": {
                "class": "logging.FileHandler",
                "filename": str(archivo),
                "encoding": "utf-8",
                "formatter": "json",
            }
        },
        "loggers": {
            nombre: {"handlers": ["motivos"], "level": "INFO", "propagate": False}
            for nombre in LOGGERS_DEL_SERVICIO
        },
    }
