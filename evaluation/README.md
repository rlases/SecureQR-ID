# Batería de ataques de SecureQR-ID

Prueba controlada del objetivo 3 (ADR-0019). Es una **herramienta de evaluación**, no un
módulo del protocolo: no firma, no valida y no agrega reglas. Ataca el sistema armado
solo por sus interfaces públicas y calcula la tasa de detección de credenciales
inválidas, el falso rechazo y el tiempo de validación.

## Instalación

Los paquetes del repositorio no están en PyPI; se instalan en modo editable:

```bash
cd evaluation
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e ../issuer -e "../verifier[web]" -e ../revocation -e ../evidence-log -e ../verifier-service -e ".[test]"
python -m pytest
```

## Uso

```bash
secureqr-eval casos                       # lista el catálogo
secureqr-eval run --salida resultados/    # corrida completa: 200 intentos por caso, 1000 de control
secureqr-eval run --casos control --control 100 --salida prueba/
```

| Opción | Por defecto | Qué hace |
|---|---|---|
| `--casos` | `todos` | Identificadores separados por comas (`control,F2,P1`) |
| `--intentos` | 200 | Intentos por caso malicioso |
| `--control` | 1000 | Tokens legítimos del grupo de control |
| `--semilla` | 20261027 | Semilla fija del informe del documento de grado |
| `--salida` | — | Carpeta nueva o vacía; nunca se sobrescriben resultados |

Termina con código 1 si algún caso se rechazó por un motivo distinto del esperado: eso
es un error de la batería, no una detección.

## Qué hace una corrida

1. Crea un entorno aislado en una carpeta temporal: claves de emisión y de revocación de
   prueba (con una contraseña aleatoria que solo vive en memoria), la lista de revocación
   firmada, las dos SQLite y un `verifier-service` real en `127.0.0.1` con `uvicorn`.
   Nunca usa la clave institucional ni datos del CCAV; los titulares son un `cid`
   aleatorio.
2. Presenta cada intento por `POST /api/verify` y mide el tiempo del lado del cliente.
3. Lee el **motivo interno** de cada rechazo del registro del servicio: lo arranca con un
   `--log-config` que escribe los registros de sus loggers en un archivo JSON por líneas.
   La respuesta pública sigue siendo genérica (ADR-0012).
4. Borra el entorno y escribe en `--salida`:

| Archivo | Contenido |
|---|---|
| `resultados.json`, `resultados.csv` | Una fila por intento: brazo, caso, clase, repetición, decisión pública, motivo interno, si el motivo era el esperado y milisegundos |
| `entorno.json` | Commit (y si había cambios sin confirmar), versiones, sistema operativo, semilla, fecha y parámetros |
| `resumen.json`, `informe.md` | Tasa de detección por clase, por caso y global con intervalo de Wilson al 95 %, falso rechazo y tiempo de validación (media, mediana y p95) |

La semilla elige las variantes de cada caso, con un generador por caso. Las claves y los
nonces salen del CSPRNG, así que dos corridas con la misma semilla hacen los mismos
intentos, pero no producen los mismos bytes.

## Catálogo

Cada caso tiene un identificador estable que el documento de grado cita tal cual. Un caso
malicioso debe terminar en rechazo, y por uno de sus motivos esperados.

| Caso | Qué se presenta | Motivo esperado |
|---|---|---|
| `control` | Token legítimo, emitido y presentado una sola vez dentro de su vigencia | se acepta |
| F1 | Bytes aleatorios (variante `bytes`) o un mapa con los siete campos y valores al azar (variante `mapa`), por turnos | `token_format` o `signature` |
| F2 | Token válido con un bit de la firma cambiado | `signature` |
| F3 | Un campo firmado alterado sin volver a firmar; `cid`, `exp`, `iat`, `n` y `kid` por turnos (la variante es el campo) | `signature` |
| F4 | La misma firma con `s' = n − s`, que ECDSA acepta pero SQRID/1 no (*low-S*) | `signature` |
| R1 | Token firmado con una clave P-256 ajena y el `kid` de confianza | `signature` |
| R2 | El mismo, con el `kid` de la clave ajena | `signature` |
| R3 | Firma válida de la clave de revocación, con su `kid` (ADR-0014) | `signature` |
| P1 | El mismo token, ya aceptado, presentado otra vez | `replay` |
| P2 | Dos presentaciones simultáneas del mismo token: se acepta como mucho una | `replay` en la otra |
| P3 | Token emitido de modo que `exp` más la tolerancia ya pasó | `expired` |
| P4 | Token con `iat` en el futuro, más allá de la tolerancia | `not_yet_valid` |
| P5 | Token aceptado, `verifier-service` reiniciado y el token otra vez (los nonces persisten) | `replay` |
| V1 | Token válido de un `cid` incluido en la lista firmada | `revoked` |
| V2 | Token válido con la lista vigente vencida (el servicio arranca con ella) | `revocation_unavailable` |
| M1 | Editar, borrar o reordenar un evento de la bitácora del servicio (por turnos) | `verify_chain`: el servicio no arranca |
| M2 | Bitácora anclada en Fabric, reescrita con la cadena recalculada (`editar` o `reordenar`) | `raiz_fabric`: `anchor verificar` no coincide |
| M3 | Alterar `asignaciones_cid` sin la clave: `editar_cid`, `reasignar` o `borrar` | `hmac`: `/api/titulares/integridad` da alerta |

Los tokens maliciosos se fabrican con `cryptography` y el formato publicado en
`docs/SQRID-1.md` (`sqrid.py`); la batería no importa `verifier/`.

- P3 y P4 controlan el tiempo con la emisión (`iat`/`exp`), nunca con el reloj del
  sistema.
- P2 solo comprueba que el mismo token no entre dos veces. Una captura presentada antes
  que el titular dentro de la vigencia se acepta por diseño y queda fuera de la tasa:
  es riesgo residual (ADR-0019, consecuencias). Si ninguna de las dos presentaciones
  entra, el intento se marca con el motivo `ninguna_aceptada`, que cuenta como error.
- V1 y V2 cambian la lista del entorno y la restauran al terminar, así que el orden de
  los casos no altera los demás.

- En los casos M, «detectado» significa que el sistema dio la alerta. La batería altera
  las bases **solo en la carpeta temporal de la corrida**, quitando el disparador de solo
  agregar como haría alguien con acceso al archivo, y las restaura después de cada intento.
- **Límite declarado:** quitar el **último** eslabón de una cadena no rompe ninguna
  verificación local, porque lo que queda sigue encadenado. Eso solo se detecta contra lo
  anclado (M2), así que M1 y M3 quitan eslabones intermedios.

El brazo tradicional contra `baseline-o3` llega en #155.

### Requisitos de M2 y M3

- **M3** arranca el servidor de `mi-app-qr` con su base, su `ASIGNACIONES_KEY` y su admin
  propios, y le habla solo por HTTP. Necesita Node y el servidor compilado
  (`npm install && npm run build` en `mi-app-qr/server`). Los titulares son sintéticos.
- **M2** necesita la red Fabric de `infra/fabric/` (`crear-red.sh`, con
  `SQRID_FABRIC_HOME`) y `anchor/` compilado. Ancla cada intento con el ciclo real
  (`evidence-log cycle` → `anchor anclar`), comprueba que la raíz verifica, reescribe la
  bitácora y vuelve a verificar. Por eso `todos` lo omite salvo con `--con-fabric`, y no
  corre en el CI reducido (ADR-0019, punto 7).

```bash
SQRID_FABRIC_HOME=~/secureqr-fabric secureqr-eval run --con-fabric --salida resultados/
```

## En CI

- **`evaluation-test`** (`ci.yml`) corre en cada PR que toque `evaluation/`, los módulos
  que ataca o el servidor de mi-app-qr. Ejecuta las pruebas del paquete y una versión
  reducida de la batería: 10 intentos por caso, 100 de control y sin M2. Si falla, sube
  el informe como artefacto.
- **`evaluacion.yml`** es la corrida completa, solo a mano (*Actions → Batería de
  ataques — corrida completa → Run workflow*). Usa 200 intentos por caso, 1000 de control
  y la semilla fija, y corre M2 contra una red Fabric efímera creada en el runner. La
  carpeta de resultados queda como artefacto `evaluacion-<run_id>` durante 90 días: hay
  que descargarla y guardarla con el documento de grado.
