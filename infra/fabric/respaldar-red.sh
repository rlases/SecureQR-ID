#!/usr/bin/env bash
# Respaldo de la red DETENIDA (ADR-0017): volúmenes de orderer y peers y material
# criptográfico. El destino debe estar fuera del repositorio, en un medio externo que el
# custodio cifra y guarda. Al crear la red y una vez por semana.
#
#   infra/fabric/respaldar-red.sh /media/respaldo/fabric
. "$(dirname "$0")/comun.sh"
destino="${1:-}"
[ -n "$destino" ] || falla "uso: respaldar-red.sh <directorio de destino>"
[ -e "$MARCA" ] || falla "no hay una red creada con crear-red.sh"
case "$(cd "$(dirname "$destino")" 2>/dev/null && pwd)/" in
  "$REPO_DIR"/*) falla "el respaldo no puede quedar dentro del repositorio" ;;
esac
for c in $(contenedores_red); do
  [ "$(docker inspect -f '{{.State.Running}}' "$c")" = "false" ] || falla "detén la red antes de respaldar (detener-red.sh)"
done
carpeta="$destino/fabric-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$carpeta"
for v in $(volumenes_red); do
  docker run --rm -v "$v:/datos:ro" -v "$carpeta:/respaldo" alpine:3.20 \
    tar czf "/respaldo/volumen-$v.tar.gz" -C /datos .
done
tar czf "$carpeta/organizations.tar.gz" -C "$RED_DIR" organizations channel-artifacts
cp "$MARCA" "$INFRA_DIR/versiones.env" "$carpeta/"
(cd "$carpeta" && sha256sum ./* > SHA256SUMS)
info "respaldo en $carpeta. Cífralo y guárdalo fuera del equipo; contiene claves privadas."
