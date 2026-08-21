from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence

from .issuer import (
    ConfigurationError,
    Issuer,
    IssuerError,
    create_credential_id,
    create_key_pair,
)


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
    issue_parser.add_argument("--cid", required=True, help="cid opaco de 128 bits")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "generate-cid":
            print(create_credential_id())
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
