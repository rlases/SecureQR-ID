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
disparadores que rechazan cualquier `UPDATE` o `DELETE` sobre `events` y `anclajes`.
Alguien con acceso al archivo puede quitarlos, pero no puede recalcular los hashes sin
que `verify_chain()` lo detecte, ni reescribir lo que ya se ancló en Fabric.

## Anclaje (issue #92, ADR-0017)

El estado de anclaje vive en la tabla `anclajes`, de solo agregar: un evento está
anclado si cae dentro del rango de algún anclaje registrado. Antes se marcaba con un
`UPDATE` sobre la tabla de eventos (`mark_batch_anchored`), que se eliminó.

- **Lotes contiguos con `loteId` determinista.** Cada lote empieza justo después del
  último evento anclado, tiene hasta 500 eventos (configurable) y se llama
  `seq-<primero>-<último>`. Mientras su recibo no se registre, el mismo rango vuelve a
  salir con el mismo `loteId`.
- **Recibo idempotente.** Registrar dos veces el mismo recibo no cambia nada. Un recibo
  distinto para un lote ya registrado, o uno que no empieza en el primer evento sin
  anclar o no cuadra con la cantidad de eventos, se rechaza.

### Comandos

```bash
python -m secureqr_evidence_log export-batch   --db evidence.sqlite3 --output lote.json
python -m secureqr_evidence_log record-receipt --db evidence.sqlite3 --receipt recibo.json
python -m secureqr_evidence_log status         --db evidence.sqlite3
python -m secureqr_evidence_log cycle --db evidence.sqlite3 --workdir /var/lib/secureqr-id/anclaje \
  --anchor-command "node /opt/secureqr-id/anchor/dist/cli.js anclar"
```

(`secureqr-evidence-log` es el mismo comando instalado.)

`cycle` es lo que corre la tarea programada cada 15 minutos: exporta el lote, ejecuta
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

### Formato de los archivos (contrato con `anchor/`)

Lote que escribe `export-batch` (solo hashes y números de evento, nunca datos
personales):

```json
{"version": 1, "batch_id": "seq-000101-000600", "first_event": 101, "last_event": 600, "hashes": ["..."]}
```

Recibo que escribe `anchor/` y lee `record-receipt`:

```json
{"version": 1, "batch_id": "seq-000101-000600", "merkle_root": "<64 hex>",
 "first_event": 101, "last_event": 600, "event_count": 500,
 "transaction_id": "<id de transacción en Fabric>", "block_number": 1234,
 "anchored_at": 1800000000.0}
```

### Tarea programada

Linux (`/etc/cron.d/secureqr-id`, cada 15 minutos; el sexto campo es la cuenta que lo ejecuta):

```cron
*/15 * * * * secureqr python -m secureqr_evidence_log cycle --db /var/lib/secureqr-id/evidence.sqlite3 --workdir /var/lib/secureqr-id/anclaje --anchor-command "node /opt/secureqr-id/anchor/dist/cli.js anclar" >> /var/log/secureqr-id/anclaje.log 2>&1
```

Windows (Programador de tareas):

```powershell
schtasks /Create /SC MINUTE /MO 15 /TN "SecureQR-ID anclaje" /RU secureqr `
  /TR "python -m secureqr_evidence_log cycle --db C:\secureqr-id\evidence.sqlite3 --workdir C:\secureqr-id\anclaje --anchor-command \"node C:\secureqr-id\anchor\dist\cli.js anclar\""
```

Si una corrida se superpone con la anterior (Fabric lento), ambas exportan el mismo
`loteId`; el contrato rechaza el segundo registro y el recibo se registra una sola vez.

