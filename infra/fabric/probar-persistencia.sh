#!/usr/bin/env bash
# Prueba que el ledger sobrevive a un reinicio de la red (ADR-0017, #82): registra una
# raíz, detiene y arranca la red, y comprueba que la raíz sigue igual y que un loteId
# repetido se rechaza. Usa un loteId de prueba con datos sintéticos.
. "$(dirname "$0")/comun.sh"
[ -e "$MARCA" ] || falla "primero crea la red con crear-red.sh"
sufijo=$(date -u +%s)
lote="prueba-persistencia-$sufijo:seq-000001-000003"
raiz=$(printf 'secureqr-id prueba %s' "$sufijo" | sha256sum | cut -d' ' -f1)

info "registrarRaiz $lote"
invocar "{\"function\":\"registrarRaiz\",\"Args\":[\"$lote\",\"$raiz\",\"3\",\"1\",\"3\"]}"
antes=$(consultar "{\"function\":\"consultarRaiz\",\"Args\":[\"$lote\"]}")
echo "$antes"

info "reinicio de la red"
"$INFRA_DIR/detener-red.sh"
"$INFRA_DIR/arrancar-red.sh"

despues=$(consultar "{\"function\":\"consultarRaiz\",\"Args\":[\"$lote\"]}")
echo "$despues"
[ "$antes" = "$despues" ] || falla "el lote cambió tras el reinicio"
echo "$despues" | grep -q "\"raiz\":\"$raiz\"" || falla "la raíz no coincide"

info "un loteId repetido se rechaza"
if salida=$(invocar "{\"function\":\"registrarRaiz\",\"Args\":[\"$lote\",\"$raiz\",\"3\",\"1\",\"3\"]}" 2>&1); then
  falla "se aceptó un loteId repetido"
fi
echo "$salida" | grep -q LOTE_YA_REGISTRADO || falla "el rechazo no dice LOTE_YA_REGISTRADO: $salida"
info "OK: el ledger sobrevivió al reinicio y el lote no se puede sobrescribir"
