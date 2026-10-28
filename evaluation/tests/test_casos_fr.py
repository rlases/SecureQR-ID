"""Casos F y R contra un verifier-service real (#152)."""

import random
from pathlib import Path

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from secureqr_evaluation import CASOS, Entorno, sqrid
from secureqr_evaluation.casos_fr import CAMPOS_F3

IDS = ["F1", "F2", "F3", "F4", "R1", "R2", "R3"]


@pytest.fixture(scope="module")
def entorno(tmp_path_factory: pytest.TempPathFactory):
    with Entorno(tmp_path_factory.mktemp("fr") / "entorno") as e:
        yield e


@pytest.mark.parametrize("caso_id", IDS)
def test_cada_caso_se_rechaza_por_el_motivo_esperado(entorno: Entorno, caso_id: str) -> None:
    caso = CASOS[caso_id]
    assert caso.malicioso and caso.clase == caso_id[0]
    rng = random.Random(f"prueba:{caso_id}")
    for i in range(len(CAMPOS_F3)):
        p = caso.intentar(entorno, rng, i)
        assert p.aceptado is False
        assert p.motivo in caso.motivos_esperados, (caso_id, p.variante, p.motivo)


def test_f1_prueba_bytes_sueltos_y_mapas_con_forma(entorno: Entorno) -> None:
    rng = random.Random(1)
    motivos = {
        (p.variante, p.motivo)
        for p in (CASOS["F1"].intentar(entorno, rng, i) for i in range(4))
    }
    assert motivos == {("bytes", "token_format"), ("mapa", "signature")}


def test_f3_recorre_los_cinco_campos_firmados(entorno: Entorno) -> None:
    rng = random.Random(2)
    variantes = [CASOS["F3"].intentar(entorno, rng, i).variante for i in range(10)]
    assert variantes == list(CAMPOS_F3) * 2


def _verifica(publica: ec.EllipticCurvePublicKey, campos: dict) -> bool:
    firmados = {k: campos[k] for k in sqrid.CAMPOS_FIRMADOS}
    r = int.from_bytes(campos["sig"][:32], "big")
    s = int.from_bytes(campos["sig"][32:], "big")
    try:
        publica.verify(
            encode_dss_signature(r, s),
            cbor2.dumps(firmados, canonical=True),
            ec.ECDSA(hashes.SHA256()),
        )
    except Exception:
        return False
    return True


def test_f4_y_r3_presentan_firmas_matematicamente_validas(entorno: Entorno) -> None:
    """Si F4 y R3 se rechazan, es por la regla (low-S, clave de emisión), no por la firma."""
    emision = entorno.cargar_privada(entorno.emision_privada)
    campos = sqrid.decodificar(entorno.emisor().issue_token("AAAAAAAAAAAAAAAAAAAAAA"))
    s = int.from_bytes(campos["sig"][32:], "big")
    alto = {**campos, "sig": campos["sig"][:32] + (sqrid.ORDEN_P256 - s).to_bytes(32, "big")}
    assert _verifica(emision.public_key(), alto)

    revocacion = entorno.cargar_privada(entorno.revocacion_privada)
    firmado = sqrid.firmar(revocacion, {**campos, "kid": entorno.kid_revocacion})
    assert _verifica(revocacion.public_key(), firmado)
    assert sqrid.kid_de(revocacion.public_key()) == entorno.kid_revocacion


def test_la_corrida_con_f_y_r_no_tiene_motivos_inesperados(tmp_path: Path) -> None:
    from secureqr_evaluation.cli import main
    import json

    salida = tmp_path / "r"
    assert main(["run", "--casos", ",".join(IDS), "--intentos", "5", "--control", "5",
                 "--salida", str(salida)]) == 0
    resumen = json.loads((salida / "resumen.json").read_text(encoding="utf-8"))
    brazo = resumen["brazos"]["secureqr"]
    assert brazo["deteccion_por_clase"]["F"] | {"ic95": None} == {
        "intentos": 20, "exitos": 20, "tasa": 1.0, "ic95": None,
    }
    assert brazo["deteccion_por_clase"]["R"]["exitos"] == 15
    assert brazo["motivos_incorrectos"] == []
