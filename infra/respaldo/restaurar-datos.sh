#!/usr/bin/env bash
# Descifra y comprueba un respaldo de respaldar-datos.sh (ADR-0018, issue #145).
#
# Lo deja en una carpeta NUEVA y no toca las bases en uso: reemplazarlas es un paso manual,
# con mi-app-qr y verifier-service detenidos (docs/INSTALACION-CCAV.md, §11). La identidad
# de age la trae el custodio; no se copia al servidor.
#
#   infra/respaldo/restaurar-datos.sh secureqr-datos-20261026T030000Z.tar.gz.age \
#     /media/custodio/respaldo.age.key /tmp/restauracion
set -euo pipefail

info() { printf '== %s\n' "$*"; }
falla() { printf 'Error: %s\n' "$*" >&2; exit 1; }

PYTHON="${PYTHON:-python3}"
archivo="${1:-}"
identidad="${2:-}"
salida="${3:-}"
[ -n "$archivo" ] && [ -n "$identidad" ] && [ -n "$salida" ] \
  || falla "uso: restaurar-datos.sh <respaldo .tar.gz.age> <identidad de age> <carpeta nueva>"
[ -f "$archivo" ] || falla "no existe el respaldo: $archivo"
[ -f "$identidad" ] || falla "no existe la identidad: $identidad"
[ ! -e "$salida" ] || falla "$salida ya existe; la restauración va siempre a una carpeta nueva"
command -v age >/dev/null || falla "falta age (apt install age)"

umask 077
mkdir -p "$salida"
info "descifrando"
age -d -i "$identidad" "$archivo" | tar xzf - -C "$salida"
carpeta="$(find "$salida" -mindepth 1 -maxdepth 1 -type d -name 'secureqr-datos-*' | head -n 1)"
[ -n "$carpeta" ] || falla "el respaldo no tiene la carpeta esperada"

info "comprobando sumas y bases"
(cd "$carpeta" && sha256sum --quiet -c SHA256SUMS)
for base in app.db evidence.sqlite3; do
  "$PYTHON" - "$carpeta/$base" <<'PY'
import sqlite3, sys
conexion = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
resultado = conexion.execute("PRAGMA integrity_check").fetchone()[0]
if resultado != "ok":
    sys.exit(f"integrity_check de {sys.argv[1]}: {resultado}")
PY
done

info "respaldo restaurado y comprobado en $carpeta"
