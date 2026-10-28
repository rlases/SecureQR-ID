"""Salida de una corrida (ADR-0019, punto 5).

- `resultados.json` y `resultados.csv`: una fila por intento.
- `entorno.json`: commit, versiones, sistema operativo, semilla, fecha y parámetros.
- `resumen.json` e `informe.md`: las métricas calculadas sobre esas filas.
"""

from __future__ import annotations

import csv
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

from .ejecutor import COLUMNAS, Fila

PAQUETES = (
    "secureqr-id-evaluation",
    "secureqr-id-issuer",
    "secureqr-id-verifier",
    "secureqr-id-verifier-service",
    "secureqr-id-revocation",
    "secureqr-id-evidence-log",
    "cryptography",
    "fastapi",
    "uvicorn",
)


def _git(*argumentos: str) -> str | None:
    try:
        resultado = subprocess.run(
            ["git", *argumentos],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return resultado.stdout.strip()


def describir_entorno(semilla: int, parametros: dict[str, object]) -> dict[str, object]:
    versiones = {}
    for paquete in PAQUETES:
        try:
            versiones[paquete] = metadata.version(paquete)
        except metadata.PackageNotFoundError:
            versiones[paquete] = None
    estado = _git("status", "--porcelain")
    return {
        "commit": _git("rev-parse", "HEAD"),
        # Cambios sin confirmar: un resultado así no se cita en el documento de grado.
        "arbol_modificado": None if estado is None else bool(estado),
        "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "semilla": semilla,
        "python": sys.version.split()[0],
        "sistema_operativo": platform.platform(),
        "versiones": versiones,
        "parametros": parametros,
    }


def _decimal(valor: float) -> str:
    # Coma decimal, como en el documento de grado.
    return f"{valor:.2f}".replace(".", ",")


def _porcentaje(valor: float | None) -> str:
    return "—" if valor is None else f"{_decimal(valor * 100)} %"


def _fila_tasa(nombre: str, t: dict) -> str:
    ic = t["ic95"]
    intervalo = "—" if ic is None else f"{_porcentaje(ic[0])} – {_porcentaje(ic[1])}"
    return f"| {nombre} | {t['intentos']} | {t['exitos']} | {_porcentaje(t['tasa'])} | {intervalo} |"


def informe_markdown(resumen: dict, entorno: dict) -> str:
    lineas = [
        "# Batería de ataques SecureQR-ID (ADR-0019)",
        "",
        f"- Commit: `{entorno['commit']}`"
        + (" (con cambios sin confirmar)" if entorno["arbol_modificado"] else ""),
        f"- Semilla: {entorno['semilla']} · Fecha: {entorno['fecha']}",
        f"- Intentos por caso: {entorno['parametros']['intentos']} · "
        f"Tokens de control: {entorno['parametros']['control']}",
    ]
    encabezado = ["| | Intentos | Rechazados | Tasa | IC 95 % (Wilson) |", "|---|---|---|---|---|"]
    for brazo, r in resumen["brazos"].items():
        lineas += ["", f"## Brazo `{brazo}`", "", "### Tasa de detección", "", *encabezado]
        for clase, t in r["deteccion_por_clase"].items():
            lineas.append(_fila_tasa(f"Clase {clase}", t))
        lineas.append(_fila_tasa("**Global**", r["deteccion_global"]))
        if r["deteccion_por_caso"]:
            lineas += ["", "### Por caso", "", *encabezado]
            lineas += [_fila_tasa(c, t) for c, t in r["deteccion_por_caso"].items()]
        lineas += ["", "### Grupo de control", "", *encabezado]
        lineas.append(_fila_tasa("Falso rechazo", r["falso_rechazo"]))
        t = r["tiempo_validacion_ms"]
        if t:
            lineas += [
                "",
                f"Tiempo de validación del lado del cliente: media {_decimal(t['media'])} ms, "
                f"mediana {_decimal(t['mediana'])} ms, p95 {_decimal(t['p95'])} ms.",
            ]
        incorrectos = r["motivos_incorrectos"]
        lineas += [
            "",
            f"Rechazos por un motivo distinto del esperado: {len(incorrectos)}"
            + (" (error de la batería; ver `resumen.json`)." if incorrectos else "."),
        ]
    return "\n".join(lineas) + "\n"


def escribir(carpeta: Path, filas: list[Fila], entorno: dict, resumen: dict) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    registros = [f.como_dict() for f in filas]
    (carpeta / "resultados.json").write_text(
        json.dumps(registros, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    with (carpeta / "resultados.csv").open("w", newline="", encoding="utf-8") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows(registros)
    (carpeta / "entorno.json").write_text(
        json.dumps(entorno, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (carpeta / "resumen.json").write_text(
        json.dumps(resumen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (carpeta / "informe.md").write_text(informe_markdown(resumen, entorno), encoding="utf-8")
