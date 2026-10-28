import pytest
from secureqr_evaluation.ejecutor import Fila, resumir
from secureqr_evaluation.metricas import percentil, tiempos, wilson


def test_wilson_de_200_sobre_200_da_un_limite_inferior_de_98_por_ciento() -> None:
    bajo, alto = wilson(200, 200)
    assert bajo == pytest.approx(0.98116, abs=1e-5)
    assert alto == 1.0


def test_wilson_coincide_con_la_formula_en_un_caso_intermedio() -> None:
    # Valor de referencia: 8 de 10 con z = 1,96 → (0,4902; 0,9433).
    bajo, alto = wilson(8, 10)
    assert bajo == pytest.approx(0.4902, abs=1e-4)
    assert alto == pytest.approx(0.9433, abs=1e-4)


def test_wilson_sin_intentos_no_inventa_una_tasa() -> None:
    assert wilson(0, 0) is None


def test_percentil_por_rango_mas_cercano() -> None:
    valores = [float(v) for v in range(1, 101)]
    assert percentil(valores, 0.95) == 95.0
    assert percentil([3.0], 0.95) == 3.0
    assert tiempos([1.0, 2.0, 3.0, 10.0]) == {"media": 4.0, "mediana": 2.5, "p95": 10.0}
    assert tiempos([]) is None


def _fila(caso: str, clase: str, malicioso: bool, decision: str, motivo=None, correcto=None) -> Fila:
    return Fila("secureqr", caso, clase, 1, None, malicioso, decision, motivo, correcto, 1.0)


def test_resumen_por_clase_global_falso_rechazo_y_motivos_incorrectos() -> None:
    filas = [
        _fila("control", "control", False, "aceptado"),
        _fila("control", "control", False, "rechazado", "replay"),
        _fila("F2", "F", True, "rechazado", "signature", True),
        _fila("F2", "F", True, "aceptado"),
        _fila("P1", "P", True, "rechazado", "token_format", False),
    ]
    r = resumir(filas)["brazos"]["secureqr"]
    assert r["deteccion_global"]["intentos"] == 3
    assert r["deteccion_global"]["exitos"] == 2
    assert r["deteccion_por_clase"]["F"]["tasa"] == 0.5
    assert r["deteccion_por_clase"]["P"]["tasa"] == 1.0
    assert r["falso_rechazo"]["tasa"] == 0.5
    assert r["motivos_incorrectos"] == [{"caso": "P1", "repeticion": 1, "motivo": "token_format"}]
