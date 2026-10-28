"""Casos M (manipulación interna de la evidencia) de ADR-0019, punto 3 (#154).

La batería altera las bases **a propósito y solo en la carpeta temporal de la corrida**:
la bitácora real sigue siendo de solo agregar. Para alterarlas hace lo que haría alguien
con acceso al archivo: quita el disparador de solo agregar y escribe directo en SQLite.
Después de cada intento restaura la base y comprueba que el sistema vuelve a estar sano,
para que un intento no contamine el siguiente.

- M1: el servicio no arranca sobre una bitácora alterada (`verify_chain()` al iniciar).
- M2: una bitácora reescrita con la cadena recalculada pasa `verify_chain()`, pero su raíz
  ya no coincide con la anclada en Fabric (`anchor verificar`). Necesita la red real.
- M3: `GET /api/titulares/integridad` de mi-app-qr marca la alerta por el HMAC.

Límite declarado: quitar el **último** eslabón de una cadena no rompe ninguna verificación
local, porque lo que queda sigue encadenado. Eso solo se detecta contra lo anclado en
Fabric (M2), así que M1 y M3 quitan eslabones intermedios.
"""

from __future__ import annotations

import json
import os
import random
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from secureqr_evidence_log.evidence_log import EvidenceLog
from secureqr_issuer import create_credential_id

from .casos import Caso, registrar
from .casos_pv import CasoError
from .entorno import Entorno, Presentacion
from .mi_app_qr import RAIZ_REPOSITORIO, MiAppQr, MiAppQrError

EVENTOS_MINIMOS = 5
TITULARES_M3 = 6


class _Disparadores:
    """Quita los disparadores de solo agregar de una tabla y los vuelve a crear igual."""

    def __init__(self, conexion: sqlite3.Connection, tabla: str) -> None:
        self._conexion = conexion
        self._sql = [
            fila[0]
            for fila in conexion.execute(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", (tabla,)
            )
        ]
        self._nombres = [
            fila[0]
            for fila in conexion.execute(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", (tabla,)
            )
        ]

    def __enter__(self) -> sqlite3.Connection:
        for nombre in self._nombres:
            self._conexion.execute(f'DROP TRIGGER "{nombre}"')
        return self._conexion

    def __exit__(self, *_: object) -> None:
        for sql in self._sql:
            self._conexion.execute(sql)
        self._conexion.commit()


# --- M1: bitácora de evidence-log -----------------------------------------------------

VARIANTES_M1 = ("editar", "borrar", "reordenar")
COLUMNAS_EVENTO = ("credential_id", "verifier_id", "timestamp", "decision", "previous_hash", "hash")


def _m1_preparar(entorno: Entorno, total: int) -> None:
    for _ in range(EVENTOS_MINIMOS):
        token = entorno.emisor().issue_token(create_credential_id())
        if not entorno.verificar(token).aceptado:
            raise CasoError("No se pudo poblar la bitácora con eventos legítimos.")


def _alterar_bitacora(ruta: Path, variante: str, rng: random.Random) -> None:
    conexion = sqlite3.connect(ruta)
    try:
        seqs = [fila[0] for fila in conexion.execute("SELECT seq FROM events ORDER BY seq")]
        with _Disparadores(conexion, "events") as c:
            if variante == "editar":
                # Atribuir el evento a otra credencial, sin recalcular su hash.
                c.execute(
                    "UPDATE events SET credential_id = ? WHERE seq = ?",
                    (create_credential_id(), rng.choice(seqs)),
                )
            elif variante == "borrar":
                c.execute("DELETE FROM events WHERE seq = ?", (rng.choice(seqs[:-1]),))
            else:
                a, b = sorted(rng.sample(seqs, 2))
                filas = {
                    s: c.execute(
                        f"SELECT {', '.join(COLUMNAS_EVENTO)} FROM events WHERE seq = ?", (s,)
                    ).fetchone()
                    for s in (a, b)
                }
                asignar = ", ".join(f"{col} = ?" for col in COLUMNAS_EVENTO)
                c.execute(f"UPDATE events SET {asignar} WHERE seq = ?", (*filas[b], a))
                c.execute(f"UPDATE events SET {asignar} WHERE seq = ?", (*filas[a], b))
    finally:
        conexion.close()


def _m1(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    variante = VARIANTES_M1[i % len(VARIANTES_M1)]
    entorno.detener()
    respaldo = entorno.base_bitacora.with_suffix(".respaldo")
    shutil.copy2(entorno.base_bitacora, respaldo)
    try:
        _alterar_bitacora(entorno.base_bitacora, variante, rng)
        inicio = time.perf_counter()
        rechazo = entorno.intentar_iniciar()
        ms = (time.perf_counter() - inicio) * 1000
        if rechazo is None:
            entorno.detener()
            resultado = Presentacion(True, None, ms, variante)
        else:
            motivo = "verify_chain" if "verify_chain()" in rechazo else "arranque"
            resultado = Presentacion(False, motivo, ms, variante)
    finally:
        respaldo.replace(entorno.base_bitacora)
    entorno.iniciar()
    return resultado


# --- M3: historial cid → titular de mi-app-qr -----------------------------------------

VARIANTES_M3 = ("editar_cid", "reasignar", "borrar")


def _evidence_log(*argumentos: str) -> None:
    resultado = subprocess.run(
        [sys.executable, "-m", "secureqr_evidence_log", *argumentos],
        capture_output=True, text=True, timeout=60,
    )
    if resultado.returncode != 0:
        raise CasoError(f"evidence-log {argumentos[0]} falló: {resultado.stderr.strip()}")


def _m3_preparar(entorno: Entorno, total: int) -> None:
    try:
        app = MiAppQr(entorno.carpeta / "mi-app-qr")
        app.iniciar()
        entorno.estado["M3"] = app
        app.poblar(TITULARES_M3)
        # La cabeza se escribe al arrancar; evidence-log la registra y exporta los
        # compromisos que mi-app-qr compara (el ciclo real, sin anclar en Fabric).
        app.reiniciar()
    except MiAppQrError as exc:
        raise CasoError(str(exc)) from None
    bitacora = entorno.carpeta / "mi-app-qr" / "bitacora-compromisos.sqlite3"
    EvidenceLog(str(bitacora)).close()
    _evidence_log("commit-head", "--db", str(bitacora), "--verifier-id", "evaluacion-m3",
                  "--head", str(app.cabeza))
    _evidence_log("export-commitments", "--db", str(bitacora), "--output", str(app.compromisos))
    if app.integridad().get("estado") != "ok":
        raise CasoError("El historial de mi-app-qr no verifica antes de alterarlo.")


def _m3(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    app = entorno.estado["M3"]
    assert isinstance(app, MiAppQr)
    variante = VARIANTES_M3[i % len(VARIANTES_M3)]
    conexion = sqlite3.connect(app.base)
    try:
        originales = conexion.execute("SELECT * FROM asignaciones_cid ORDER BY seq").fetchall()
        seqs = [fila[0] for fila in originales]
        with _Disparadores(conexion, "asignaciones_cid") as c:
            if variante == "editar_cid":
                c.execute("UPDATE asignaciones_cid SET cid = ? WHERE seq = ?",
                          (create_credential_id(), rng.choice(seqs)))
            elif variante == "reasignar":
                # Atribuir un cid a otro titular: intercambia las referencias opacas.
                a, b = rng.sample(seqs, 2)
                refs = dict(c.execute(
                    "SELECT seq, titular_ref FROM asignaciones_cid WHERE seq IN (?, ?)", (a, b)
                ).fetchall())
                c.execute("UPDATE asignaciones_cid SET titular_ref = ? WHERE seq = ?", (refs[b], a))
                c.execute("UPDATE asignaciones_cid SET titular_ref = ? WHERE seq = ?", (refs[a], b))
            else:
                c.execute("DELETE FROM asignaciones_cid WHERE seq = ?", (rng.choice(seqs[:-1]),))
        inicio = time.perf_counter()
        verificacion = app.integridad()
        ms = (time.perf_counter() - inicio) * 1000
        # Restaurar las filas tal como estaban, con su seq.
        with _Disparadores(conexion, "asignaciones_cid") as c:
            c.execute("DELETE FROM asignaciones_cid")
            marcas = ", ".join("?" * len(originales[0]))
            c.executemany(f"INSERT INTO asignaciones_cid VALUES ({marcas})", originales)
    finally:
        conexion.close()
    if app.integridad().get("estado") != "ok":
        raise CasoError("El historial de mi-app-qr no quedó restaurado tras el intento.")
    if verificacion.get("estado") != "alerta":
        return Presentacion(True, None, ms, variante)
    detalle = str(verificacion.get("detalle", ""))
    motivo = "hmac" if "no verifica con su clave" in detalle else "compromiso"
    return Presentacion(False, motivo, ms, variante)


def _m3_terminar(entorno: Entorno) -> None:
    app = entorno.estado.pop("M3", None)
    if isinstance(app, MiAppQr):
        app.detener()


# --- M2: reescritura completa contra la raíz anclada en Fabric ---------------------------

VARIANTES_M2 = ("editar", "reordenar")
EVENTOS_M2 = 8
ANCHOR_CLI = RAIZ_REPOSITORIO / "anchor" / "dist" / "cli.js"
ENTORNO_ANCHOR = RAIZ_REPOSITORIO / "infra" / "fabric" / "entorno-anchor.sh"


def _m2_preparar(entorno: Entorno, total: int) -> None:
    if not ANCHOR_CLI.is_file():
        raise CasoError("M2 necesita anchor/ compilado: npm ci && npm run build en anchor/.")
    resultado = subprocess.run(
        ["bash", str(ENTORNO_ANCHOR)], capture_output=True, text=True, timeout=60
    )
    variables = {}
    for linea in resultado.stdout.splitlines():
        if linea.startswith("export ") and "=" in linea:
            clave, valor = linea[len("export "):].split("=", 1)
            variables[clave] = valor
    if resultado.returncode != 0 or not all(variables.values()) or len(variables) < 8:
        raise CasoError(
            "M2 necesita la red Fabric creada (infra/fabric/crear-red.sh) y SQRID_FABRIC_HOME."
        )
    entorno.estado["M2"] = {**os.environ, **variables}
    # Un verifier_id por corrida: los loteId no chocan con corridas anteriores en la red.
    entorno.estado["M2-id"] = f"evaluacion-m2-{secrets.token_hex(6)}"


def _anclar(db: Path, verifier_id: str, trabajo: Path, variables: dict) -> Path:
    """El ciclo real `evidence-log cycle` → `anchor anclar` → Fabric → recibo."""
    for _ in range(6):
        resultado = subprocess.run(
            [sys.executable, "-m", "secureqr_evidence_log", "cycle", "--db", str(db),
             "--verifier-id", verifier_id, "--workdir", str(trabajo),
             "--anchor-command", f"node {ANCHOR_CLI} anclar"],
            env=variables, capture_output=True, text=True, timeout=300,
        )
        if resultado.returncode == 0:
            return trabajo / "lote.json"
        if resultado.returncode != 1:
            break
        # Justo después de arrancar la red el orderer puede seguir eligiendo líder.
        time.sleep(10)
    raise CasoError(f"El ciclo de anclaje falló ({resultado.returncode}): {resultado.stderr.strip()}")


def _verificar_en_fabric(lote: Path, evidencia: Path, variables: dict) -> int:
    return subprocess.run(
        ["node", str(ANCHOR_CLI), "verificar", "--batch", str(lote), "--evidence", str(evidencia)],
        env=variables, capture_output=True, text=True, timeout=120,
    ).returncode


def _reescribir(db: Path, variante: str, rng: random.Random) -> None:
    """Lo que haría quien controla el servidor: rehacer la bitácora con la cadena válida."""
    original = EvidenceLog(str(db))
    eventos = list(original.events)
    original.close()
    if variante == "editar":
        k = rng.randrange(len(eventos))
        eventos[k] = eventos[k].__class__(
            create_credential_id(), *[getattr(eventos[k], c) for c in COLUMNAS_EVENTO[1:]]
        )
    else:
        a, b = rng.sample(range(len(eventos)), 2)
        eventos[a], eventos[b] = eventos[b], eventos[a]
    conexion = sqlite3.connect(db)
    lotes = conexion.execute("SELECT * FROM lotes").fetchall()
    anclajes = conexion.execute("SELECT * FROM anclajes").fetchall()
    conexion.close()
    db.unlink()
    nueva = EvidenceLog(str(db))
    for e in eventos:
        nueva.append_event(e.credential_id, e.verifier_id, e.timestamp, e.decision)
    if not nueva.verify_chain():
        raise CasoError("La reescritura de M2 debía dejar una cadena válida.")
    nueva.close()
    # Conserva el registro de lotes y anclajes, como si nada hubiera cambiado.
    conexion = sqlite3.connect(db)
    for tabla, filas in (("lotes", lotes), ("anclajes", anclajes)):
        for fila in filas:
            conexion.execute(f"INSERT INTO {tabla} VALUES ({', '.join('?' * len(fila))})", fila)
    conexion.commit()
    conexion.close()


def _lote_actual(db: Path, lote_anclado: Path, destino: Path) -> None:
    """El mismo lote (id y rango) calculado desde la bitácora como está ahora."""
    lote = json.loads(lote_anclado.read_text(encoding="utf-8"))
    log = EvidenceLog(str(db))
    try:
        hashes = [e.hash for e in log.events][lote["first_event"] - 1 : lote["last_event"]]
    finally:
        log.close()
    destino.write_text(json.dumps({**lote, "hashes": hashes}), encoding="utf-8")


def _m2(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    variables = entorno.estado["M2"]
    assert isinstance(variables, dict)
    variante = VARIANTES_M2[i % len(VARIANTES_M2)]
    trabajo = entorno.carpeta / "m2" / str(i)
    trabajo.mkdir(parents=True)
    db = trabajo / "bitacora.sqlite3"
    verifier_id = f"{entorno.estado['M2-id']}-{i}"
    log = EvidenceLog(str(db))
    for _ in range(EVENTOS_M2):
        log.append_event(create_credential_id(), verifier_id, time.time(), "aceptado")
    log.close()
    lote = _anclar(db, verifier_id, trabajo / "anclaje", variables)
    # Sin alterar, la raíz local coincide con la del ledger.
    if _verificar_en_fabric(lote, trabajo / "antes.json", variables) != 0:
        raise CasoError("El lote recién anclado no verifica contra Fabric.")
    _reescribir(db, variante, rng)
    _lote_actual(db, lote, trabajo / "lote-reescrito.json")
    inicio = time.perf_counter()
    codigo = _verificar_en_fabric(trabajo / "lote-reescrito.json", trabajo / "despues.json", variables)
    ms = (time.perf_counter() - inicio) * 1000
    if codigo == 0:
        return Presentacion(True, None, ms, variante)
    return Presentacion(False, "raiz_fabric" if codigo == 3 else f"anchor_{codigo}", ms, variante)


def _m2_terminar(entorno: Entorno) -> None:
    entorno.estado.pop("M2", None)
    entorno.estado.pop("M2-id", None)


for caso in (
    Caso("M1", "M", "Editar, borrar o reordenar un evento de la bitácora", True,
         frozenset({"verify_chain"}), _m1, _m1_preparar),
    Caso("M2", "M", "Reescribir la bitácora y recalcular la cadena después de anclarla", True,
         frozenset({"raiz_fabric"}), _m2, _m2_preparar, _m2_terminar, frozenset({"fabric"})),
    Caso("M3", "M", "Alterar asignaciones_cid sin conocer ASIGNACIONES_KEY", True,
         frozenset({"hmac"}), _m3, _m3_preparar, _m3_terminar),
):
    registrar(caso)
