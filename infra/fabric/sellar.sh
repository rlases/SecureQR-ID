#!/usr/bin/env bash
# Sellado diario en OpenTimestamps (ADR-0017, punto 7; issue #133).
#
#   infra/fabric/sellar.sh <carpeta de sellos>
#
# Sella el hash del último bloque del canal (ultimo-bloque.sh) con `evidence-log seal` y
# reintenta completar los sellos pendientes con `seal-upgrade`. Necesita el cliente `ots`
# (pip install opentimestamps-client) y salida a internet hacia los calendarios públicos.
# Sin internet el sello queda pendiente y se completa en la corrida siguiente; nunca
# bloquea la validación ni el anclaje.
. "$(dirname "$0")/comun.sh"
sellos="${1:-}"
[ -n "$sellos" ] || falla "uso: sellar.sh <carpeta de sellos>"
PYTHON="${PYTHON:-python3}"
mkdir -p "$sellos"
hash_bloque="$("$INFRA_DIR/ultimo-bloque.sh")"
codigo=0
"$PYTHON" -m secureqr_evidence_log seal --seals-dir "$sellos" --block-hash "$hash_bloque" || codigo=$?
"$PYTHON" -m secureqr_evidence_log seal-upgrade --seals-dir "$sellos" || true
exit "$codigo"
