"""Une los archivos públicos de ambos brazos con las métricas de #151.

Requiere instalado el paquete evaluation/; nunca importa Node desde Python.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from secureqr_evaluation.ejecutor import Fila, resumir


def cargar(path: Path, brazo: str) -> list[Fila]:
    registros = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(registros, list) or not registros:
        raise ValueError(f"{path}: se requiere una lista de intentos no vacía")
    filas = []
    vistos = set()
    for registro in registros:
        fila = Fila(**registro)
        if (
            fila.brazo != brazo or fila.decision not in ("aceptado", "rechazado")
            or not isinstance(fila.malicioso, bool)
            or fila.malicioso != (fila.clase != "control")
            or (fila.caso == "control") != (fila.clase == "control")
            or not isinstance(fila.caso, str) or not fila.caso
            or not isinstance(fila.clase, str) or not fila.clase
            or type(fila.repeticion) is not int or fila.repeticion < 1
            or type(fila.ms) not in (int, float) or not math.isfinite(fila.ms) or fila.ms < 0
            or (fila.motivo is not None and not isinstance(fila.motivo, str))
            or (fila.motivo_correcto is not None and type(fila.motivo_correcto) is not bool)
        ):
            raise ValueError(f"{path}: intento inválido")
        identidad = (fila.caso, fila.repeticion)
        if identidad in vistos:
            raise ValueError(f"{path}: intento duplicado")
        vistos.add(identidad)
        filas.append(fila)
    return filas


def porcentaje(tasa: dict) -> str:
    if tasa["tasa"] is None:
        return "Sin intentos"
    inferior, superior = tasa["ic95"]
    return f"{tasa['exitos']}/{tasa['intentos']} ({100*tasa['tasa']:.2f} %; IC95 {100*inferior:.2f}–{100*superior:.2f} %)"


def comparar(tradicional: Path, secureqr: Path, salida: Path) -> None:
    filas = cargar(tradicional, "tradicional") + cargar(secureqr, "secureqr")
    resumen = resumir(filas)
    if salida.exists() and (not salida.is_dir() or any(salida.iterdir())):
        raise ValueError("La salida debe ser una carpeta nueva o vacía")
    lineas = [
        "# Comparación de brazos (ADR-0019)", "",
        "Rechazos / intentos y tasa de detección con intervalo de Wilson al 95 %.", "",
        "| Clase | Tradicional | SecureQR-ID |", "|---|---|---|",
    ]
    for clase in ("F", "P", "V"):
        celdas = [
            porcentaje(resumen["brazos"][brazo]["deteccion_por_clase"][clase])
            if clase in resumen["brazos"][brazo]["deteccion_por_clase"] else "Sin intentos"
            for brazo in ("tradicional", "secureqr")
        ]
        lineas.append(f"| {clase} | {celdas[0]} | {celdas[1]} |")
    controles = [porcentaje(resumen["brazos"][b]["falso_rechazo"]) for b in ("tradicional", "secureqr")]
    lineas += [
        f"| Falso rechazo (control) | {controles[0]} | {controles[1]} |", "",
        "R y M: no aplican al brazo tradicional; no se cuentan como rechazos ni como ceros.",
        "Se comparan clases comunes, sin equiparar el global SecureQR (que puede incluir R/M).",
        "Los ms del parser local y los de HTTP no son tiempos comparables de registro en campo.",
        "Este informe resume archivos de laboratorio; no demuestra H1 ni H2 del piloto.",
    ]
    origen = {
        brazo: {"archivo": str(path.resolve()), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        for brazo, path in (("tradicional", tradicional), ("secureqr", secureqr))
    }
    salida.mkdir(parents=True, exist_ok=True)
    for nombre, texto in (
        ("comparacion.json", json.dumps(resumen, ensure_ascii=False, indent=2) + "\n"),
        ("comparacion-origen.json", json.dumps(origen, ensure_ascii=False, indent=2) + "\n"),
        ("comparacion.md", "\n".join(lineas) + "\n"),
    ):
        with (salida / nombre).open("x", encoding="utf-8") as archivo:
            archivo.write(texto)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tradicional", type=Path, required=True)
    parser.add_argument("--secureqr", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()
    try:
        comparar(args.tradicional, args.secureqr, args.salida)
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(2, f"Error: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
