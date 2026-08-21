from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from ._encoding import (
    MAX_CBOR_TIMESTAMP,
    SIGNATURE_SIZE,
    TOKEN_VERSION,
    TokenClaims,
    canonical_signed_payload,
    parse_token,
)
from .keys import PublicKeyResolver, validate_public_key
from .replay import ReplayStore

P256_ORDER = int(
    "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
    16,
)
P256_SCALAR_SIZE = 32
MAX_CLOCK_SKEW_SECONDS = 60
REJECTED_MESSAGE = "Token rechazado."
ACCEPTED_MESSAGE = "Token aceptado."


class VerifierError(Exception):
    """Error base de configuracion del verificador."""


class ConfigurationError(VerifierError):
    """La configuracion requerida esta ausente o fuera de limites."""


class RevocationChecker(Protocol):
    def is_revoked(self, credential_id: str) -> bool:
        """Indica si la credencial opaca esta revocada."""


@dataclass(frozen=True, slots=True)
class VerificationResult:
    accepted: bool
    credential_id: str | None
    message: str


REJECTED_RESULT = VerificationResult(False, None, REJECTED_MESSAGE)


class Verifier:
    """Valida SQRID/1 en orden estricto y falla cerrado."""

    __slots__ = (
        "_clock",
        "_clock_skew_seconds",
        "_key_resolver",
        "_logger",
        "_replay_store",
        "_revocation_checker",
    )

    def __init__(
        self,
        key_resolver: PublicKeyResolver,
        replay_store: ReplayStore,
        revocation_checker: RevocationChecker,
        clock_skew_seconds: int,
        *,
        clock: Callable[[], float] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        if (
            isinstance(clock_skew_seconds, bool)
            or not isinstance(clock_skew_seconds, int)
            or not 0 <= clock_skew_seconds <= MAX_CLOCK_SKEW_SECONDS
        ):
            raise ConfigurationError
        if key_resolver is None or replay_store is None or revocation_checker is None:
            raise ConfigurationError

        self._key_resolver = key_resolver
        self._replay_store = replay_store
        self._revocation_checker = revocation_checker
        self._clock_skew_seconds = clock_skew_seconds
        self._clock = clock if clock is not None else time.time
        self._logger = logger if logger is not None else logging.getLogger(__name__)

    def _reject(self, reason_code: str) -> VerificationResult:
        try:
            self._logger.warning(
                "verification_rejected",
                extra={"reason_code": reason_code},
            )
        except Exception:
            pass
        return REJECTED_RESULT

    @staticmethod
    def _signature_der(claims: TokenClaims) -> bytes:
        if len(claims.signature) != SIGNATURE_SIZE:
            raise InvalidSignature
        r = int.from_bytes(claims.signature[:P256_SCALAR_SIZE], "big")
        s = int.from_bytes(claims.signature[P256_SCALAR_SIZE:], "big")
        if not 1 <= r < P256_ORDER or not 1 <= s <= P256_ORDER // 2:
            raise InvalidSignature
        return encode_dss_signature(r, s)

    def _verify_signature(self, claims: TokenClaims) -> bool:
        try:
            public_key = self._key_resolver.resolve(claims.key_id)
            public_key = validate_public_key(public_key, claims.key_id)
            public_key.verify(
                self._signature_der(claims),
                canonical_signed_payload(claims.signed_fields()),
                ec.ECDSA(hashes.SHA256()),
            )
            return claims.version == TOKEN_VERSION
        except Exception:
            return False

    def _now(self) -> int:
        value = self._clock()
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError
        now = int(value)
        if now < 0 or now > MAX_CBOR_TIMESTAMP:
            raise ValueError
        return now

    def verify(self, token: str) -> VerificationResult:
        try:
            claims = parse_token(token)
        except Exception:
            return self._reject("token_format")

        if not self._verify_signature(claims):
            return self._reject("signature")

        try:
            now = self._now()
            if not self._replay_store.observe_time(now, self._clock_skew_seconds):
                return self._reject("clock_rollback")
        except Exception:
            return self._reject("clock_unavailable")

        if claims.expires_at <= claims.issued_at:
            return self._reject("time_range")
        if claims.issued_at > now + self._clock_skew_seconds:
            return self._reject("not_yet_valid")
        if now >= claims.expires_at + self._clock_skew_seconds:
            return self._reject("expired")

        try:
            if self._replay_store.has_seen(claims.key_id, claims.nonce, now):
                return self._reject("replay")
        except Exception:
            return self._reject("replay_unavailable")

        try:
            revoked = self._revocation_checker.is_revoked(claims.credential_id)
            if type(revoked) is not bool:
                return self._reject("revocation_invalid")
            if revoked:
                return self._reject("revoked")
        except Exception:
            return self._reject("revocation_unavailable")

        try:
            consumed = self._replay_store.consume(
                claims.key_id,
                claims.nonce,
                claims.expires_at + self._clock_skew_seconds,
                now,
            )
        except Exception:
            return self._reject("replay_unavailable")
        if not consumed:
            return self._reject("replay")

        return VerificationResult(True, claims.credential_id, ACCEPTED_MESSAGE)
