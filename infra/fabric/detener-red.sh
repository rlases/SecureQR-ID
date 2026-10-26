#!/usr/bin/env bash
# Detiene la red sin borrar nada: contenedores, volúmenes y material criptográfico quedan.
. "$(dirname "$0")/comun.sh"
[ -e "$MARCA" ] || falla "no hay una red creada con crear-red.sh"
nombres=$(contenedores_red)
[ -n "$nombres" ] || falla "no se encontraron los contenedores de la red"
# shellcheck disable=SC2086
docker stop $nombres >/dev/null
info "red detenida"
