# Servicio de verificación SecureQR-ID

Punto de arranque de producción del verificador (ADR-0014). Es la capa de aplicación:
compone `verifier/`, `revocation/` y `evidence-log/` y expone el adaptador HTTP que
consume `verifier-web/`. No contiene reglas de validación propias.

## Instalación

Los paquetes del repositorio no están en PyPI; se instalan en modo editable desde sus
carpetas:

```bash
cd verifier-service
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e "../verifier[web]" -e ../revocation -e ../evidence-log -e ".[serve]"
```

Para pruebas se añade `issuer/`, que solo se usa para emitir tokens reales en las pruebas:

```bash
python -m pip install -e ../issuer -e "../verifier[web]" -e ../revocation -e ../evidence-log -e ".[test]"
python -m pytest
```

## Configuración

Todas las variables son obligatorias y no tienen valor por defecto:

| Variable | Contenido |
|---|---|
| `SQRID_VERIFIER_ID` | Identificador de esta instalación en la bitácora (p. ej. `ccav-pitalito-porteria-1`) |
| `SQRID_TRUSTED_KEYS_DIR` | Directorio con las claves públicas de **emisión** (`<kid>.pem`) |
| `SQRID_REVOCATION_KEYS_DIR` | Directorio, distinto del anterior, con las claves públicas de **revocación** |
| `SQRID_REVOCATION_LIST_PATH` | Lista de revocación firmada (`SQRID-REVOKE/1`) |
| `SQRID_REPLAY_DB_PATH` | SQLite persistente de nonces y reloj |
| `SQRID_EVIDENCE_DB_PATH` | SQLite persistente de la bitácora, distinto del anterior |
| `SQRID_CLOCK_SKEW_SECONDS` | Entero entre 0 y 60 |

## Arranque

```bash
uvicorn --factory secureqr_verifier_service:create_app_from_environment --host 127.0.0.1 --port 8000
```

Sirve `/api` bajo el mismo origen HTTPS que `verifier-web/` (ADR-0012); la terminación
TLS va delante de este proceso.

## El servicio no arranca si…

- falta una variable o el desfase de reloj está fuera de 0–60;
- la lista de revocación no existe, está alterada, no está firmada con una clave de
  `SQRID_REVOCATION_KEYS_DIR`, o la firma una clave que también está en
  `SQRID_TRUSTED_KEYS_DIR`;
- los dos directorios de claves son el mismo;
- la bitácora es `:memory:`, coincide con el almacén de nonces o ya existe y no supera
  `verify_chain()`.

El mensaje de error nombra la variable o la etapa; nunca muestra claves, contenidos de
la lista ni identificadores de credencial.

## Actualizar la lista de revocación

La lista se carga una sola vez al arrancar. Para aplicar una lista nueva hay que
reemplazar el archivo y reiniciar el servicio. La distribución y recarga con
conectividad intermitente es el issue #47.
