// Contrato de anclaje de SecureQR-ID en Hyperledger Fabric (ADR-0017, issue #82).
//
// Guarda la raíz de Merkle de cada lote de la bitácora, con el identificador y la fecha
// de la transacción que lo registró. Solo hashes, identificadores de instalación y
// números de evento: nunca datos personales.
//
// El cliente de anchor/ (anchor/src/fabric.ts) lo invoca como `registrarRaiz` y
// `consultarRaiz`; contractapi resuelve esos nombres a los métodos exportados de abajo.
// Los mensajes de error LOTE_YA_REGISTRADO y LOTE_NO_ENCONTRADO son parte de ese
// contrato: el cliente los reconoce para hacer idempotente un reintento.
package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const (
	ErrYaRegistrado = "LOTE_YA_REGISTRADO"
	ErrNoEncontrado = "LOTE_NO_ENCONTRADO"
	// Prefijo de las claves en el estado del mundo.
	prefijoLote = "lote:"
	// Mismo límite que verifier_id en evidence-log (128) más el sufijo de secuencias.
	maxLoteID = 200
)

var (
	// `<verifier_id>:seq-<primero>-<último>`, como lo forma evidence-log (batch_id_for).
	loteIDPatron = regexp.MustCompile(`^(.+):seq-(\d{6,})-(\d{6,})$`)
	raizPatron   = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// Lote es lo que queda en el ledger por cada raíz anclada.
type Lote struct {
	LoteID       string `json:"loteId"`
	Raiz         string `json:"raiz"`
	Cantidad     int    `json:"cantidad"`
	PrimerEvento int    `json:"primerEvento"`
	UltimoEvento int    `json:"ultimoEvento"`
	TxID         string `json:"txId"`
	// Segundos Unix de la marca de tiempo de la transacción (GetTxTimestamp).
	FechaAnclaje int64 `json:"fechaAnclaje"`
}

// ContratoAnclaje expone registrarRaiz y consultarRaiz.
type ContratoAnclaje struct {
	contractapi.Contract
}

func validar(loteID, raiz string, cantidad, primerEvento, ultimoEvento int) error {
	if len(loteID) > maxLoteID {
		return fmt.Errorf("loteId demasiado largo")
	}
	partes := loteIDPatron.FindStringSubmatch(loteID)
	if partes == nil {
		return fmt.Errorf("loteId inválido: se espera <verifier_id>:seq-<primero>-<último>")
	}
	if !raizPatron.MatchString(raiz) {
		return fmt.Errorf("la raíz debe tener 64 caracteres hexadecimales en minúscula")
	}
	if primerEvento < 1 || ultimoEvento < primerEvento {
		return fmt.Errorf("rango de eventos inválido")
	}
	// La bitácora usa AUTOINCREMENT: puede haber huecos, pero nunca más eventos que el rango.
	if cantidad < 1 || cantidad > ultimoEvento-primerEvento+1 {
		return fmt.Errorf("la cantidad no corresponde al rango de eventos")
	}
	primero, _ := strconv.Atoi(partes[2])
	ultimo, _ := strconv.Atoi(partes[3])
	if primero != primerEvento || ultimo != ultimoEvento {
		return fmt.Errorf("el loteId no corresponde al rango de eventos")
	}
	return nil
}

// RegistrarRaiz guarda la raíz de un lote. Rechaza un loteId ya registrado: un lote
// anclado nunca se sobrescribe.
func (c *ContratoAnclaje) RegistrarRaiz(
	ctx contractapi.TransactionContextInterface,
	loteID string,
	raiz string,
	cantidad int,
	primerEvento int,
	ultimoEvento int,
) error {
	if err := validar(loteID, raiz, cantidad, primerEvento, ultimoEvento); err != nil {
		return err
	}
	stub := ctx.GetStub()
	clave := prefijoLote + loteID
	existente, err := stub.GetState(clave)
	if err != nil {
		return fmt.Errorf("no se pudo leer el estado: %w", err)
	}
	if existente != nil {
		return fmt.Errorf("%s: %s", ErrYaRegistrado, loteID)
	}
	marca, err := stub.GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("no se pudo leer la fecha de la transacción: %w", err)
	}
	lote := Lote{
		LoteID:       loteID,
		Raiz:         raiz,
		Cantidad:     cantidad,
		PrimerEvento: primerEvento,
		UltimoEvento: ultimoEvento,
		TxID:         stub.GetTxID(),
		FechaAnclaje: marca.GetSeconds(),
	}
	datos, err := json.Marshal(lote)
	if err != nil {
		return err
	}
	return stub.PutState(clave, datos)
}

// ConsultarRaiz devuelve el lote registrado, sin emitir transacciones.
func (c *ContratoAnclaje) ConsultarRaiz(
	ctx contractapi.TransactionContextInterface,
	loteID string,
) (*Lote, error) {
	datos, err := ctx.GetStub().GetState(prefijoLote + loteID)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer el estado: %w", err)
	}
	if datos == nil {
		return nil, fmt.Errorf("%s: %s", ErrNoEncontrado, loteID)
	}
	var lote Lote
	if err := json.Unmarshal(datos, &lote); err != nil {
		return nil, err
	}
	return &lote, nil
}
