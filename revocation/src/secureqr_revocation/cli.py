"""Línea de comandos de la lista de revocación (issue #81, ADR-0014 y ADR-0015).

    secureqr-revocation generate-key --private-key revocacion.pem --public-dir claves-revocacion/
    secureqr-revocation sign --key revocacion.pem --input revocados.txt --output lista.sqrid

La contraseña de la clave se lee de ``SQRID_REVOCATION_KEY_PASSWORD`` o se pide en la
terminal; nunca se acepta como argumento ni aparece en mensajes.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import getpass
import hashlib
import os
import sys
import tempfile
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from .revocation import RevocationError, RevocationList, read_key_id, sign_revocation_list

PASSWORD_ENV = "SQRID_REVOCATION_KEY_PASSWORD"
MINIMUM_PASSWORD_BYTES = 16
IDENTIFIER_SIZE = 16


class CliError(Exception):
    """Error para quien opera el comando; el mensaje nunca lleva secretos."""


@dataclass(frozen=True, slots=True)
class SignResult:
    key_id: str
    issued_at: int
    revoked: int
    duplicates: int


def key_id_for(public_key: ec.EllipticCurvePublicKey) -> str:
    """`kid` derivado igual que en `issuer/`: SHA-256 del SPKI DER, 16 bytes, base64url."""
    der = public_key.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    digest = hashlib.sha256(der).digest()[:16]
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _password_bytes(password: str) -> bytes:
    encoded = password.encode("utf-8")
    if len(encoded) < MINIMUM_PASSWORD_BYTES:
        raise CliError(
            f"La contraseña de la clave debe tener al menos {MINIMUM_PASSWORD_BYTES} bytes."
        )
    return encoded


def read_password(
    environ: Mapping[str, str],
    *,
    confirm: bool = False,
    prompt: Callable[[str], str] = getpass.getpass,
    interactive: bool | None = None,
) -> bytes:
    value = environ.get(PASSWORD_ENV)
    if value:
        return _password_bytes(value)
    if interactive is None:
        interactive = sys.stdin.isatty()
    if not interactive:
        raise CliError(
            f"Falta la contraseña: define {PASSWORD_ENV} o ejecuta el comando en una terminal."
        )
    first = prompt("Contraseña de la clave de revocación: ")
    if confirm and prompt("Repite la contraseña: ") != first:
        raise CliError("Las contraseñas no coinciden.")
    return _password_bytes(first)


def load_private_key(path: Path, password: bytes) -> ec.EllipticCurvePrivateKey:
    try:
        key = serialization.load_pem_private_key(path.read_bytes(), password=password)
    except FileNotFoundError:
        raise CliError("No existe el archivo de la clave de revocación.") from None
    except (OSError, TypeError, ValueError, UnsupportedAlgorithm):
        # Contraseña incorrecta, archivo sin cifrar o formato inválido: mismo mensaje,
        # sin detalles que ayuden a adivinar.
        raise CliError(
            "No se pudo abrir la clave de revocación: contraseña incorrecta o archivo "
            "inválido."
        ) from None
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(
        key.curve, ec.SECP256R1
    ):
        raise CliError("La clave de revocación debe ser una clave privada P-256.")
    return key


def _valid_cid(value: str) -> bool:
    if len(value) != 22 or "=" in value:
        return False
    try:
        raw = base64.b64decode(value + "==", altchars=b"-_", validate=True)
    except (ValueError, binascii.Error):
        return False
    canonical = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    return len(raw) == IDENTIFIER_SIZE and canonical == value


def read_revoked_ids(path: Path) -> tuple[list[str], int]:
    """Un `cid` por línea; ignora líneas vacías y comentarios (`#`).

    Devuelve los `cid` sin repetir (en el orden en que aparecen) y cuántos duplicados
    se descartaron. Un `cid` mal formado detiene todo: firmar una lista que no revoca lo
    que se pidió es peor que no firmarla.
    """
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        raise CliError("No existe el archivo de cid revocados.") from None
    except (OSError, UnicodeDecodeError):
        raise CliError("No se pudo leer el archivo de cid revocados como UTF-8.") from None

    seen: set[str] = set()
    revoked: list[str] = []
    duplicates = 0
    for number, line in enumerate(text.splitlines(), start=1):
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        if not _valid_cid(value):
            # No se imprime el valor: solo la línea, para que quien opera la ubique.
            raise CliError(
                f"Línea {number}: no es un cid válido (22 caracteres Base64url, 128 bits)."
            )
        if value in seen:
            duplicates += 1
            continue
        seen.add(value)
        revoked.append(value)
    return revoked, duplicates


def _write_atomically(path: Path, data: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def _refuse_unexpected_key_change(
    output_path: Path, key_id: str, allow_key_change: bool
) -> None:
    """Evita reemplazar la lista vigente con una firmada por otra clave.

    El verificador ignora una lista de una clave que no está en su directorio de
    confianza, pero al reiniciarse no arranca y la lista anterior termina por vencer:
    firmar con la clave equivocada dejaría el punto de control rechazando todo.
    """
    if allow_key_change or not output_path.exists():
        return
    try:
        current = read_key_id(output_path.read_bytes())
    except (OSError, RevocationError):
        return  # sin una lista legible no hay nada que proteger
    if current != key_id:
        raise CliError(
            "La lista existente está firmada con otra clave de revocación. Si es una "
            "rotación de clave, repite el comando con --allow-key-change."
        )


def _same_file(first: Path, second: Path) -> bool:
    return first.resolve() == second.resolve()


def sign_command(
    key_path: Path,
    input_path: Path,
    output_path: Path,
    password: bytes,
    *,
    allow_key_change: bool = False,
    clock: Callable[[], float] = time.time,
) -> SignResult:
    if _same_file(output_path, input_path) or _same_file(output_path, key_path):
        raise CliError("La salida no puede ser el archivo de entrada ni la clave.")
    private_key = load_private_key(key_path, password)
    revoked, duplicates = read_revoked_ids(input_path)
    key_id = key_id_for(private_key.public_key())
    _refuse_unexpected_key_change(output_path, key_id, allow_key_change)
    issued_at = int(clock())

    signed = sign_revocation_list(private_key, key_id, revoked, issued_at)
    # Se comprueba la lista recién firmada con la misma verificación que hace el
    # verificador antes de escribirla: nunca se publica algo que luego se rechazaría.
    RevocationList.from_signed_bytes(
        signed, private_key.public_key(), expected_key_id=key_id
    )
    try:
        _write_atomically(output_path, signed, 0o644)
    except OSError:
        raise CliError("No se pudo escribir la lista firmada.") from None
    return SignResult(key_id, issued_at, len(revoked), duplicates)


def generate_key_command(
    private_key_path: Path, public_dir: Path, password: bytes
) -> str:
    """Crea el par P-256 de revocación; nunca sobrescribe y deja el público como `<kid>.pem`."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    key_id = key_id_for(private_key.public_key())
    public_path = public_dir / f"{key_id}.pem"
    if private_key_path.exists() or public_path.exists():
        raise CliError("No se sobrescribe material criptográfico existente.")

    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.BestAvailableEncryption(password),
    )
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    try:
        private_key_path.parent.mkdir(parents=True, exist_ok=True)
        public_dir.mkdir(parents=True, exist_ok=True)
        for path, content, mode in (
            (private_key_path, private_pem, 0o600),
            (public_path, public_pem, 0o644),
        ):
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
            with os.fdopen(os.open(path, flags, mode), "wb") as file:
                file.write(content)
    except FileExistsError:
        raise CliError("No se sobrescribe material criptográfico existente.") from None
    except OSError:
        raise CliError("No se pudo escribir el par de claves.") from None
    return key_id


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="secureqr-revocation",
        description=(
            f"Firma listas de revocación SQRID-REVOKE/1. La contraseña se lee de "
            f"{PASSWORD_ENV} o se pide en la terminal."
        ),
    )
    commands = parser.add_subparsers(dest="command", required=True)

    generate = commands.add_parser(
        "generate-key", help="crea el par de claves de revocación (P-256, PEM cifrado)"
    )
    generate.add_argument("--private-key", required=True, type=Path)
    generate.add_argument(
        "--public-dir",
        required=True,
        type=Path,
        help="directorio de confianza del verificador (SQRID_REVOCATION_KEYS_DIR)",
    )

    sign = commands.add_parser(
        "sign", help="firma un archivo de cid revocados (uno por línea) con iat = ahora"
    )
    sign.add_argument("--key", required=True, type=Path, help="PEM cifrado de revocación")
    sign.add_argument("--input", required=True, type=Path, help="cid revocados")
    sign.add_argument("--output", required=True, type=Path, help="lista firmada")
    sign.add_argument(
        "--allow-key-change",
        action="store_true",
        help="permite reemplazar una lista firmada con otra clave (rotación de clave)",
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    prompt: Callable[[str], str] = getpass.getpass,
    interactive: bool | None = None,
    clock: Callable[[], float] = time.time,
) -> int:
    args = _build_parser().parse_args(argv)
    env = os.environ if environ is None else environ
    try:
        if args.command == "generate-key":
            password = read_password(
                env, confirm=True, prompt=prompt, interactive=interactive
            )
            key_id = generate_key_command(args.private_key, args.public_dir, password)
            print(f"kid={key_id}")
            return 0

        password = read_password(env, prompt=prompt, interactive=interactive)
        result = sign_command(
            args.key,
            args.input,
            args.output,
            password,
            allow_key_change=args.allow_key_change,
            clock=clock,
        )
        print(
            f"kid={result.key_id} iat={result.issued_at} revocados={result.revoked}"
            + (f" duplicados_descartados={result.duplicates}" if result.duplicates else "")
        )
        return 0
    except (CliError, RevocationError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
