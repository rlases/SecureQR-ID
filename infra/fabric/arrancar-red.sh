#!/usr/bin/env bash
# Arranca la red ya creada, con su ledger. No crea nada nuevo.
. "$(dirname "$0")/comun.sh"
[ -e "$MARCA" ] || falla "no hay una red creada con crear-red.sh"
nombres=$(contenedores_red)
[ -n "$nombres" ] || falla "no se encontraron los contenedores de la red"
# shellcheck disable=SC2086
docker start $nombres >/dev/null
esperar_peer
esperar_descubrimiento
info "red arrancada"
