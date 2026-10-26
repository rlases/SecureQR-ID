#!/usr/bin/env bash
# Prueba de respaldar-datos.sh y restaurar-datos.sh con bases sintéticas (ADR-0018, #145).
# Necesita age y python3. La corre el trabajo `respaldo-test` de CI.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
export PYTHON
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

ok() { printf 'ok - %s\n' "$*"; }
mal() { printf 'FALLA - %s\n' "$*" >&2; exit 1; }

# Bases sintéticas: la de mi-app-qr en modo WAL, con una transacción abierta mientras se
# respalda, para comprobar que la copia es consistente.
mkdir -p "$tmp/userData/server-data" "$tmp/anclaje"
"$PYTHON" - "$tmp/userData/server-data/app.db" "$tmp/evidence.sqlite3" <<'PY'
import sqlite3, sys
app = sqlite3.connect(sys.argv[1])
app.execute("PRAGMA journal_mode=WAL")
app.execute("CREATE TABLE titulares (id INTEGER PRIMARY KEY, nombre TEXT)")
app.executemany("INSERT INTO titulares (nombre) VALUES (?)", [(f"TITULAR-PLANO-{i}",) for i in range(200)])
app.commit()
ev = sqlite3.connect(sys.argv[2])
ev.execute("CREATE TABLE eventos (seq INTEGER PRIMARY KEY, hash TEXT)")
ev.executemany("INSERT INTO eventos (hash) VALUES (?)", [(f"{i:064x}",) for i in range(50)])
ev.commit()
PY
echo '{"stale": false}' > "$tmp/anclaje/estado.json"
echo 'no debe salir' > "$tmp/anclaje/notas.txt"
echo '{"ASIGNACIONES_KEY": "SECRETO-HMAC"}' > "$tmp/userData/server-secrets.json"

age-keygen -o "$tmp/custodio.key" 2>/dev/null
age-keygen -y "$tmp/custodio.key" > "$tmp/respaldo.age.pub"

export SQRID_RESPALDO_DESTINATARIOS="$tmp/respaldo.age.pub"
export SQRID_APP_DB="$tmp/userData/server-data/app.db"
export SQRID_EVIDENCE_DB="$tmp/evidence.sqlite3"
export SQRID_ANCLAJE_DIR="$tmp/anclaje"

# Respaldo con una escritura sin confirmar en curso.
"$PYTHON" - "$SQRID_APP_DB" "$DIR/respaldar-datos.sh" "$tmp/destino" <<'PY'
import sqlite3, subprocess, sys
conexion = sqlite3.connect(sys.argv[1])
conexion.execute("BEGIN")
conexion.execute("INSERT INTO titulares (nombre) VALUES ('SIN-CONFIRMAR')")
subprocess.run([sys.argv[2], sys.argv[3]], check=True, stdout=subprocess.DEVNULL)
conexion.rollback()
PY
respaldo="$(ls "$tmp"/destino/secureqr-datos-*.tar.gz.age)"
[ "$(echo "$respaldo" | wc -l)" = 1 ] || mal "se esperaba un solo respaldo"
ok "escribe un respaldo"

if grep -aq 'TITULAR-PLANO' "$respaldo"; then mal "el respaldo contiene texto en claro"; fi
age -d -i "$tmp/custodio.key" "$respaldo" | gzip -t || mal "no se descifra con la clave del custodio"
ok "el respaldo está cifrado y lo descifra la clave del custodio"

age-keygen -o "$tmp/otra.key" 2>/dev/null
if age -d -i "$tmp/otra.key" "$respaldo" >/dev/null 2>&1; then mal "lo descifra una clave ajena"; fi
ok "una clave ajena no lo descifra"

"$DIR/restaurar-datos.sh" "$respaldo" "$tmp/custodio.key" "$tmp/restauracion" >/dev/null
carpeta="$(ls -d "$tmp"/restauracion/secureqr-datos-*)"
"$PYTHON" - "$carpeta" <<'PY'
import sqlite3, sys
c = sys.argv[1]
nombres = [r[0] for r in sqlite3.connect(f"{c}/app.db").execute("SELECT nombre FROM titulares")]
assert len(nombres) == 200, len(nombres)
assert "SIN-CONFIRMAR" not in nombres
assert sqlite3.connect(f"{c}/evidence.sqlite3").execute("SELECT count(*) FROM eventos").fetchone()[0] == 50
PY
ok "restaura las dos bases completas y sin la escritura sin confirmar"

[ -f "$carpeta/anclaje/estado.json" ] || mal "falta estado.json"
[ ! -e "$carpeta/anclaje/notas.txt" ] || mal "copió un archivo que no es JSON de anclaje"
if grep -rq 'SECRETO-HMAC' "$carpeta"; then mal "el respaldo contiene la clave HMAC"; fi
ok "incluye el anclaje y nunca server-secrets.json"

if "$DIR/restaurar-datos.sh" "$respaldo" "$tmp/custodio.key" "$tmp/restauracion" 2>/dev/null; then
  mal "restauró sobre una carpeta existente"
fi
ok "no restaura sobre una carpeta existente"

cat "$tmp/custodio.key" > "$tmp/mal.pub"
if SQRID_RESPALDO_DESTINATARIOS="$tmp/mal.pub" "$DIR/respaldar-datos.sh" "$tmp/destino" 2>/dev/null; then
  mal "aceptó una clave privada como destinatario"
fi
ok "rechaza una clave privada en el archivo de destinatarios"

if "$DIR/respaldar-datos.sh" "$DIR/../../.respaldo-prueba" 2>/dev/null; then
  rm -rf "$DIR/../../.respaldo-prueba"
  mal "aceptó un destino dentro del repositorio"
fi
rm -rf "$DIR/../../.respaldo-prueba"
ok "rechaza un destino dentro del repositorio"

# Corrupción: un byte cambiado hace fallar las sumas al restaurar.
"$PYTHON" - "$carpeta/app.db" <<'PY'
import sys
with open(sys.argv[1], "r+b") as f:
    f.seek(200); b = f.read(1); f.seek(200); f.write(bytes([b[0] ^ 0xFF]))
PY
if (cd "$carpeta" && sha256sum --quiet -c SHA256SUMS) >/dev/null 2>&1; then mal "las sumas no detectaron el cambio"; fi
ok "las sumas detectan un byte cambiado"

# Conservación: un respaldo viejo se borra, el nuevo y los recientes no.
touch -d '20 days ago' "$tmp/destino/secureqr-datos-20000101T000000Z.tar.gz.age"
touch -d '3 days ago' "$tmp/destino/secureqr-datos-20000102T000000Z.tar.gz.age"
touch -d '20 days ago' "$tmp/destino/otro-archivo.txt"
sleep 1
"$DIR/respaldar-datos.sh" "$tmp/destino" >/dev/null
[ ! -e "$tmp/destino/secureqr-datos-20000101T000000Z.tar.gz.age" ] || mal "no borró el respaldo de hace 20 días"
[ -e "$tmp/destino/secureqr-datos-20000102T000000Z.tar.gz.age" ] || mal "borró un respaldo reciente"
[ -e "$tmp/destino/otro-archivo.txt" ] || mal "borró un archivo que no es un respaldo"
# Quedan el primero de esta prueba, el de hace 3 días y el nuevo.
[ "$(ls "$tmp"/destino/secureqr-datos-*.tar.gz.age | wc -l)" = 3 ] || mal "faltan respaldos"
ok "conserva 14 días y solo borra respaldos"

echo "todas las pruebas pasaron"
