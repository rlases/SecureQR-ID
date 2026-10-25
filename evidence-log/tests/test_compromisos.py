"""Compromisos externos de la cabeza de asignaciones_cid (#119). Datos sintéticos."""

import json
import sqlite3
import sys

import pytest

from secureqr_evidence_log.cli import EXIT_ALERT, EXIT_OK, main
from secureqr_evidence_log.compromisos import (
    DECISION,
    Cabeza,
    CommitmentError,
    commit_head,
    commitments,
    parse_head,
)
from secureqr_evidence_log.evidence_log import EvidenceLog

from test_cli import FAKE_ANCHOR, NOW, VID

H1 = "a" * 64
H2 = "b" * 64


def _cabeza(seq, h, **extra):
    return {"version": 1, "fuente": "asignaciones_cid", "seq": seq, "hash": h, **extra}


@pytest.fixture
def entorno(tmp_path):
    db = tmp_path / "evidence.db"
    log = EvidenceLog(str(db))
    for i in range(3):
        log.append_event(f"cred-{i}", "verifier-A", 1000.0 + i, "aceptado")
    log.close()
    script = tmp_path / "fake_anchor.py"
    script.write_text(FAKE_ANCHOR)
    return db, script, tmp_path


def _cycle(entorno, *extra):
    db, script, tmp = entorno
    return main(
        [
            "cycle", "--db", str(db), "--verifier-id", VID, "--workdir", str(tmp / "trabajo"),
            "--anchor-command", f'"{sys.executable}" "{script}" ok', *extra,
        ],
        clock=lambda: NOW,
    )


class TestFormato:
    def test_acepta_la_cabeza_de_mi_app_qr(self):
        assert parse_head(_cabeza(7, H1, generado_en="2026-10-25T00:00:00Z")) == Cabeza(
            "asignaciones_cid", 7, H1
        )

    @pytest.mark.parametrize(
        "datos",
        [
            _cabeza(-1, H1),
            _cabeza(True, H1),
            _cabeza(1, "A" * 64),
            _cabeza(1, "a" * 63),
            {**_cabeza(1, H1), "version": 2},
            {**_cabeza(1, H1), "fuente": "otra"},
            {**_cabeza(1, H1), "nombre": "Ana"},
            [],
        ],
    )
    def test_rechaza_formatos_invalidos_y_campos_de_mas(self, datos):
        with pytest.raises(CommitmentError):
            parse_head(datos)


class TestRegistro:
    def test_registra_una_vez_y_no_contiene_datos_personales(self):
        log = EvidenceLog()
        assert commit_head(log, Cabeza("asignaciones_cid", 3, H1), VID, NOW) is True
        assert commit_head(log, Cabeza("asignaciones_cid", 3, H1), VID, NOW) is False
        eventos = [e for e in log.events if e.decision == DECISION]
        assert [e.credential_id for e in eventos] == [f"asignaciones_cid:3:{H1}"]
        assert log.verify_chain()

    def test_una_cabeza_que_retrocede_o_cambia_de_hash_es_alerta(self):
        log = EvidenceLog()
        commit_head(log, Cabeza("asignaciones_cid", 5, H1), VID, NOW)
        with pytest.raises(CommitmentError, match="retrocede"):
            commit_head(log, Cabeza("asignaciones_cid", 4, H2), VID, NOW)
        with pytest.raises(CommitmentError, match="otro hash"):
            commit_head(log, Cabeza("asignaciones_cid", 5, H2), VID, NOW)
        assert commit_head(log, Cabeza("asignaciones_cid", 6, H2), VID, NOW) is True


class TestCiclo:
    def test_la_cabeza_se_ancla_en_la_misma_corrida(self, entorno):
        db, _, tmp = entorno
        cabeza = tmp / "cabeza.json"
        cabeza.write_text(json.dumps(_cabeza(2, H1)))
        salida = tmp / "compromisos.json"
        assert _cycle(entorno, "--head-file", str(cabeza), "--commitments-file", str(salida)) == EXIT_OK
        datos = json.loads(salida.read_text())
        assert datos["version"] == 1 and datos["cadena_valida"] is True
        [c] = datos["compromisos"]
        assert c["seq"] == 2 and c["hash"] == H1 and c["anclado"] is True
        assert c["transaction_id"].startswith("tx-") and c["block_number"] == 42

    def test_sin_archivo_de_cabeza_igual_ancla_los_pasos(self, entorno):
        _, _, tmp = entorno
        assert _cycle(entorno, "--head-file", str(tmp / "no-existe.json")) == EXIT_OK

    def test_cabeza_que_retrocede_es_alerta_del_ciclo(self, entorno):
        _, _, tmp = entorno
        cabeza = tmp / "cabeza.json"
        cabeza.write_text(json.dumps(_cabeza(9, H1)))
        assert _cycle(entorno, "--head-file", str(cabeza)) == EXIT_OK
        cabeza.write_text(json.dumps(_cabeza(3, H2)))
        assert _cycle(entorno, "--head-file", str(cabeza)) == EXIT_ALERT

    def test_un_compromiso_registrado_pero_aun_sin_anclar(self, entorno):
        db, _, tmp = entorno
        cabeza = tmp / "cabeza.json"
        cabeza.write_text(json.dumps(_cabeza(1, H1)))
        assert main(["commit-head", "--db", str(db), "--verifier-id", VID, "--head", str(cabeza)]) == EXIT_OK
        salida = tmp / "c.json"
        assert main(["export-commitments", "--db", str(db), "--output", str(salida)]) == EXIT_OK
        [c] = json.loads(salida.read_text())["compromisos"]
        assert c["anclado"] is False and c["batch_id"] is None

    def test_si_alguien_altera_la_bitacora_ningun_compromiso_cuenta_como_anclado(self, entorno):
        db, _, tmp = entorno
        cabeza = tmp / "cabeza.json"
        cabeza.write_text(json.dumps(_cabeza(2, H1)))
        assert _cycle(entorno, "--head-file", str(cabeza)) == EXIT_OK
        # Quien controla el equipo quita los disparadores y cambia el hash comprometido.
        conn = sqlite3.connect(db)
        conn.execute("DROP TRIGGER events_no_update")
        conn.execute(
            "UPDATE events SET credential_id = ? WHERE decision = ?",
            (f"asignaciones_cid:2:{H2}", DECISION),
        )
        conn.commit()
        conn.close()
        log = EvidenceLog(str(db))
        cadena_valida, [c] = commitments(log)
        log.close()
        assert cadena_valida is False
        assert c.anclado is False
