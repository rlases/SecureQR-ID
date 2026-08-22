from __future__ import annotations

import logging
from typing import Protocol

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .verifier import (
    ACCEPTED_MESSAGE,
    REJECTED_MESSAGE,
    ConfigurationError,
    VerificationResult,
)

MAX_TOKEN_TEXT_SIZE = 4096


class TokenVerifier(Protocol):
    def verify(self, token: str) -> VerificationResult:
        """Decide si el token puede aceptarse."""


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    token: str = Field(min_length=1, max_length=MAX_TOKEN_TEXT_SIZE)


class PublicVerification(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    accepted: bool
    message: str


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    status: str


REJECTED_RESPONSE = PublicVerification(
    accepted=False,
    message=REJECTED_MESSAGE,
)


def create_app(
    verifier: TokenVerifier,
    *,
    logger: logging.Logger | None = None,
) -> FastAPI:
    """Crea el adaptador HTTP sin construir dependencias de seguridad implícitas."""

    if verifier is None:
        raise ConfigurationError

    app_logger = logger if logger is not None else logging.getLogger(__name__)
    app = FastAPI(
        title="SecureQR-ID verifier API",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=REJECTED_RESPONSE.model_dump(),
        )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ready")

    @app.post("/api/verify", response_model=PublicVerification)
    def verify_token(payload: VerifyRequest) -> PublicVerification:
        try:
            result = verifier.verify(payload.token)
            if result.accepted is True:
                return PublicVerification(
                    accepted=True,
                    message=ACCEPTED_MESSAGE,
                )
        except Exception:
            try:
                app_logger.warning(
                    "verification_http_rejected",
                    extra={"reason_code": "adapter_failure"},
                )
            except Exception:
                pass
        return REJECTED_RESPONSE

    return app
