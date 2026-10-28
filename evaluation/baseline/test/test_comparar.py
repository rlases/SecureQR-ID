import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("comparar_brazos", Path(__file__).parents[1] / "comparar.py")
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)


def fila(brazo, clase="F", decision="aceptado"):
    return dict(brazo=brazo, caso=clase, clase=clase, repeticion=1, malicioso=clase != "control",
                decision=decision, motivo=None, motivo_correcto=None, ms=1.0)


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
    assert len(json.loads((salida / "comparacion-origen.json").read_text())["tradicional"]["sha256"]) == 64
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
