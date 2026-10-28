"""Corrida completa por la línea de comandos, solo con el grupo de control (#151)."""

import csv
import json
from pathlib import Path

from secureqr_evaluation.cli import SEMILLA_INFORME, main
from secureqr_evaluation.ejecutor import COLUMNAS


def test_solo_control_da_cero_falso_rechazo_y_escribe_los_archivos(tmp_path: Path) -> None:
    salida = tmp_path / "resultados"
    assert main(["run", "--casos", "control", "--control", "25", "--salida", str(salida)]) == 0

    filas = json.loads((salida / "resultados.json").read_text(encoding="utf-8"))
    assert len(filas) == 25
    assert {f["decision"] for f in filas} == {"aceptado"}
    with (salida / "resultados.csv").open(encoding="utf-8") as archivo:
        lector = csv.DictReader(archivo)
        assert lector.fieldnames == COLUMNAS
        assert len(list(lector)) == 25

    entorno = json.loads((salida / "entorno.json").read_text(encoding="utf-8"))
    assert entorno["semilla"] == SEMILLA_INFORME
    assert entorno["parametros"]["control"] == 25
    assert entorno["parametros"]["servicio"]["token_ttl_seconds"] == 60
    assert entorno["versiones"]["secureqr-id-verifier-service"]
    assert entorno["sistema_operativo"] and entorno["fecha"]

    resumen = json.loads((salida / "resumen.json").read_text(encoding="utf-8"))
    control = resumen["brazos"]["secureqr"]["falso_rechazo"]
    assert (control["intentos"], control["exitos"], control["tasa"]) == (25, 0, 0.0)
    assert resumen["brazos"]["secureqr"]["tiempo_validacion_ms"]["p95"] > 0
    assert "Falso rechazo | 25 | 0 | 0,00 %" in (salida / "informe.md").read_text(encoding="utf-8")


def test_no_sobrescribe_resultados_ni_acepta_casos_desconocidos(tmp_path: Path, capsys) -> None:
    salida = tmp_path / "ocupada"
    salida.mkdir()
    (salida / "resultados.json").write_text("[]")
    assert main(["run", "--casos", "control", "--control", "1", "--salida", str(salida)]) == 2
    assert main(["run", "--casos", "Z9", "--salida", str(tmp_path / "otra")]) == 2
    assert "Casos desconocidos: Z9" in capsys.readouterr().err
    assert (salida / "resultados.json").read_text() == "[]"
