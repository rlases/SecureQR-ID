# Funciones comunes de los scripts de infra/fabric/ (ADR-0017, issue #82). Se carga con `.`.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$INFRA_DIR/../.." && pwd)"
# shellcheck source=versiones.env
. "$INFRA_DIR/versiones.env"

# Todo lo generado (binarios, fabric-samples, material criptográfico) vive FUERA del
# repositorio: el material criptográfico nunca entra a git.
FABRIC_HOME="${SQRID_FABRIC_HOME:-$HOME/secureqr-fabric}"
SAMPLES_DIR="$FABRIC_HOME/fabric-samples"
RED_DIR="$SAMPLES_DIR/test-network"
MARCA="$FABRIC_HOME/RED_CREADA"
export PATH="$SAMPLES_DIR/bin:$PATH"
export FABRIC_CFG_PATH="$SAMPLES_DIR/config"

# Contenedores de la red: orderer, peers y contratos que lanzan los peers.
contenedores_red() {
  docker ps -a --format '{{.Names}}' \
    | grep -E '^(orderer\.example\.com|peer0\.org[12]\.example\.com|dev-peer0\.org[12]\.example\.com-.*)$' || true
}

volumenes_red() {
  docker volume ls --format '{{.Name}}' \
    | grep -E '(^|_)(orderer\.example\.com|peer0\.org[12]\.example\.com)$' || true
}

info() { printf '\n== %s\n' "$*"; }
falla() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Variables de entorno del CLI `peer` como Admin de Org1 (las mismas que usa anchor/).
entorno_org1() {
  local org="$RED_DIR/organizations/peerOrganizations/org1.example.com"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID=Org1MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$org/peers/peer0.org1.example.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$org/users/Admin@org1.example.com/msp"
  export CORE_PEER_ADDRESS=localhost:7051
}

# Invoca registrarRaiz con el respaldo de los dos peers (política por mayoría).
invocar() {
  entorno_org1
  peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile "$RED_DIR/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C "$CANAL" -n "$CONTRATO" \
    --peerAddresses localhost:7051 --tlsRootCertFiles "$RED_DIR/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 --tlsRootCertFiles "$RED_DIR/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
    --waitForEvent -c "$1"
}

consultar() {
  entorno_org1
  peer chaincode query -C "$CANAL" -n "$CONTRATO" -c "$1"
}

esperar_peer() {
  entorno_org1
  for _ in $(seq 1 60); do
    if peer channel getinfo -c "$CANAL" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  falla "el peer no respondió a tiempo"
}

# Tras arrancar, el Gateway endosa con el descubrimiento de servicios, que solo ve a los
# peers de otras organizaciones cuando el gossip converge. Hasta entonces responde «no
# peer combination can satisfy the endorsement policy»: se espera a que vea los dos.
esperar_descubrimiento() {
  local org="$RED_DIR/organizations/peerOrganizations/org1.example.com"
  local msp="$org/users/User1@org1.example.com/msp"
  for _ in $(seq 1 90); do
    if discover --peerTLSCA "$org/peers/peer0.org1.example.com/tls/ca.crt" \
        --userKey "$(ls "$msp"/keystore/* | head -1)" --userCert "$(ls "$msp"/signcerts/*.pem | head -1)" \
        --MSP Org1MSP peers --channel "$CANAL" --server localhost:7051 2>/dev/null \
      | grep -c "\"$CONTRATO\"" | grep -qx 2; then
      return 0
    fi
    sleep 2
  done
  falla "el descubrimiento de servicios no ve los dos peers con el contrato"
}

