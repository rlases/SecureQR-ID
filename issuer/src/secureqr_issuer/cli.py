from __future__ import annotations

import argparse
import getpass
import os
import sys
from collections.abc import Callable, Sequence

from .issuer import (
    ConfigurationError,
    Issuer,
    IssuerError,
    create_credential_id,
    create_key_pair,
)
from .service import SharedSecret, generate_secret_file, require_loopback, serve


def _required_environment(name: str) -> str:
    value = os.environ.get(name)
    if value is None or not value:
        raise ConfigurationError(f"Falta la variable de entorno {name}.")
    return value


def _token_ttl() -> int:
    raw_value = _required_environment("SQRID_TOKEN_TTL_SECONDS")
    try:
        value = int(raw_value)
    except ValueError:
        raise ConfigurationError(
            "SQRID_TOKEN_TTL_SECONDS debe ser un entero positivo."
        ) from None
    if value <= 0:
        raise ConfigurationError(
            "SQRID_TOKEN_TTL_SECONDS debe ser un entero positivo."
        )
    return value


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="secureqr-issuer")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("generate-cid", help="genera un cid opaco")
    subparsers.add_parser(
        "generate-key", help="crea un par P-256 cifrado sin sobrescribir archivos"
    )
    issue_parser = subparsers.add_parser("issue", help="emite un token SQRID/1")
    issue_parser.add_argument(
        "--cid",
        required=True,
        help=(
            "cid opaco de 128 bits; si empieza por '-', pasarlo como --cid=<cid> "
            "para que no se confunda con una opcion"
        ),
    )

    secret_parser = subparsers.add_parser(
        "generate-secret",
        help="crea el secreto compartido entre mi-app-qr y el servicio (sin sobrescribir)",
    )
    secret_parser.add_argument("--output", required=True, help="archivo del secreto")

    serve_parser = subparsers.add_parser(
        "serve",
        help="servicio local de emisión: pide la contraseña una vez y escucha en 127.0.0.1",
    )
    serve_parser.add_argument(
        "--host", default="127.0.0.1", help="127.0.0.1 o ::1; nunca otra interfaz"
    )
    serve_parser.add_argument("--port", required=True, type=int)
    return parser


def _service_password(
    prompt: Callable[[str], str], interactive: bool | None
) -> str:
    """La contraseña la escribe el custodio en la terminal al arrancar el servicio.

    Si no hay terminal se acepta `SQRID_PRIVATE_KEY_PASSWORD`, que se retira del
    entorno del proceso apenas se lee.
    """
    if interactive is None:
        interactive = sys.stdin.isatty()
    if interactive:
        return prompt("Contrasena de la clave de emision: ")
    value = os.environ.pop("SQRID_PRIVATE_KEY_PASSWORD", None)
    if not value:
        raise ConfigurationError(
            "Arranca el servicio en una terminal o define SQRID_PRIVATE_KEY_PASSWORD."
        )
    return value


def main(
    argv: Sequence[str] | None = None,
    *,
    prompt: Callable[[str], str] = getpass.getpass,
    interactive: bool | None = None,
) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "generate-cid":
            print(create_credential_id())
            return 0

        if args.command == "generate-secret":
            generate_secret_file(args.output)
            print(f"Secreto creado en {args.output}")
            return 0

        if args.command == "serve":
            host = require_loopback(args.host)
            secret = SharedSecret.from_file(
                _required_environment("SQRID_ISSUER_SECRET_FILE")
            )
            private_key_path = _required_environment("SQRID_PRIVATE_KEY_PATH")
            ttl = _token_ttl()
            issuer = Issuer(
                private_key_path=private_key_path,
                password=_service_password(prompt, interactive),
                token_ttl_seconds=ttl,
            )
            serve(issuer, secret, host, args.port)
            return 0

        password = _required_environment("SQRID_PRIVATE_KEY_PASSWORD")
        private_key_path = _required_environment("SQRID_PRIVATE_KEY_PATH")

        if args.command == "generate-key":
            public_key_path = _required_environment("SQRID_PUBLIC_KEY_PATH")
            metadata = create_key_pair(
                private_key_path=private_key_path,
                public_key_path=public_key_path,
                password=password,
            )
            print(f"kid={metadata.kid}")
            return 0

        issuer = Issuer(
            private_key_path=private_key_path,
            password=password,
            token_ttl_seconds=_token_ttl(),
        )
        print(issuer.issue_token(args.cid))
        return 0
    except IssuerError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
