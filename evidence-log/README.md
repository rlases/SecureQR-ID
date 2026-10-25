# Bitácora local SecureQR-ID

Paquete Python que encadena por hash los eventos de validación aceptados (capa de
consolidación local, `docs/ARCHITECTURE.md`). Es append-only: no decide, no borra ni
edita eventos, y `verify_chain()` recalcula la cadena completa.

```bash
cd evidence-log
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e ".[test]"
python -m pytest
```

## Uso desde el verificador

`verifier/` no importa este paquete. La aplicación construye una `EvidenceLog`
persistente por instalación y la inyecta en `RecordingVerifier` (ADR-0013):

```python
from secureqr_evidence_log.evidence_log import EvidenceLog

evidence_log = EvidenceLog("/var/lib/secureqr-id/evidence.sqlite3")
```

`EvidenceLog()` sin ruta usa `:memory:` y solo sirve para pruebas.

## Concurrencia

Una misma instancia puede usarse desde varios hilos, y varias instancias o procesos
pueden apuntar al mismo archivo. `append_event` lee el último hash e inserta el evento
dentro de una transacción `BEGIN IMMEDIATE`, así que dos escrituras simultáneas nunca
encadenan sobre el mismo predecesor.

## Solo agregar, también en la base de datos

Además de que el código no tiene operaciones de edición, la base de datos tiene
disparadores que rechazan cualquier `UPDATE` o `DELETE` sobre `events`, `lotes` y `anclajes`.
Alguien con acceso al archivo puede quitarlos, pero no puede recalcular los hashes sin
que `verify_chain()` lo detecte, ni reescribir lo que ya se ancló en Fabric.

## Anclaje (issue #92, ADR-0017)

El anclaje usa dos tablas de solo agregar. `lotes` guarda cada lote **antes** de
publicarlo (`loteId`, primer y último evento, cantidad, raíz de Merkle y fecha) y
`anclajes` guarda su recibo. Un evento está anclado si cae dentro del rango de algún
anclaje registrado. Antes se marcaba con un `UPDATE` sobre la tabla de eventos
(`mark_batch_anchored`), que se eliminó.

- **`loteId` determinista, con la instalación.** Se forma como
  `<verifier_id>:seq-<primero>-<último>`, por ejemplo `ccav-portal-1:seq-000101-000600`,
  para que dos instalaciones cuyas bitácoras empiezan en 1 no choquen en la misma red.
  `verifier_id` es el de `SQRID_VERIFIER_ID` (texto imprimible de hasta 128 caracteres).
- **Lote fijado.** Cada lote empieza justo después del último evento anclado y tiene
  hasta 500 eventos (configurable). `export-batch` lo fija en `lotes` antes de escribir
  el archivo. Mientras ese lote no tenga recibo, cada corrida vuelve a exportar
  **exactamente ese rango**, aunque hayan llegado eventos nuevos: así un reintento
  siempre produce el mismo `loteId` y, si la raíz ya había entrado a Fabric, recibe
  «ya registrado» en vez de anclar un rango solapado. Un lote fijado conserva su
  `loteId` aunque cambien `--verifier-id` o `--max-events` antes de que llegue su recibo.
- **La raíz se calcula aquí y en `anchor/` con el mismo algoritmo** (prefijos de dominio
  RFC 6962, nodo impar promovido). Las pruebas comparan la versión de Python contra
  vectores generados con `anchor/src/merkle.ts`; si uno de los dos cambia, rompen.
- **Recibo comprobado contra el lote fijado.** Solo se acepta el recibo de un lote
  fijado y pendiente, y su raíz, rango y cantidad deben coincidir con los guardados: una
  raíz ajena con un rango válido se rechaza. Registrar dos veces el mismo recibo no
  cambia nada; uno distinto para un lote ya registrado se rechaza como alerta.

### Comandos

```bash
python -m secureqr_evidence_log export-batch   --db evidence.sqlite3 --verifier-id ccav-portal-1 --output lote.json
python -m secureqr_evidence_log record-receipt --db evidence.sqlite3 --receipt recibo.json
python -m secureqr_evidence_log status         --db evidence.sqlite3
python -m secureqr_evidence_log cycle --db evidence.sqlite3 --verifier-id ccav-portal-1 \
  --workdir /var/lib/secureqr-id/anclaje --status-file /var/lib/secureqr-id/anclaje/estado.json \
  --anchor-command "node /opt/secureqr-id/anchor/dist/cli.js anclar"
```

(`secureqr-evidence-log` es el mismo comando instalado.)

`cycle` es lo que corre la tarea programada cada 15 minutos: fija y exporta el lote, ejecuta
`anchor/` como un proceso aparte con `--batch lote.json --receipt recibo.json` y
registra el recibo. Códigos de salida:

| Código | Significado |
|---|---|
| 0 | Lote anclado y registrado, o nada pendiente |
| 1 | El anclaje falló (Fabric caído, red, tiempo agotado): no se registro nada; la siguiente corrida reintenta el mismo lote |
| 2 | Error de uso o configuración |
| 3 | **Alerta**: el recibo no corresponde a la bitácora o contradice uno registrado; hay que investigar |

`status` imprime un JSON para el panel de `mi-app-qr`: eventos pendientes, fecha del
evento pendiente más antiguo, último lote anclado y `stale`, que es `true` si hay
eventos sin anclar desde hace más de 2 horas (configurable con
`--stale-after-seconds`).

Con `--status-file`, `cycle` escribe ese mismo JSON (más `written_at`) al terminar cada
corrida, también cuando falla, con reemplazo atómico. El servidor de `mi-app-qr` solo lo
lee y alerta si `stale` es verdadero **o** si el archivo tiene más de 2 horas, lo que
también detecta que la tarea programada dejó de correr.

### Formato de los archivos (contrato con `anchor/`)

Lote que escribe `export-batch` (solo hashes y números de evento, nunca datos
personales):

```json
{"version": 1, "batch_id": "ccav-portal-1:seq-000101-000600", "first_event": 101, "last_event": 600, "hashes": ["..."]}
```

Recibo que escribe `anchor/` y lee `record-receipt`:

```json
{"version": 1, "batch_id": "ccav-portal-1:seq-000101-000600", "merkle_root": "<64 hex>",
 "first_event": 101, "last_event": 600, "event_count": 500,
 "transaction_id": "<id de transacción en Fabric>", "block_number": 1234,
 "anchored_at": 1800000000.0}
```

### Tarea programada

Linux (`/etc/cron.d/secureqr-id`, cada 15 minutos; el sexto campo es la cuenta que lo ejecuta):

```cron
*/15 * * * * secureqr python -m secureqr_evidence_log cycle --db /var/lib/secureqr-id/evidence.sqlite3 --verifier-id ccav-portal-1 --workdir /var/lib/secureqr-id/anclaje --status-file /var/lib/secureqr-id/anclaje/estado.json --anchor-command "node /opt/secureqr-id/anchor/dist/cli.js anclar" >> /var/log/secureqr-id/anclaje.log 2>&1
```

Windows (Programador de tareas):

```powershell
schtasks /Create /SC MINUTE /MO 15 /TN "SecureQR-ID anclaje" /RU secureqr `
  /TR "python -m secureqr_evidence_log cycle --db C:\secureqr-id\evidence.sqlite3 --verifier-id ccav-portal-1 --workdir C:\secureqr-id\anclaje --status-file C:\secureqr-id\anclaje\estado.json --anchor-command \"node C:\secureqr-id\anchor\dist\cli.js anclar\""
```

Si una corrida se superpone con la anterior (Fabric lento), ambas exportan el mismo
`loteId`; el contrato rechaza el segundo registro y el recibo se registra una sola vez.


## Sellado diario en OpenTimestamps (issue #94, ADR-0017 punto 7)

Una vez al día se sella el **hash del último bloque** del canal de Fabric (consulta
`GetChainInfo` de `qscc`); un solo sello cubre los lotes de todas las instalaciones.
Se usa el cliente oficial en Python (`pip install opentimestamps-client`, comando `ots`)
como proceso aparte; este paquete no añade dependencias.

```bash
python -m secureqr_evidence_log seal         --seals-dir sellos --block-hash <64 hex>
python -m secureqr_evidence_log seal-upgrade --seals-dir sellos
```

Por cada bloque quedan `bloque-<hash>.txt` (lo que se sella) y `bloque-<hash>.txt.ots`
(el comprobante), juntos. Sin internet o con los calendarios caídos el sello queda
pendiente y se reintenta en la siguiente corrida; salida `0` si hay comprobante (aunque
falte completarlo), `1` si ni siquiera se pudo crear, `2` por entrada inválida. Un sello
pendiente nunca bloquea la validación ni el anclaje. Un comprobante se considera completo
cuando `ots upgrade` lo actualizó (deja el original en `.bak`).

**No se ejecuta `ots verify` aquí:** necesita un nodo de Bitcoin y no se instala en el
servidor del CCAV. La verificación independiente se hace aparte, desde un equipo con
Bitcoin Core podado, y se documenta como evidencia de la tesis.
