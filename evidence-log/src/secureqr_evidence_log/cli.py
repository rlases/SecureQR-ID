"""Comandos de anclaje de la bitácora (issue #92, ADR-0017).

    python -m secureqr_evidence_log export-batch   --db BITACORA --verifier-id ID --output lote.json
    python -m secureqr_evidence_log record-receipt --db BITACORA --receipt recibo.json
    python -m secureqr_evidence_log status         --db BITACORA
    python -m secureqr_evidence_log cycle          --db BITACORA --verifier-id ID --workdir DIR \\
        --anchor-command "..." [--status-file estado.json]

`cycle` es lo que ejecuta la tarea programada cada 15 minutos: fija y exporta el lote,
llama a `anchor/` como un proceso aparte (Python y Node no se importan, ADR-0005) y
registra el recibo. `--verifier-id` es el de la instalación (`SQRID_VERIFIER_ID`) y forma
parte del `loteId`. Con `--status-file`, `cycle` escribe al terminar, con reemplazo
atómico, el estado del anclaje en JSON (más `written_at`); `mi-app-qr` solo lo lee y
alerta si `stale` es verdadero o si el archivo tiene más de 2 horas, lo que también
detecta que la tarea programada dejó de correr. Códigos de salida de `cycle`:

    0  lote anclado y registrado, o nada pendiente
    1  el anclaje falló (Fabric caído, red, etc.): no se registró nada; se reintenta
       en la siguiente corrida con el mismo lote
    2  error de uso o de configuración
    3  ALERTA: el recibo no corresponde a la bitácora o contradice uno ya registrado;
       hay que investigar antes de seguir
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

from .evidence_log import (
    DEFAULT_MAX_BATCH_EVENTS,
    DEFAULT_STALE_AFTER_SECONDS,
    AnchoringError,
    AnchorMismatchError,
    AnchorReceipt,
    EvidenceLog,
    _write_json_atomically,
    validate_verifier_id,
)

EXIT_OK = 0
EXIT_ANCHOR_FAILED = 1
EXIT_USAGE = 2
EXIT_ALERT = 3
BATCH_FILE = "lote.json"
RECEIPT_FILE = "recibo.json"


def _open_log(path: str) -> EvidenceLog:
    if path.strip() == ":memory:":
        raise SystemExit("La bitácora debe ser un archivo persistente, no :memory:.")
    if not Path(path).is_file():
        raise SystemExit(f"No existe la bitácora {path}.")
    return EvidenceLog(path)


def _positive_int(value: str) -> int:
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("debe ser un entero positivo")
    return number


def _verifier_id(value: str) -> str:
    try:
        return validate_verifier_id(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from None


def _write_status_file(log: EvidenceLog, path: Path, now: float) -> None:
    status = log.anchoring_status(now).to_json()
    _write_json_atomically(str(path), {**status, "written_at": now})


def _load_receipt(path: Path) -> AnchorReceipt:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise AnchoringError("No existe el archivo del recibo.") from None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        raise AnchoringError("El recibo no es un JSON legible.") from None
    return AnchorReceipt.from_json(data)


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def run_cycle(
    log: EvidenceLog,
    workdir: Path,
    anchor_command: Sequence[str],
    verifier_id: str,
    *,
    max_events: int = DEFAULT_MAX_BATCH_EVENTS,
    timeout_seconds: float = 300,
    clock: Callable[[], float] = time.time,
    out=None,
    err=None,
) -> int:
    out = sys.stdout if out is None else out
    err = sys.stderr if err is None else err
    workdir.mkdir(parents=True, exist_ok=True)
    batch_path = workdir / BATCH_FILE
    receipt_path = workdir / RECEIPT_FILE
    # Archivos de una corrida anterior no deben confundirse con los de esta.
    _remove(batch_path)
    _remove(receipt_path)

    try:
        batch = log.export_pending_batch(str(batch_path), verifier_id, max_events)
    except AnchoringError as exc:
        print(f"ALERTA al fijar el lote: {exc}", file=err)
        return EXIT_ALERT
    if batch is None:
        print("sin eventos pendientes de anclar", file=out)
        return EXIT_OK

    command = [*anchor_command, "--batch", str(batch_path), "--receipt", str(receipt_path)]
    try:
        result = subprocess.run(
            command, timeout=timeout_seconds, capture_output=True, text=True
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"anclaje no disponible ({type(exc).__name__}); se reintentará", file=err)
        return EXIT_ANCHOR_FAILED
    if result.returncode == EXIT_ALERT:
        print(f"ALERTA de anchor/ en {batch.batch_id}: {result.stderr.strip()}", file=err)
        return EXIT_ALERT
    if result.returncode != 0:
        print(
            f"el anclaje de {batch.batch_id} falló (código {result.returncode}); "
            "se reintentará",
            file=err,
        )
        return EXIT_ANCHOR_FAILED

    try:
        receipt = _load_receipt(receipt_path)
        if receipt.batch_id != batch.batch_id:
            raise AnchoringError("El recibo es de otro lote.")
        recorded = log.record_anchor(receipt, recorded_at=clock())
    except AnchoringError as exc:
        print(f"ALERTA en {batch.batch_id}: {exc}", file=err)
        return EXIT_ALERT
    estado = "registrado" if recorded else "ya estaba registrado"
    print(
        f"{batch.batch_id} anclado (transacción {receipt.transaction_id}, "
        f"bloque {receipt.block_number}); {estado}",
        file=out,
    )
    return EXIT_OK


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="secureqr-evidence-log")
    commands = parser.add_subparsers(dest="command", required=True)

    export = commands.add_parser("export-batch", help="exporta el siguiente lote sin anclar")
    export.add_argument("--db", required=True)
    export.add_argument("--verifier-id", required=True, type=_verifier_id)
    export.add_argument("--output", required=True)
    export.add_argument("--max-events", type=_positive_int, default=DEFAULT_MAX_BATCH_EVENTS)

    record = commands.add_parser("record-receipt", help="registra el recibo de un lote anclado")
    record.add_argument("--db", required=True)
    record.add_argument("--receipt", required=True)

    status = commands.add_parser("status", help="estado del anclaje, en JSON, para el panel")
    status.add_argument("--db", required=True)
    status.add_argument(
        "--stale-after-seconds", type=_positive_int, default=DEFAULT_STALE_AFTER_SECONDS
    )

    cycle = commands.add_parser("cycle", help="exportar, anclar y registrar (tarea programada)")
    cycle.add_argument("--db", required=True)
    cycle.add_argument("--verifier-id", required=True, type=_verifier_id)
    cycle.add_argument("--workdir", required=True)
    cycle.add_argument(
        "--status-file",
        help="archivo JSON donde `cycle` deja el estado del anclaje para el panel",
    )
    cycle.add_argument(
        "--anchor-command",
        required=True,
        help='comando de anchor/ sin --batch/--receipt, p. ej. "node dist/cli.js anclar"',
    )
    cycle.add_argument("--max-events", type=_positive_int, default=DEFAULT_MAX_BATCH_EVENTS)
    cycle.add_argument("--timeout-seconds", type=_positive_int, default=300)
    return parser


def main(argv: Sequence[str] | None = None, *, clock: Callable[[], float] = time.time) -> int:
    args = _build_parser().parse_args(argv)
    try:
        log = _open_log(args.db)
    except SystemExit as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    try:
        if args.command == "export-batch":
            batch = log.export_pending_batch(args.output, args.verifier_id, args.max_events)
            print("pendientes=0" if batch is None else f"lote={batch.batch_id} eventos={len(batch.hashes)}")
            return EXIT_OK
        if args.command == "record-receipt":
            try:
                recorded = log.record_anchor(_load_receipt(Path(args.receipt)), clock())
            except AnchorMismatchError as exc:
                print(f"ALERTA: {exc}", file=sys.stderr)
                return EXIT_ALERT
            except AnchoringError as exc:
                print(f"Error: {exc}", file=sys.stderr)
                return EXIT_ALERT
            print("registrado" if recorded else "ya estaba registrado")
            return EXIT_OK
        if args.command == "status":
            status = log.anchoring_status(clock(), args.stale_after_seconds)
            print(json.dumps(status.to_json()))
            return EXIT_OK
        try:
            anchor_command = shlex.split(args.anchor_command, posix=os.name != "nt")
        except ValueError:
            anchor_command = []
        if not anchor_command:
            print("Error: --anchor-command está vacío o mal formado.", file=sys.stderr)
            return EXIT_USAGE
        try:
            return run_cycle(
                log,
                Path(args.workdir),
                anchor_command,
                args.verifier_id,
                max_events=args.max_events,
                timeout_seconds=args.timeout_seconds,
                clock=clock,
            )
        finally:
            if args.status_file:
                _write_status_file(log, Path(args.status_file), clock())
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
