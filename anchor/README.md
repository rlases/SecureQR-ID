# Anclaje SecureQR-ID

Paquete Node.js/TypeScript que construye el árbol de Merkle de cada lote de la bitácora
y publica su raíz en Hyperledger Fabric (ADR-0017). Solo ve hashes y números de evento,
nunca datos personales. El sellado diario en OpenTimestamps llega con #94.

```bash
cd anchor
npm install
npm test
npm run build
```

## Comando `anclar`

```bash
node dist/cli.js anclar --batch lote.json --receipt recibo.json
```

No se corre a mano: lo invoca `evidence-log cycle` cada 15 minutos (ver
`evidence-log/README.md`). Lee el lote que exportó la bitácora, publica la raíz y
escribe el recibo de forma atómica. El formato de ambos archivos está en
`evidence-log/README.md`; este paquete lo valida de forma estricta (`version: 1`,
`batch_id` igual a `seq-%06d-%06d` de sus eventos, hashes SHA-256 en hexadecimal).

| Código | Significado |
|---|---|
| 0 | Raíz anclada, o ya estaba con la misma raíz; recibo escrito |
| 1 | Falla de red o de Fabric; no hay recibo y el ciclo reintenta después |
| 2 | Error de uso, de configuración o de formato del lote; no se conecta a la red |
| 3 | ALERTA: Fabric tiene otra raíz para ese lote; no hay recibo |

Reintentar es seguro. Si la raíz entró a Fabric pero el recibo se perdió (corte de luz,
por ejemplo), la siguiente corrida recibe «ya registrado», consulta el lote y, si
coincide, reescribe el mismo recibo, byte a byte. Por eso `anchored_at` es la fecha de
la transacción en el ledger y no la hora local de la corrida: `evidence-log
record-receipt` acepta el recibo repetido sin ver un anclaje distinto.

## Configuración

Todo sale del entorno, sin valores por defecto:

| Variable | Contenido |
|---|---|
| `SQRID_FABRIC_PEER_ENDPOINT` | `host:puerto` del peer, por ejemplo `localhost:7051` |
| `SQRID_FABRIC_PEER_HOST_ALIAS` | nombre del certificado TLS del peer (`peer0.org1.example.com`) |
| `SQRID_FABRIC_TLS_CERT_PATH` | certificado de la CA TLS del peer |
| `SQRID_FABRIC_MSP_ID` | MSP de la identidad que firma (`Org1MSP`) |
| `SQRID_FABRIC_CERT_PATH` | certificado de esa identidad |
| `SQRID_FABRIC_KEY_PATH` | clave privada de esa identidad (archivo con permisos solo del usuario del servicio) |
| `SQRID_FABRIC_CHANNEL` | canal |
| `SQRID_FABRIC_CHAINCODE` | nombre del chaincode desplegado |

El cliente usa `@hyperledger/fabric-gateway` (Gateway API) sobre gRPC con TLS.

## Contrato con el chaincode (#82)

El chaincode en Go de `anchor/chaincode/` debe exponer:

- `registrarRaiz(loteId, raiz, cantidad, primerEvento, ultimoEvento)`: guarda el lote
  con `txId` (`GetTxID`) y `fechaAnclaje` (`GetTxTimestamp`, segundos Unix). Si el
  `loteId` ya existe, falla con un mensaje que contiene `LOTE_YA_REGISTRADO` y no
  modifica nada.
- `consultarRaiz(loteId)`: devuelve JSON
  `{loteId, raiz, cantidad, primerEvento, ultimoEvento, txId, fechaAnclaje}` con los
  números como enteros; si no existe, falla con un mensaje que contiene
  `LOTE_NO_ENCONTRADO`.

El número de bloque se obtiene del contrato de sistema `qscc` (`GetBlockByTxID`). Ni la
consulta ni el número de bloque emiten transacciones nuevas.

## Pruebas

Las pruebas no necesitan una red: `InMemoryLedgerClient` reemplaza al ledger y
`test/fabric.test.ts` simula el chaincode y los errores de la Gateway (detalles por
peer, transacción no confirmada, red caída). La prueba contra la red Fabric real llega con #82 y #93.
