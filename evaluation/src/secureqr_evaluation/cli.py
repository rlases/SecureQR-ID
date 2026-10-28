"""`secureqr-eval run`: lanza la batería contra un entorno aislado y escribe el informe."""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from . import casos as catalogo
from .ejecutor import ejecutar, resumir
from .entorno import Entorno, EntornoError
from .informe import describir_entorno, escribir

# Semilla fija del informe del documento de grado (ADR-0019, punto 6).
SEMILLA_INFORME = 20261027


def _entero_positivo(valor: str) -> int:
    numero = int(valor)
    if numero < 0:
        raise argparse.ArgumentTypeError("debe ser un entero mayor o igual que 0")
    return numero


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="secureqr-eval", description=__doc__)
    sub = parser.add_subparsers(dest="comando", required=True)
    run = sub.add_parser("run", help="Ejecuta la batería y escribe los resultados.")
    run.add_argument("--casos", default="todos", help="'todos' o identificadores separados por comas")
    run.add_argument("--intentos", type=_entero_positivo, default=200, help="intentos por caso malicioso")
    run.add_argument("--control", type=_entero_positivo, default=1000, help="tokens del grupo de control")
    run.add_argument("--semilla", type=int, default=SEMILLA_INFORME)
    run.add_argument("--salida", type=Path, required=True, help="carpeta de resultados (nueva o vacía)")
    sub.add_parser("casos", help="Lista los casos disponibles.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.comando == "casos":
        for caso in catalogo.CASOS.values():
            print(f"{caso.id}\t{caso.clase}\t{caso.descripcion}")
        return 0

    try:
        seleccion = catalogo.seleccionar(args.casos)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    if args.salida.exists() and any(args.salida.iterdir()):
        print(f"{args.salida} ya tiene contenido; no se sobrescriben resultados.", file=sys.stderr)
        return 2

    parametros = {
        "casos": [c.id for c in seleccion],
        "intentos": args.intentos,
        "control": args.control,
    }
    # El entorno (claves de prueba, bases, registro) vive solo durante la corrida.
    with tempfile.TemporaryDirectory(prefix="secureqr-eval-") as temporal:
        try:
            entorno = Entorno(Path(temporal) / "entorno")
            parametros["servicio"] = entorno.configuracion()
            with entorno:
                filas = ejecutar(
                    entorno, seleccion, intentos=args.intentos, control=args.control,
                    semilla=args.semilla,
                )
        except EntornoError as exc:
            print(exc, file=sys.stderr)
            return 1

    descripcion = describir_entorno(args.semilla, parametros)
    resumen = resumir(filas)
    escribir(args.salida, filas, descripcion, resumen)
    print((args.salida / "informe.md").read_text(encoding="utf-8"))
    errores = sum(len(b["motivos_incorrectos"]) for b in resumen["brazos"].values())
    if errores:
        print(f"{errores} rechazos por un motivo inesperado: la batería tiene un error.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
