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
