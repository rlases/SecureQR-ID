package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Doble del stub: solo el estado del mundo, el id y la fecha de la transacción.
type stubFalso struct {
	shim.ChaincodeStubInterface
	estado  map[string][]byte
	txID    string
	segundo int64
	fallar  bool
}

func (s *stubFalso) GetState(clave string) ([]byte, error) {
	if s.fallar {
		return nil, errors.New("estado no disponible")
	}
	return s.estado[clave], nil
}

func (s *stubFalso) PutState(clave string, valor []byte) error {
	s.estado[clave] = valor
	return nil
}

func (s *stubFalso) GetTxID() string { return s.txID }

func (s *stubFalso) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return &timestamppb.Timestamp{Seconds: s.segundo}, nil
}

type contextoFalso struct{ stub *stubFalso }

func (c *contextoFalso) GetStub() shim.ChaincodeStubInterface  { return c.stub }
func (c *contextoFalso) GetClientIdentity() cid.ClientIdentity { return nil }

var _ contractapi.TransactionContextInterface = (*contextoFalso)(nil)

const (
	loteValido = "ccav-portal-1:seq-000101-000600"
	raizValida = "3f0b2f6c1a1e5d5b0c9b5d8b1a6e2c4d7f8a9b0c1d2e3f405162738495a6b7c8"
)

func nuevo() (*ContratoAnclaje, *contextoFalso) {
	return &ContratoAnclaje{}, &contextoFalso{stub: &stubFalso{
		estado:  map[string][]byte{},
		txID:    "tx-1",
		segundo: 1_800_000_000,
	}}
}

func TestRegistraYConsultaConTransaccionYFecha(t *testing.T) {
	c, ctx := nuevo()
	if err := c.RegistrarRaiz(ctx, loteValido, raizValida, 500, 101, 600); err != nil {
		t.Fatalf("registrar: %v", err)
	}
	lote, err := c.ConsultarRaiz(ctx, loteValido)
	if err != nil {
		t.Fatalf("consultar: %v", err)
	}
	esperado := Lote{
		LoteID: loteValido, Raiz: raizValida, Cantidad: 500, PrimerEvento: 101,
		UltimoEvento: 600, TxID: "tx-1", FechaAnclaje: 1_800_000_000,
	}
	if *lote != esperado {
		t.Fatalf("lote = %+v, se esperaba %+v", *lote, esperado)
	}
}

func TestElJSONTieneLosNombresQueEsperaAnchor(t *testing.T) {
	c, ctx := nuevo()
	_ = c.RegistrarRaiz(ctx, loteValido, raizValida, 500, 101, 600)
	var campos map[string]any
	if err := json.Unmarshal(ctx.stub.estado[prefijoLote+loteValido], &campos); err != nil {
		t.Fatal(err)
	}
	for _, nombre := range []string{"loteId", "raiz", "cantidad", "primerEvento", "ultimoEvento", "txId", "fechaAnclaje"} {
		if _, ok := campos[nombre]; !ok {
			t.Errorf("falta el campo %s que lee anchor/src/fabric.ts", nombre)
		}
	}
	if len(campos) != 7 {
		t.Errorf("campos de más: %v", campos)
	}
}

func TestRechazaUnLoteYaRegistradoSinSobrescribirlo(t *testing.T) {
	c, ctx := nuevo()
	_ = c.RegistrarRaiz(ctx, loteValido, raizValida, 500, 101, 600)
	ctx.stub.txID = "tx-2"
	otraRaiz := strings.Repeat("a", 64)
	err := c.RegistrarRaiz(ctx, loteValido, otraRaiz, 500, 101, 600)
	if err == nil || !strings.Contains(err.Error(), ErrYaRegistrado) {
		t.Fatalf("se esperaba %s, fue %v", ErrYaRegistrado, err)
	}
	lote, _ := c.ConsultarRaiz(ctx, loteValido)
	if lote.Raiz != raizValida || lote.TxID != "tx-1" {
		t.Fatalf("el lote anclado cambió: %+v", lote)
	}
}

func TestConsultarUnLoteInexistente(t *testing.T) {
	c, ctx := nuevo()
	_, err := c.ConsultarRaiz(ctx, loteValido)
	if err == nil || !strings.Contains(err.Error(), ErrNoEncontrado) {
		t.Fatalf("se esperaba %s, fue %v", ErrNoEncontrado, err)
	}
}

func TestValidaLasEntradas(t *testing.T) {
	casos := []struct {
		nombre                    string
		lote, raiz                string
		cantidad, primero, ultimo int
	}{
		{"loteId sin formato", "lote-1", raizValida, 500, 101, 600},
		{"loteId que no corresponde al rango", "ccav:seq-000001-000500", raizValida, 500, 101, 600},
		{"loteId demasiado largo", strings.Repeat("x", 190) + ":seq-000101-000600", raizValida, 500, 101, 600},
		{"raíz corta", loteValido, "abc", 500, 101, 600},
		{"raíz en mayúsculas", loteValido, strings.ToUpper(raizValida), 500, 101, 600},
		{"raíz con datos no hexadecimales", loteValido, strings.Repeat("g", 64), 500, 101, 600},
		{"rango invertido", "ccav:seq-000600-000101", raizValida, 1, 600, 101},
		{"evento cero", "ccav:seq-000000-000010", raizValida, 11, 0, 10},
		{"más eventos que el rango", loteValido, raizValida, 501, 101, 600},
		{"cantidad cero", loteValido, raizValida, 0, 101, 600},
	}
	for _, caso := range casos {
		t.Run(caso.nombre, func(t *testing.T) {
			c, ctx := nuevo()
			if err := c.RegistrarRaiz(ctx, caso.lote, caso.raiz, caso.cantidad, caso.primero, caso.ultimo); err == nil {
				t.Fatal("se esperaba un error")
			}
			if len(ctx.stub.estado) != 0 {
				t.Fatal("una entrada inválida no debe escribir nada")
			}
		})
	}
}

func TestAdmiteHuecosDeAutoincrement(t *testing.T) {
	c, ctx := nuevo()
	if err := c.RegistrarRaiz(ctx, loteValido, raizValida, 498, 101, 600); err != nil {
		t.Fatalf("un lote con huecos en la secuencia debe aceptarse: %v", err)
	}
}

func TestPropagaUnErrorDelEstado(t *testing.T) {
	c, ctx := nuevo()
	ctx.stub.fallar = true
	if err := c.RegistrarRaiz(ctx, loteValido, raizValida, 500, 101, 600); err == nil {
		t.Fatal("se esperaba un error")
	}
}

func TestElContratoEsValidoParaContractapi(t *testing.T) {
	if _, err := contractapi.NewChaincode(&ContratoAnclaje{}); err != nil {
		t.Fatalf("contractapi rechaza el contrato: %v", err)
	}
}
