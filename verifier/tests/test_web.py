from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient
from secureqr_verifier import ConfigurationError, VerificationResult
from secureqr_verifier.web import create_app


class StubVerifier:
    def __init__(
        self,
        result: VerificationResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result
        self.error = error
        self.tokens: list[str] = []

    def verify(self, token: str) -> VerificationResult:
        self.tokens.append(token)
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


def test_factory_requires_an_explicit_verifier() -> None:
    with pytest.raises(ConfigurationError):
        create_app(None)  # type: ignore[arg-type]


def test_acceptance_exposes_no_credential_identifier() -> None:
    verifier = StubVerifier(
        VerificationResult(True, "opaque-credential", "Token aceptado.")
    )
    client = TestClient(create_app(verifier))

    response = client.post("/api/verify", json={"token": "opaque-token"})

    assert response.status_code == 200
    assert response.json() == {"accepted": True, "message": "Token aceptado."}
    assert "opaque-credential" not in response.text
    assert verifier.tokens == ["opaque-token"]


def test_rejection_preserves_the_generic_public_contract() -> None:
    verifier = StubVerifier(
        VerificationResult(False, None, "Token rechazado.")
    )
    client = TestClient(create_app(verifier))

    response = client.post("/api/verify", json={"token": "opaque-token"})

    assert response.status_code == 200
    assert response.json() == {"accepted": False, "message": "Token rechazado."}


def test_unexpected_adapter_failure_fails_closed_without_logging_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    token = "token-that-must-not-be-logged"
    verifier = StubVerifier(error=RuntimeError("sensitive internal detail"))
    client = TestClient(create_app(verifier))
    caplog.set_level(logging.WARNING)

    response = client.post("/api/verify", json={"token": token})

    assert response.status_code == 200
    assert response.json() == {"accepted": False, "message": "Token rechazado."}
    logged = " ".join(
        str(value)
        for record in caplog.records
        for value in record.__dict__.values()
    )
    assert token not in logged
    assert "sensitive internal detail" not in logged


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"token": ""},
        {"token": "a", "extra": True},
        {"token": 123},
        {"token": "a" * 4097},
    ],
)
def test_invalid_requests_return_only_the_generic_rejection(
    body: dict[str, object],
) -> None:
    verifier = StubVerifier(
        VerificationResult(True, "must-not-leak", "Token aceptado.")
    )
    client = TestClient(create_app(verifier))

    response = client.post("/api/verify", json=body)

    assert response.status_code == 400
    assert response.json() == {"accepted": False, "message": "Token rechazado."}
    assert verifier.tokens == []


def test_api_disables_caching_and_interactive_documentation() -> None:
    verifier = StubVerifier(
        VerificationResult(False, None, "Token rechazado.")
    )
    client = TestClient(create_app(verifier))

    health = client.get("/api/health")

    assert health.status_code == 200
    assert health.json() == {"status": "ready"}
    assert health.headers["cache-control"] == "no-store"
    assert health.headers["x-content-type-options"] == "nosniff"
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
