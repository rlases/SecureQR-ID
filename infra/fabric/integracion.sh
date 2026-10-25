#!/usr/bin/env bash
# Prueba de integración contra la red Fabric real (ADR-0017 punto 8, issue #93).
#
#   infra/fabric/integracion.sh <carpeta de evidencia>
#
# Con la red ya creada (crear-red.sh) y `anchor/` compilado: crea una bitácora con eventos
# sintéticos, ejecuta el ciclo real `evidence-log cycle` → `anchor anclar` → Fabric →
# registro del recibo, lee la raíz desde la red y verifica contra ella una prueba de
# inclusión (`anchor verificar`). Reintenta el anclaje para comprobar que es idempotente.
# Deja en la carpeta la evidencia para el anexo del documento de grado: lote, recibo,
# estado y la verificación (transacción, bloque, raíz y prueba).
. "$(dirname "$0")/comun.sh"
salida="${1:-}"
[ -n "$salida" ] || falla "uso: integracion.sh <carpeta de evidencia>"
[ -e "$MARCA" ] || falla "primero crea la red con crear-red.sh"
[ -f "$REPO_DIR/anchor/dist/cli.js" ] || falla "compila anchor/ (npm run build)"
PYTHON="${PYTHON:-python3}"
"$PYTHON" -c 'import secureqr_evidence_log' 2>/dev/null || falla "instala evidence-log (pip install -e evidence-log)"

mkdir -p "$salida"
salida="$(cd "$salida" && pwd)"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
db="$trabajo/evidencia.sqlite3"
# Un verifier_id por corrida: el loteId no choca con corridas anteriores en la misma red.
verifier_id="integracion-$(date -u +%Y%m%dT%H%M%SZ)"
eventos="${SQRID_INTEGRACION_EVENTOS:-25}"

info "bitácora con $eventos eventos sintéticos"
"$PYTHON" - "$db" "$verifier_id" "$eventos" <<'PY'
import sys, time
from secureqr_evidence_log.evidence_log import EvidenceLog
db, verifier_id, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
log = EvidenceLog(db)
for i in range(n):
    # cid sintético con el formato canónico (22 caracteres Base64url); nunca datos reales.
    log.append_event(f"SintEtIcO{i:013d}", verifier_id, time.time(), "aceptado")
assert log.verify_chain()
log.close()
PY

eval "$("$INFRA_DIR/entorno-anchor.sh")"
anclar="node $REPO_DIR/anchor/dist/cli.js anclar"

info "ciclo real: evidence-log → anchor → Fabric → recibo"
if ! "$PYTHON" -m secureqr_evidence_log cycle --db "$db" --verifier-id "$verifier_id" \
  --workdir "$trabajo/anclaje" --status-file "$salida/estado.json" --anchor-command "$anclar"; then
  # `cycle` solo informa el código de salida: se repite el anclaje para ver el error de anchor/.
  node "$REPO_DIR/anchor/dist/cli.js" anclar --batch "$trabajo/anclaje/lote.json" \
    --receipt "$trabajo/recibo-diagnostico.json" || true
  falla "el ciclo de anclaje falló"
fi
cp "$trabajo/anclaje/lote.json" "$trabajo/anclaje/recibo.json" "$salida/"

info "la raíz desde la red y una prueba de inclusión contra ella"
node "$REPO_DIR/anchor/dist/cli.js" verificar --batch "$salida/lote.json" --evidence "$salida/verificacion.json"

info "reintento del mismo lote: mismo recibo (idempotente)"
node "$REPO_DIR/anchor/dist/cli.js" anclar --batch "$salida/lote.json" --receipt "$trabajo/recibo-2.json"
cmp -s <("$PYTHON" -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1])),sort_keys=True))' "$salida/recibo.json") \
       <("$PYTHON" -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1])),sort_keys=True))' "$trabajo/recibo-2.json") \
  || falla "el reintento produjo un recibo distinto"

info "la bitácora queda anclada y sin pendientes"
"$PYTHON" - "$db" "$salida/estado.json" <<'PY'
import json, sys
from secureqr_evidence_log.evidence_log import EvidenceLog
log = EvidenceLog(sys.argv[1])
assert log.verify_chain(), "la cadena no verifica"
estado = log.anchoring_status(0).to_json()
assert estado["pending_events"] == 0, estado
assert len(log.anchors) == 1, log.anchors
log.close()
print(json.dumps(estado))
PY
"$PYTHON" - "$salida" <<'PY'
import json, sys
v = json.load(open(f"{sys.argv[1]}/verificacion.json"))
assert v["inclusion_valid"] and v["tampered_leaf_rejected"], v
assert v["merkle_root_ledger"] == v["merkle_root_local"], v
print(f"OK: lote {v['batch_id']} en la transacción {v['transaction_id']}, bloque {v['block_number']}, raíz {v['merkle_root_ledger']}")
PY
