package main

import (
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&ContratoAnclaje{})
	if err != nil {
		log.Fatalf("no se pudo crear el contrato: %v", err)
	}
	chaincode.Info.Title = "SecureQR-ID anclaje"
	chaincode.Info.Version = "1.0.0"

	// Como servicio (chaincode as a service) cuando el peer lo pide así; si no, el modo
	// clásico en el que el peer construye y lanza el contrato.
	if address := os.Getenv("CHAINCODE_SERVER_ADDRESS"); address != "" {
		server := &shim.ChaincodeServer{
			CCID:     os.Getenv("CHAINCODE_ID"),
			Address:  address,
			CC:       chaincode,
			TLSProps: shim.TLSProperties{Disabled: true},
		}
		if err := server.Start(); err != nil {
			log.Fatalf("no se pudo arrancar el contrato como servicio: %v", err)
		}
		return
	}
	if err := chaincode.Start(); err != nil {
		log.Fatalf("no se pudo arrancar el contrato: %v", err)
	}
}
