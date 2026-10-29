import importlib.util
import json
import csv
import subprocess
from pathlib import Path

import pytest
from secureqr_evaluation.ejecutor import COLUMNAS, Fila

spec = importlib.util.spec_from_file_location("comparar_brazos", Path(__file__).parents[1] / "comparar.py")
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)


def fila(brazo, clase="F", decision="aceptado"):
    rechazado = brazo == "secureqr" and clase == "F" and decision == "rechazado"
    return dict(brazo=brazo, caso="F2" if brazo == "secureqr" and clase == "F" else clase,
                clase=clase, repeticion=1, variante=None, malicioso=clase != "control",
                decision=decision, motivo="signature" if rechazado else None,
                motivo_correcto=True if rechazado else None, ms=1.0)


def archivos(tmp_path):
    tradicional, secureqr = tmp_path / "t.json", tmp_path / "s.json"
    tradicional.write_text(json.dumps([fila("tradicional"), fila("tradicional", "control")]))
    secureqr.write_text(json.dumps([fila("secureqr", decision="rechazado"), fila("secureqr", "control")]))
    return tradicional, secureqr


def test_compara_los_dos_brazos_y_conserva_no_aplica(tmp_path):
    t, s = archivos(tmp_path)
    salida = tmp_path / "informe"
    modulo.comparar(t, s, salida)
    resumen = json.loads((salida / "comparacion.json").read_text())
    assert resumen["brazos"]["tradicional"]["deteccion_por_clase"]["F"]["tasa"] == 0
    assert resumen["brazos"]["secureqr"]["deteccion_por_clase"]["F"]["tasa"] == 1
    texto = (salida / "comparacion.md").read_text()
    assert "| P | Sin intentos | Sin intentos |" in texto
    assert "R y M: no aplican" in texto
    origen = json.loads((salida / "comparacion-origen.json").read_text())["tradicional"]
    assert len(origen["sha256"]) == 64
    assert "\\" not in origen["archivo"]
    assert (salida / origen["archivo"]).resolve() == t.resolve()
    original = (salida / "comparacion.md").read_bytes()
    with pytest.raises(ValueError, match="nueva o vacía"):
        modulo.comparar(t, s, salida)
    assert (salida / "comparacion.md").read_bytes() == original


@pytest.mark.parametrize("cambio", [{"brazo": "secureqr"}, {"malicioso": "False"}, {"ms": float("nan")}, {"decision": "error"}, {"caso": "control"}, {"motivo_correcto": "False"}])
def test_rechaza_filas_no_comparables(tmp_path, cambio):
    entrada = tmp_path / "invalido.json"
    entrada.write_text(json.dumps([{**fila("tradicional"), **cambio}]))
    with pytest.raises(ValueError):
        modulo.cargar(entrada, "tradicional")


def test_no_cuenta_un_intento_duplicado_dos_veces(tmp_path):
    entrada = tmp_path / "duplicado.json"
    entrada.write_text(json.dumps([fila("tradicional"), fila("tradicional")]))
    with pytest.raises(ValueError, match="duplicado"):
        modulo.cargar(entrada, "tradicional")


@pytest.mark.parametrize("cambio", [
    {"caso": "inventado"}, {"clase": "V"}, {"variante": ["firma"]},
    {"motivo_correcto": False}, {"motivo_correcto": None}, {"motivo": "expired"},
])
def test_no_publica_detecciones_de_una_bateria_invalida(tmp_path, cambio):
    t, s = archivos(tmp_path)
    s.write_text(json.dumps([{**fila("secureqr", decision="rechazado"), **cambio}]))
    salida = tmp_path / "informe"
    with pytest.raises(ValueError):
        modulo.comparar(t, s, salida)
    assert not salida.exists()


def test_la_cli_node_exporta_el_contrato_real_de_python(tmp_path):
    baseline = Path(__file__).parents[1]
    salida = tmp_path / "tradicional"
    subprocess.run([
        "node", "--import", "tsx", "src/cli.ts", "--salida", str(salida),
        "--intentos", "1", "--control", "1", "--repo", str(baseline.parents[1]),
    ], cwd=baseline, check=True, capture_output=True, text=True)
    with (salida / "resultados.csv").open() as archivo:
        lector = csv.DictReader(archivo)
        assert lector.fieldnames == COLUMNAS
        assert len(list(lector)) == 4
    filas = modulo.cargar(salida / "resultados.json", "tradicional")
    assert len(filas) == 4
    assert set(filas[0].como_dict()) == set(Fila.__dataclass_fields__)
