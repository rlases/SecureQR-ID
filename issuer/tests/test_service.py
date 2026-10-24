from __future__ import annotations

import base64
import http.client
import json
import logging
import os
import socket
import stat
import subprocess
import sys
import threading

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from conftest import TOKEN_TTL_SECONDS, KeyMaterial
from secureqr_issuer import Issuer, create_credential_id
from secureqr_issuer._encoding import canonical_signed_payload
from secureqr_issuer.cli import main
from secureqr_issuer.service import (
    ServiceError,
    SharedSecret,
    create_server,
    generate_secret_file,
    require_loopback,
)

SECRET = b"s" * 43


@pytest.fixture
def running(issuer: Issuer):
    server = create_server(issuer, SharedSecret(SECRET), "127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def _request(server, method, path, body=None, *, token=SECRET.decode(), headers=None):
    host, port = server.server_address[:2]
    connection = http.client.HTTPConnection(host, port, timeout=5)
    raw = json.dumps(body).encode() if isinstance(body, (dict, list, str)) else body
    all_headers = {"Content-Type": "application/json"}
    if token is not None:
        all_headers["Authorization"] = f"Bearer {token}"
    all_headers.update(headers or {})
    connection.request(method, path, body=raw, headers=all_headers)
    response = connection.getresponse()
    payload = response.read()
    connection.close()
    return response, payload


def _verify_token(token: str, public_key_pem: bytes, cid: str) -> dict:
    fields = cbor2.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
    signature = fields.pop("sig")
    public_key = serialization.load_pem_public_key(public_key_pem)
    public_key.verify(
        encode_dss_signature(
            int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big")
        ),
        canonical_signed_payload(fields),
        ec.ECDSA(hashes.SHA256()),
    )
    assert fields["cid"] == cid
    return fields


def test_emite_un_token_valido_con_el_secreto(running, key_material: KeyMaterial):
    cid = create_credential_id()

    response, payload = _request(running, "POST", "/v1/tokens", {"cid": cid})

    assert response.status == 200
    assert response.getheader("Cache-Control") == "no-store"
    body = json.loads(payload)
    assert body["expires_in"] == TOKEN_TTL_SECONDS
    fields = _verify_token(body["token"], key_material.public_path.read_bytes(), cid)
    assert fields["exp"] - fields["iat"] == TOKEN_TTL_SECONDS


def test_cada_solicitud_lleva_nonce_distinto(running):
    cid = create_credential_id()
    tokens = [json.loads(_request(running, "POST", "/v1/tokens", {"cid": cid})[1])["token"] for _ in range(5)]

    assert len(set(tokens)) == 5


@pytest.mark.parametrize("token", [None, "", "otro-secreto", SECRET.decode() + "x", SECRET.decode()[:-1]])
def test_rechaza_sin_secreto_o_con_secreto_incorrecto(running, token):
    response, payload = _request(running, "POST", "/v1/tokens", {"cid": create_credential_id()}, token=token)

    assert response.status == 401
    assert b"token" not in payload


@pytest.mark.parametrize("scheme", ["Basic", "bearer", "Token"])
def test_exige_el_esquema_bearer(running, scheme):
    response, _ = _request(
        running, "POST", "/v1/tokens", {"cid": create_credential_id()},
        token=None, headers={"Authorization": f"{scheme} {SECRET.decode()}"},
    )

    assert response.status == 401


@pytest.mark.parametrize(
    "body",
    [
        {"cid": "no-es-un-cid"},
        {"cid": 5},
        {"cid": create_credential_id(), "extra": 1},
        {},
        ["cid"],
        "texto",
        b"{no es json",
    ],
)
def test_rechaza_solicitudes_mal_formadas(running, body):
    response, payload = _request(running, "POST", "/v1/tokens", body)

    assert response.status == 400
    assert b"token" not in payload


def test_rechaza_cuerpos_grandes(running):
    response, _ = _request(running, "POST", "/v1/tokens", b"{" + b" " * 2048 + b"}")

    assert response.status == 400


def test_otras_rutas_no_existen(running):
    assert _request(running, "GET", "/v1/tokens")[0].status == 404
    assert _request(running, "POST", "/otra", {"cid": create_credential_id()})[0].status == 404


def test_salud_no_requiere_secreto_ni_revela_nada(running):
    response, payload = _request(running, "GET", "/health", token=None)

    assert response.status == 200
    assert json.loads(payload) == {"status": "ready"}


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.10", "10.0.0.1", "localhost", "ejemplo.local"])
def test_nunca_escucha_fuera_del_bucle_local(issuer, host):
    with pytest.raises(ServiceError):
        create_server(issuer, SharedSecret(SECRET), host, 0)


def test_escucha_solo_en_127_0_0_1(running):
    host, _ = running.server_address[:2]
    assert host == "127.0.0.1"
    assert require_loopback("::1") == "::1"


def test_no_responde_por_otras_interfaces(running):
    _, port = running.server_address[:2]
    addresses = {
        info[4][0]
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        if not info[4][0].startswith("127.")
    }
    if not addresses:
        pytest.skip("el equipo no tiene otra dirección IPv4")
    for address in addresses:
        with pytest.raises(OSError):
            socket.create_connection((address, port), timeout=1).close()


def test_no_registra_secretos_ni_cid_ni_token(running, caplog, key_material):
    cid = create_credential_id()
    with caplog.at_level(logging.DEBUG):
        _request(running, "POST", "/v1/tokens", {"cid": cid})
        _request(running, "POST", "/v1/tokens", {"cid": cid}, token="secreto-equivocado")
        _request(running, "POST", "/v1/tokens", {"cid": "malo"})

    logged = " ".join(r.getMessage() + str(r.__dict__) for r in caplog.records)
    for secret_value in (cid, SECRET.decode(), "secreto-equivocado", key_material.password):
        assert secret_value not in logged
    assert {r.reason_code for r in caplog.records} == {"bad_secret", "bad_cid"}


def test_el_secreto_no_se_expone(tmp_path):
    secret = SharedSecret(SECRET)

    assert SECRET.decode() not in repr(secret)
    with pytest.raises(ServiceError):
        SharedSecret(b"corto")


def test_genera_secreto_sin_sobrescribir_y_con_permisos(tmp_path):
    path = tmp_path / "secretos" / "issuer.secret"

    generate_secret_file(path)

    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert len(path.read_bytes().strip()) >= 32
    SharedSecret.from_file(path)
    before = path.read_bytes()
    with pytest.raises(ServiceError):
        generate_secret_file(path)
    assert path.read_bytes() == before


def test_concurrencia(running):
    cid = create_credential_id()
    results = []

    def call():
        results.append(_request(running, "POST", "/v1/tokens", {"cid": cid})[0].status)

    threads = [threading.Thread(target=call) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert results == [200] * 20


# --- Arranque desde la CLI ------------------------------------------------------


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_serve_pide_la_contrasena_una_vez_y_atiende(key_material: KeyMaterial, tmp_path):
    secret_path = tmp_path / "issuer.secret"
    generate_secret_file(secret_path)
    port = _free_port()
    env = {
        **os.environ,
        "SQRID_PRIVATE_KEY_PATH": str(key_material.private_path),
        "SQRID_TOKEN_TTL_SECONDS": "60",
        "SQRID_ISSUER_SECRET_FILE": str(secret_path),
        "SQRID_PRIVATE_KEY_PASSWORD": key_material.password,
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "secureqr_issuer", "serve", "--port", str(port)],
        env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        ready = process.stdout.readline()
        assert "listo en 127.0.0.1" in ready
        assert key_material.password not in ready
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        cid = create_credential_id()
        connection.request(
            "POST", "/v1/tokens", body=json.dumps({"cid": cid}),
            headers={"Authorization": "Bearer " + secret_path.read_text().strip()},
        )
        response = connection.getresponse()
        assert response.status == 200
        _verify_token(json.loads(response.read())["token"], key_material.public_path.read_bytes(), cid)
    finally:
        process.terminate()
        process.wait(timeout=5)
    stderr = process.stderr.read()
    assert key_material.password not in stderr


def test_serve_en_terminal_pide_la_contrasena(key_material, tmp_path, monkeypatch):
    secret_path = tmp_path / "issuer.secret"
    generate_secret_file(secret_path)
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PATH", str(key_material.private_path))
    monkeypatch.setenv("SQRID_TOKEN_TTL_SECONDS", "60")
    monkeypatch.setenv("SQRID_ISSUER_SECRET_FILE", str(secret_path))
    monkeypatch.delenv("SQRID_PRIVATE_KEY_PASSWORD", raising=False)
    asked = []
    served = []
    monkeypatch.setattr("secureqr_issuer.cli.serve", lambda issuer, secret, host, port: served.append((issuer.kid, host, port)))

    code = main(["serve", "--port", "9999"], prompt=lambda text: asked.append(text) or key_material.password, interactive=True)

    assert code == 0
    assert len(asked) == 1
    assert served == [(key_material.metadata.kid, "127.0.0.1", 9999)]


def test_serve_con_contrasena_incorrecta_no_arranca(key_material, tmp_path, monkeypatch, capsys):
    secret_path = tmp_path / "issuer.secret"
    generate_secret_file(secret_path)
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PATH", str(key_material.private_path))
    monkeypatch.setenv("SQRID_TOKEN_TTL_SECONDS", "60")
    monkeypatch.setenv("SQRID_ISSUER_SECRET_FILE", str(secret_path))
    monkeypatch.setattr("secureqr_issuer.cli.serve", lambda *a: pytest.fail("no debe atender"))
    wrong = "contrasena-equivocada-larga"

    code = main(["serve", "--port", "9999"], prompt=lambda _: wrong, interactive=True)

    assert code == 2
    assert wrong not in capsys.readouterr().err


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.10"])
def test_serve_rechaza_interfaces_de_red(host, monkeypatch, capsys):
    monkeypatch.setattr("secureqr_issuer.cli.serve", lambda *a: pytest.fail("no debe atender"))

    code = main(["serve", "--host", host, "--port", "9999"], prompt=lambda _: pytest.fail("no debe pedir"), interactive=True)

    assert code == 2
    assert "interfaz local" in capsys.readouterr().err


def test_serve_sin_terminal_ni_variable_no_arranca(key_material, tmp_path, monkeypatch, capsys):
    secret_path = tmp_path / "issuer.secret"
    generate_secret_file(secret_path)
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PATH", str(key_material.private_path))
    monkeypatch.setenv("SQRID_TOKEN_TTL_SECONDS", "60")
    monkeypatch.setenv("SQRID_ISSUER_SECRET_FILE", str(secret_path))
    monkeypatch.delenv("SQRID_PRIVATE_KEY_PASSWORD", raising=False)

    code = main(["serve", "--port", "9999"], interactive=False)

    assert code == 2
    assert "terminal" in capsys.readouterr().err


def test_serve_retira_la_contrasena_del_entorno(key_material, tmp_path, monkeypatch):
    secret_path = tmp_path / "issuer.secret"
    generate_secret_file(secret_path)
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PATH", str(key_material.private_path))
    monkeypatch.setenv("SQRID_TOKEN_TTL_SECONDS", "60")
    monkeypatch.setenv("SQRID_ISSUER_SECRET_FILE", str(secret_path))
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PASSWORD", key_material.password)
    monkeypatch.setattr("secureqr_issuer.cli.serve", lambda *a: None)

    assert main(["serve", "--port", "9999"], interactive=False) == 0
    assert "SQRID_PRIVATE_KEY_PASSWORD" not in os.environ


def test_un_rechazo_no_deja_bytes_sin_leer_en_la_conexion(running):
    # Antes, un rechazo sin leer el cuerpo dejaba la conexión abierta y el resto del
    # cuerpo se interpretaba como otra solicitud.
    host, port = running.server_address[:2]
    connection = http.client.HTTPConnection(host, port, timeout=5)
    body = json.dumps({"cid": create_credential_id()})
    connection.request("POST", "/v1/tokens", body=body, headers={"Authorization": "Bearer malo"})
    response = connection.getresponse()
    response.read()

    assert response.status == 401
    assert response.getheader("Connection") == "close"
    connection.close()


def test_errores_de_conexion_no_imprimen_trazas(running, capfd):
    host, port = running.server_address[:2]
    with socket.create_connection((host, port), timeout=5) as sock:
        sock.sendall(b"BASURA\r\n\r\n")
        sock.shutdown(socket.SHUT_WR)
        sock.recv(1024)

    assert "Traceback" not in capfd.readouterr().err
