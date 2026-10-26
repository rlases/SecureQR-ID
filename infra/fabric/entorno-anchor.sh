#!/usr/bin/env bash
# Imprime las variables que necesita `anchor/` para conectarse a esta red (Org1, User1).
. "$(dirname "$0")/comun.sh"
org="$RED_DIR/organizations/peerOrganizations/org1.example.com"
msp="$org/users/User1@org1.example.com/msp"
cat <<FIN
export SQRID_FABRIC_PEER_ENDPOINT=localhost:7051
export SQRID_FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
export SQRID_FABRIC_TLS_CERT_PATH=$org/peers/peer0.org1.example.com/tls/ca.crt
export SQRID_FABRIC_MSP_ID=Org1MSP
export SQRID_FABRIC_CERT_PATH=$(ls "$msp"/signcerts/*.pem 2>/dev/null | head -1)
export SQRID_FABRIC_KEY_PATH=$(ls "$msp"/keystore/* 2>/dev/null | head -1)
export SQRID_FABRIC_CHANNEL=$CANAL
export SQRID_FABRIC_CHAINCODE=$CONTRATO
FIN
