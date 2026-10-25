# Red Fabric de SecureQR-ID (ADR-0017, issue #82)

Red propia de **Hyperledger Fabric 2.5 LTS** en Docker para anclar las raíces de Merkle
de la bitácora. Se construye sobre la `test-network` oficial de `fabric-samples` (un
*orderer* y dos organizaciones con un *peer* cada una) con **versiones fijadas** en
[`versiones.env`](versiones.env): Fabric 2.5.16, Fabric CA 1.5.22 y un commit concreto de
`fabric-samples`. Nunca «latest».

Requiere Docker, Go (solo para empaquetar el contrato), `git`, `curl` y unos 4 GB de RAM
libres. Todo lo generado vive en `$SQRID_FABRIC_HOME` (por defecto `~/secureqr-fabric`),
**fuera del repositorio**: binarios, `fabric-samples` y el material criptográfico, que
nunca entra a git.

## Un solo comando para crearla

```bash
infra/fabric/crear-red.sh
```

Descarga las versiones fijadas, levanta la red, crea el canal `secureqr`, instala el
contrato `secureqr-anclaje` desde [`anchor/chaincode/`](../../anchor/chaincode) y deja los
contenedores con reinicio `unless-stopped`, para que vuelvan solos tras un reinicio del
servidor. Al final imprime las variables `SQRID_FABRIC_*` que necesita `anchor/`
(también con `entorno-anchor.sh`).

## Persistencia: se crea una vez, después solo se detiene y arranca

La `test-network` está pensada para pruebas: **`./network.sh down` borra contenedores,
volúmenes y material criptográfico**, y `up` crea una red nueva con el ledger vacío. Por
eso, en el servidor del CCAV:

| Acción | Script |
|---|---|
| Crear (una sola vez; se niega si ya existe) | `crear-red.sh` |
| Detener sin borrar nada | `detener-red.sh` |
| Arrancar la red existente | `arrancar-red.sh` |
| Respaldar (con la red detenida) | `respaldar-red.sh <destino>` |
| Comprobar que el ledger sobrevive a un reinicio | `probar-persistencia.sh` |
| Integración real: anclar un lote y verificar la prueba de inclusión | `integracion.sh <carpeta>` |

**Nunca** `network.sh down` ni `network.sh up` sobre la red del piloto.

## Respaldo

Con la red detenida, `respaldar-red.sh` copia los volúmenes del *orderer* y de los *peers*
y el material criptográfico (`organizations/`, `channel-artifacts/`) a una carpeta con
fecha, con `SHA256SUMS`. Se niega a escribir dentro del repositorio. El destino debe ser un
medio externo que el custodio **cifra** y guarda: contiene claves privadas. Se respalda al
crear la red y una vez por semana.

```bash
infra/fabric/detener-red.sh
infra/fabric/respaldar-red.sh /media/respaldo/fabric
infra/fabric/arrancar-red.sh
```

## Contrato

`anchor/chaincode/` (Go, `fabric-contract-api-go` v2.2.2): `registrarRaiz(loteId, raiz,
cantidad, primerEvento, ultimoEvento)`, que rechaza un `loteId` ya registrado
(`LOTE_YA_REGISTRADO`), y `consultarRaiz(loteId)`, que devuelve también `txId` y
`fechaAnclaje` (`GetTxID`, `GetTxTimestamp`). Solo hashes, identificadores de instalación
y números de evento. Se usa la v2.2.2 y no la v2.2.4 porque esta exige Go 1.26.7 y la
imagen `fabric-ccenv:2.5.16`, que compila el contrato dentro del *peer*, trae Go 1.26.4.

```bash
cd anchor/chaincode && go test ./...
```

## Integración con la red real (issue #93)

`integracion.sh <carpeta>` crea una bitácora con eventos sintéticos, ejecuta el ciclo real
`evidence-log cycle` → `anchor anclar` → Fabric → recibo, lee la raíz desde la red y
verifica contra ella una prueba de inclusión (`anchor verificar`), y comprueba que
reintentar el anclaje da el mismo recibo. En la carpeta quedan `lote.json`, `recibo.json`,
`estado.json` y `verificacion.json` (transacción, bloque, raíz y prueba): la evidencia del
anexo del documento de grado. Lo ejecuta el flujo
[`fabric-integracion.yml`](../../.github/workflows/fabric-integracion.yml) a mano, cada
noche y en los PR que tocan la red, el contrato, `anchor/` o `evidence-log/`, y guarda la
carpeta como artefacto.

