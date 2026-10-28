"""Casos M (manipulación interna) contra el sistema real (#154)."""

import os
from pathlib import Path

import pytest
from secureqr_evaluation import CASOS, Entorno
from secureqr_evaluation.casos import CONTROL, seleccionar
from secureqr_evaluation.casos_m import VARIANTES_M1, VARIANTES_M2, VARIANTES_M3
from secureqr_evaluation.ejecutor import ejecutar
from secureqr_evaluation.mi_app_qr import SERVIDOR

FABRIC_HOME = Path(os.environ.get("SQRID_FABRIC_HOME", Path.home() / "secureqr-fabric"))


@pytest.fixture
def entorno(tmp_path: Path):
    with Entorno(tmp_path / "entorno") as e:
        yield e


def _correr(entorno: Entorno, caso_id: str, intentos: int) -> list:
    filas = ejecutar(entorno, [CASOS[caso_id], CASOS[CONTROL]], intentos=intentos, control=2, semilla=3)
    propias = [f for f in filas if f.caso == caso_id]
    assert [f.decision for f in propias] == ["rechazado"] * intentos
    assert all(f.motivo_correcto for f in propias), [(f.variante, f.motivo) for f in propias]
    # El entorno queda sano: un titular legítimo sigue entrando.
    assert [f.decision for f in filas if f.caso == CONTROL] == ["aceptado"] * 2
    return propias


def test_m1_el_servicio_no_arranca_sobre_una_bitacora_alterada(entorno: Entorno) -> None:
    filas = _correr(entorno, "M1", 6)
    assert [f.variante for f in filas] == list(VARIANTES_M1) * 2


@pytest.mark.skipif(
    not (SERVIDOR / "dist" / "index.js").is_file(),
    reason="M3 necesita mi-app-qr/server compilado (npm run build)",
)
def test_m3_la_integridad_del_historial_detecta_la_alteracion(entorno: Entorno) -> None:
    filas = _correr(entorno, "M3", 3)
    assert [f.variante for f in filas] == list(VARIANTES_M3)
    assert "M3" not in entorno.estado


@pytest.mark.skipif(
    not (FABRIC_HOME / "RED_CREADA").is_file(),
    reason="M2 necesita la red Fabric de infra/fabric/ (crear-red.sh)",
)
def test_m2_la_raiz_reescrita_no_coincide_con_fabric(entorno: Entorno) -> None:
    filas = _correr(entorno, "M2", 2)
    assert [f.variante for f in filas] == list(VARIANTES_M2)


def test_m2_solo_corre_con_fabric() -> None:
    assert "M2" not in [c.id for c in seleccionar("todos")]
    assert "M2" in [c.id for c in seleccionar("todos", frozenset({"fabric"}))]
    with pytest.raises(ValueError, match="--con-fabric"):
        seleccionar("M2")
