#!/usr/bin/env bash
# Respaldo diario cifrado de las bases del servidor del CCAV (ADR-0018, issue #145).
#
# Copia en caliente, con la API de respaldo de SQLite, la base de mi-app-qr y la bitácora
# de verifier-service; comprueba la integridad de cada copia; agrega los archivos de la
# carpeta de anclaje; y cifra todo con `age` hacia una o más claves PÚBLICAS. En el
# servidor no queda ninguna clave que descifre el respaldo: la privada la guarda el
# custodio fuera del equipo.
#
# Nunca respalda `server-secrets.json` (ASIGNACIONES_KEY) ni claves: la base y la clave
# HMAC juntas permiten reescribir el historial cid → titular (ADR-0016, #119).
#
#   SQRID_RESPALDO_DESTINATARIOS=/etc/secureqr-id/respaldo.age.pub \
#   SQRID_APP_DB=~secureqr/.config/registro-qr/server-data/app.db \
#   SQRID_EVIDENCE_DB=/var/lib/secureqr-id/evidence.sqlite3 \
#   SQRID_ANCLAJE_DIR=/var/lib/secureqr-id/anclaje \
#   infra/respaldo/respaldar-datos.sh /var/backups/secureqr-id
#
# SQRID_ANCLAJE_DIR es opcional. SQRID_RESPALDO_CONSERVAR_DIAS (14 por defecto) borra los
# respaldos más antiguos del destino, solo después de escribir uno nuevo. PYTHON elige el
# intérprete (python3 por defecto).
set -euo pipefail

info() { printf '== %s\n' "$*"; }
falla() { printf 'Error: %s\n' "$*" >&2; exit 1; }

RESPALDO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$RESPALDO_DIR/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
CONSERVAR_DIAS="${SQRID_RESPALDO_CONSERVAR_DIAS:-14}"

destino="${1:-}"
[ -n "$destino" ] || falla "uso: respaldar-datos.sh <directorio de destino>"
destinatarios="${SQRID_RESPALDO_DESTINATARIOS:-}"
[ -n "$destinatarios" ] || falla "falta SQRID_RESPALDO_DESTINATARIOS (archivo con las claves públicas de age)"
[ -s "$destinatarios" ] || falla "no existe o está vacío: $destinatarios"
grep -q 'AGE-SECRET-KEY' "$destinatarios" \
  && falla "$destinatarios contiene una clave privada; ahí solo van claves públicas (age1…)"
[ -n "${SQRID_APP_DB:-}" ] || falla "falta SQRID_APP_DB (base de mi-app-qr)"
[ -n "${SQRID_EVIDENCE_DB:-}" ] || falla "falta SQRID_EVIDENCE_DB (bitácora de verifier-service)"
[ -f "$SQRID_APP_DB" ] || falla "no existe la base de mi-app-qr: $SQRID_APP_DB"
[ -f "$SQRID_EVIDENCE_DB" ] || falla "no existe la bitácora: $SQRID_EVIDENCE_DB"
if [ -n "${SQRID_ANCLAJE_DIR:-}" ]; then
  [ -d "$SQRID_ANCLAJE_DIR" ] || falla "no existe la carpeta de anclaje: $SQRID_ANCLAJE_DIR"
fi
case "$CONSERVAR_DIAS" in ''|*[!0-9]*) falla "SQRID_RESPALDO_CONSERVAR_DIAS debe ser un número de días" ;; esac
command -v age >/dev/null || falla "falta age (apt install age)"
command -v "$PYTHON" >/dev/null || falla "no se encuentra el intérprete $PYTHON"

mkdir -p "$destino"
case "$(cd "$destino" && pwd)/" in
  "$REPO_DIR"/*) falla "el respaldo no puede quedar dentro del repositorio" ;;
esac

umask 077
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
sello="$(date -u +%Y%m%dT%H%M%SZ)"
carpeta="$trabajo/secureqr-datos-$sello"
mkdir -p "$carpeta"

# Copia consistente aunque la app esté escribiendo (WAL incluido) y comprobación de la
# copia antes de cifrarla: un respaldo corrupto se detecta hoy, no el día de restaurarlo.
copiar_base() {
  "$PYTHON" - "$1" "$2" <<'PY'
import sqlite3, sys
origen, copia = sys.argv[1], sys.argv[2]
fuente = sqlite3.connect(f"file:{origen}?mode=ro", uri=True)
destino = sqlite3.connect(copia)
with destino:
    fuente.backup(destino)
fuente.close()
resultado = destino.execute("PRAGMA integrity_check").fetchone()[0]
destino.close()
if resultado != "ok":
    sys.exit(f"integrity_check de {origen}: {resultado}")
PY
}

info "copiando la base de mi-app-qr"
copiar_base "$SQRID_APP_DB" "$carpeta/app.db"
info "copiando la bitácora"
copiar_base "$SQRID_EVIDENCE_DB" "$carpeta/evidence.sqlite3"
if [ -n "${SQRID_ANCLAJE_DIR:-}" ]; then
  info "copiando la carpeta de anclaje"
  mkdir "$carpeta/anclaje"
  find "$SQRID_ANCLAJE_DIR" -maxdepth 1 -type f -name '*.json' -exec cp -p {} "$carpeta/anclaje/" \;
fi
(cd "$carpeta" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)

archivo="$destino/secureqr-datos-$sello.tar.gz.age"
info "cifrando hacia las claves de $destinatarios"
tar czf - -C "$trabajo" "secureqr-datos-$sello" | age -R "$destinatarios" -o "$archivo.parcial"
mv "$archivo.parcial" "$archivo"

# La limpieza va al final: si algo falla antes, se conservan los respaldos anteriores.
find "$destino" -maxdepth 1 -type f -name 'secureqr-datos-*.tar.gz.age' -mtime "+$CONSERVAR_DIAS" -print -delete
find "$destino" -maxdepth 1 -type f -name 'secureqr-datos-*.tar.gz.age.parcial' -mmin +60 -delete

info "respaldo en $archivo"
