#!/usr/bin/env bash
# Crea la red Fabric de SecureQR-ID UNA SOLA VEZ e instala el contrato (ADR-0017, #82).
#
#   infra/fabric/crear-red.sh
#
# Descarga, con versiones fijadas, los binarios y las imágenes de Fabric y la test-network
# de fabric-samples en $SQRID_FABRIC_HOME (por defecto ~/secureqr-fabric, fuera del
# repositorio); levanta un orderer y dos organizaciones, crea el canal, instala el contrato
# de anchor/chaincode/ y deja los contenedores con reinicio `unless-stopped`.
#
# Si la red ya existe, se niega: después de crearla solo se detiene y arranca
# (detener-red.sh / arrancar-red.sh). NUNCA `./network.sh down`, que borra el ledger.
. "$(dirname "$0")/comun.sh"

[ -e "$MARCA" ] && falla "la red ya existe ($MARCA). Usa arrancar-red.sh; nunca se recrea."
[ -n "$(contenedores_red)" ] && falla "ya hay contenedores de una red Fabric en este equipo."
command -v docker >/dev/null || falla "falta Docker"
command -v go >/dev/null || falla "falta Go (para empaquetar el contrato)"

mkdir -p "$FABRIC_HOME"
if [ ! -d "$SAMPLES_DIR/.git" ]; then
  info "fabric-samples en $FABRIC_SAMPLES_COMMIT"
  git clone -q https://github.com/hyperledger/fabric-samples "$SAMPLES_DIR"
fi
git -C "$SAMPLES_DIR" checkout -q "$FABRIC_SAMPLES_COMMIT"

info "binarios e imágenes de Fabric $FABRIC_VERSION y Fabric CA $FABRIC_CA_VERSION"
curl -fsSL "https://raw.githubusercontent.com/hyperledger/fabric/v${FABRIC_VERSION}/scripts/install-fabric.sh" \
  -o "$FABRIC_HOME/install-fabric.sh"
echo "$INSTALL_FABRIC_SHA256  $FABRIC_HOME/install-fabric.sh" | sha256sum -c --quiet - \
  || falla "install-fabric.sh no coincide con el SHA-256 fijado en versiones.env"
(cd "$FABRIC_HOME" && bash install-fabric.sh --fabric-version "$FABRIC_VERSION" \
  --ca-version "$FABRIC_CA_VERSION" binary docker)
peer version | grep -q "Version: v\?$FABRIC_VERSION" || falla "los binarios no son $FABRIC_VERSION"

info "red y canal $CANAL"
(cd "$RED_DIR" && ./network.sh up createChannel -c "$CANAL" -i "$FABRIC_VERSION" -cai "$FABRIC_CA_VERSION")

info "contrato $CONTRATO $CONTRATO_VERSION desde anchor/chaincode/"
(cd "$RED_DIR" && ./network.sh deployCC -c "$CANAL" -ccn "$CONTRATO" \
  -ccp "$REPO_DIR/anchor/chaincode" -ccl go -ccv "$CONTRATO_VERSION" -ccs 1)

info "reinicio automático de los contenedores"
# shellcheck disable=SC2046
docker update --restart unless-stopped $(contenedores_red) >/dev/null

esperar_descubrimiento
date -u +%Y-%m-%dT%H:%M:%SZ > "$MARCA"
info "red creada. Respáldala ahora: infra/fabric/respaldar-red.sh <destino>"
"$INFRA_DIR/entorno-anchor.sh"
