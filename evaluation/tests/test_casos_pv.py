"""Casos P y V contra un verifier-service real (#153)."""

import json
from pathlib import Path

import pytest
from secureqr_evaluation import CASOS, Entorno
from secureqr_evaluation.casos import CONTROL
from secureqr_evaluation.cli import main
from secureqr_evaluation.ejecutor import ejecutar
from secureqr_evidence_log.evidence_log import EvidenceLog

IDS = ["P1", "P2", "P3", "P4", "P5", "V1", "V2"]


@pytest.fixture(scope="module")
def entorno(tmp_path_factory: pytest.TempPathFactory):
    with Entorno(tmp_path_factory.mktemp("pv") / "entorno") as e:
        yield e


def _eventos(entorno: Entorno) -> int:
    bitacora = EvidenceLog(str(entorno.base_bitacora))
    try:
        assert bitacora.verify_chain() is True
        return len(bitacora.events)
    finally:
        bitacora.close()


@pytest.mark.parametrize("caso_id", IDS)
def test_cada_caso_se_rechaza_por_el_motivo_esperado_y_deja_el_entorno_sano(
    entorno: Entorno, caso_id: str
) -> None:
    filas = ejecutar(
        entorno, [CASOS[caso_id], CASOS[CONTROL]], intentos=3, control=2, semilla=7
    )
    propias = [f for f in filas if f.caso == caso_id]
    assert [f.decision for f in propias] == ["rechazado"] * 3
    assert all(f.motivo_correcto for f in propias), [f.motivo for f in propias]
    # Después del caso (y de su cierre), un titular legítimo sigue entrando.
    assert [f.decision for f in filas if f.caso == CONTROL] == ["aceptado"] * 2


def test_p2_deja_entrar_exactamente_una_de_las_dos_presentaciones(entorno: Entorno) -> None:
    antes = _eventos(entorno)
    entorno.detener()
    entorno.iniciar()
    p = CASOS["P2"].intentar(entorno, None, 0)
    assert (p.aceptado, p.motivo) == (False, "replay")
    entorno.detener()
    assert _eventos(entorno) == antes + 1
    entorno.iniciar()


def test_v2_no_deja_el_servicio_con_la_lista_vencida(entorno: Entorno) -> None:
    caso = CASOS["V2"]
    caso.preparar(entorno, 1)
    assert caso.intentar(entorno, None, 0).motivo == "revocation_unavailable"
    caso.terminar(entorno)
    assert CASOS[CONTROL].intentar(entorno, None, 0).aceptado is True


def test_corrida_de_p_y_v_por_la_cli(tmp_path: Path) -> None:
    salida = tmp_path / "r"
    assert main(["run", "--casos", "control," + ",".join(IDS), "--intentos", "3",
                 "--control", "3", "--salida", str(salida)]) == 0
    brazo = json.loads((salida / "resumen.json").read_text(encoding="utf-8"))["brazos"]["secureqr"]
    assert brazo["deteccion_por_clase"]["P"]["exitos"] == 15
    assert brazo["deteccion_por_clase"]["V"]["exitos"] == 6
    assert brazo["falso_rechazo"]["exitos"] == 0
    assert brazo["motivos_incorrectos"] == []
