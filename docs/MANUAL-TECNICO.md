# Manual técnico de SecureQR-ID

Referencia de instalación, operación y recuperación del prototipo de investigación.
La arquitectura y las decisiones normativas del código están en
[ARCHITECTURE.md](ARCHITECTURE.md), [SQRID-1.md](SQRID-1.md) y [DECISIONS.md](DECISIONS.md).
La instalación en el CCAV es una extensión opcional; los procedimientos siguientes
también sirven para un entorno de laboratorio independiente de esa sede.

## Componentes y límites

| Componente | Función y límite |
|---|---|
| `issuer/` | Firma tokens y custodia la clave de emisión; su servicio escucha solo en loopback |
| `verifier/` | Comprueba formato/firma, frescura, nonce y revocación; no firma ni conoce al titular |
| `revocation/` | Firma y verifica listas con una clave dedicada, distinta de la de emisión |
| `evidence-log/` | Guarda eventos encadenados, prepara lotes y registra recibos de anclaje |
| `anchor/` y contrato Go | Merkle, registro de raíces y verificación contra Fabric; no reciben datos personales |
| `verifier-service/` | Compone los módulos Python y expone la API del verificador |
| `verifier-web/` | Captura el QR y muestra la decisión; trata el token como texto opaco |
| `mi-app-qr/` | Electron, cliente y servidor de registros administrativos, titulares y portal del teléfono |
| `evaluation/` | Herramienta aislada de evaluación; usa claves y datos sintéticos |

Los módulos Python tienen sus propios paquetes y entornos. Los límites Python/Node
son servicios o archivos, no importaciones cruzadas. La validación no espera a Fabric:
el anclaje se ejecuta aparte. El registro de asistencia de `mi-app-qr` no se crea
automáticamente por aceptar un token en `verifier-web`.

## Requisitos

- Git, Python 3.11 o posterior y Node 22.12 o posterior para las herramientas descritas.
- Dependencias instaladas desde los archivos del repositorio; conservar los lockfiles.
- Para la integración Fabric: Docker, las herramientas y la versión de Go indicadas
  en `anchor/chaincode/go.mod` y [la guía de la red](../infra/fabric/README.md).
- Para compilar un instalador Windows: equipo de compilación Windows, Electron y las
  herramientas nativas requeridas por la reconstrucción de `better-sqlite3`.
- Reloj sincronizado, almacenamiento persistente y acceso HTTPS para un despliegue
  fuera de loopback. La cámara del navegador necesita un contexto seguro.

`v0.3.0` identifica una fase del repositorio completo. La versión `0.1.5` de
`mi-app-qr/package.json` es la del paquete de escritorio y puede diferir. Ninguna
de las dos implica una auditoría independiente de producción.

## Descargar y seleccionar una revisión

```bash
git clone https://github.com/rlases/SecureQR-ID.git
cd SecureQR-ID
git fetch --tags
git checkout v0.3.0
```

Para desarrollar cambios, crear una rama desde `main` actualizado conforme a
[CONTRIBUTING.md](../CONTRIBUTING.md). No modificar `baseline-o3`: es la línea base
histórica de la evaluación. Registrar el commit exacto junto a cada resultado.

## Cliente administrativo y aplicación Electron

Desde la raíz, instalar y compilar los proyectos que realmente utiliza Electron:

```bash
npm --prefix mi-app-qr ci
npm --prefix mi-app-qr/server ci
npm --prefix mi-app-qr/client ci
npm --prefix mi-app-qr/server run build
npm --prefix mi-app-qr/client run build
npm --prefix mi-app-qr run electron-dev
```

El cliente actual es `mi-app-qr/client`, no la aplicación React antigua de `src/`.
Electron arranca el servidor compilado por HTTPS en el puerto 4000, espera su salud
y abre el cliente. Crea secretos y certificado propios de la instalación. El primer
arranque muestra las credenciales iniciales del administrador y la ruta de custodia.

El directorio de datos de Electron se obtiene con `app.getPath('userData')`. Según
la cuenta y el sistema puede ser `%APPDATA%/registro-qr` o `~/.config/registro-qr`;
comprobar la ruta real de la instalación antes de respaldar o restaurar.

| Archivo o carpeta bajo `userData` | Uso |
|---|---|
| `config.json` | URL y archivo secreto del emisor, rutas de anclaje y zona horaria |
| `server-secrets.json` | Sesión, credenciales iniciales y `ASIGNACIONES_KEY`; acceso restringido |
| `server-data/app.db` | Registro administrativo y titulares |
| `tls/` | Certificado y clave TLS de la instalación |
| `issuer.secret` | Secreto compartido por defecto con el emisor |
| `anclaje/` | Cabeza de asignaciones, compromisos, estado del ciclo y exportación de revocados |

`config.json` puede cambiar estas rutas mediante `emisor`, `anclaje`, `revocadosPath`
y `zonaHoraria`; el entorno tiene prioridad. Consultar
[`src/lib/serverEnv.js`](../mi-app-qr/src/lib/serverEnv.js). La contraseña del PEM
de emisión se retira del entorno del servidor hijo. Electron no arranca el emisor.

El arranque separado del servidor está documentado en
[`mi-app-qr/server/README.md`](../mi-app-qr/server/README.md). `SESSION_SECRET` y
`ASIGNACIONES_KEY` son obligatorias. No usar los textos de ejemplo de `.env.example`
como secretos reales ni copiar una base sin su procedimiento de custodia.

## Claves y emisión

1. Crear una cuenta del sistema exclusiva para el emisor y un directorio externo al
   repositorio que solo esa cuenta pueda leer.
2. Generar el par de emisión con `secureqr-issuer generate-key`, según
   [`issuer/README.md`](../issuer/README.md). El PEM privado se cifra; distribuir
   únicamente la clave pública y su `kid` a los verificadores.
3. Generar por separado la clave de revocación con `secureqr-revocation generate-key`.
   Su clave pública vive en otro directorio de confianza.
4. Crear el secreto compartido con `secureqr-issuer generate-secret --output <ruta>`.
   La cuenta del emisor y la del servidor pueden leerlo; no permite leer el PEM.
5. Arrancar `secureqr-issuer serve --port 8765` con las rutas configuradas y vigencia
   de 60 s. El custodio escribe la contraseña del PEM en la terminal.
6. Comprobar `GET http://127.0.0.1:8765/health` y conectar el mismo archivo secreto
   mediante `SQRID_ISSUER_SECRET_FILE` en el servidor administrativo.

El emisor se arranca de nuevo tras reiniciar el equipo. Mientras esté detenido,
el portal no puede emitir QR. No guardar su contraseña en el repositorio, argumentos
de comandos, tareas programadas ni el entorno de Electron.

## Punto de verificación

Instalar `verifier-service/` en su entorno, con las dependencias locales descritas
en [su README](../verifier-service/README.md). Configurar todas estas variables:

| Variable | Regla |
|---|---|
| `SQRID_VERIFIER_ID` | Identidad estable de la instalación |
| `SQRID_TRUSTED_KEYS_DIR` | Solo claves públicas de emisión confiables |
| `SQRID_REVOCATION_KEYS_DIR` | Claves públicas dedicadas de revocación, en otro directorio |
| `SQRID_REVOCATION_LIST_PATH` | Lista firmada vigente |
| `SQRID_REPLAY_DB_PATH` | SQLite persistente de nonces y control de reloj |
| `SQRID_EVIDENCE_DB_PATH` | SQLite persistente de evidencia, distinta de la anterior |
| `SQRID_CLOCK_SKEW_SECONDS` | De 0 a 60; la corrida oficial utilizó 30 |
| `SQRID_REVOCATION_MAX_AGE_SECONDS` | Vigencia máxima de la lista, según la operación acordada |
| `SQRID_REVOCATION_REFRESH_SECONDS` | Intervalo de recarga, menor que la vigencia máxima |

```bash
uvicorn --factory secureqr_verifier_service:create_app_from_environment --host 127.0.0.1 --port 8000
```

Compilar `verifier-web` con `npm ci` y `npm run build`. Publicar el frontend y `/api`
bajo el mismo origen HTTPS, con TLS delante del proceso Python. El fixture visual
de `verifier-web` acepta valores de demostración y nunca se utiliza como verificador real.

## Revocación y mantenimiento

La acción del administrador corta la emisión de QR nuevos. Para los tokens ya
emitidos, exportar los `cid` revocados, firmar y distribuir la lista actualizada:

```bash
secureqr-revocation sign --key /ruta/segura/revocacion.pem --input /ruta/revocados.txt --output /ruta/lista.sqrid
python -m secureqr_verifier_service.sync
```

La sincronización exige `SQRID_REVOCATION_URL` por HTTPS y las variables de confianza.
También se puede trasladar el archivo firmado por un medio autorizado: la firma
determina la confianza. Refirmar antes de la antigüedad máxima incluso sin cambios.
Una lista vencida provoca rechazo; una lista nueva inválida no reemplaza la vigente.

No intercambiar las claves de emisión y revocación. Una rotación requiere distribuir
la nueva clave pública y comprobar la lista, antes de retirar la confianza anterior.

## Anclaje y sello externo

La red Fabric se crea una vez con `infra/fabric/crear-red.sh`. Después se utilizan
`detener-red.sh` y `arrancar-red.sh`. `network.sh down` borra el ledger y no es
un procedimiento de reinicio o recuperación.

Programar `evidence-log cycle` con las rutas de cabeza, compromisos y estado conforme
a [INSTALACION-CCAV.md, sección 7](INSTALACION-CCAV.md#7-tareas-programadas).
El ejemplo Linux se adapta a la cuenta y las rutas reales aunque no se instale en el CCAV.
Usar el intérprete absoluto del entorno en tareas programadas.

Revisar el estado del ciclo y las alertas de más de dos horas sin anclaje. El fallo
de Fabric no autoriza a suprimir eventos ni a declarar anclado un lote pendiente.
El sellado de `infra/fabric/sellar.sh` puede quedar pendiente de calendarios y de
confirmación en Bitcoin. Conservar su estado real; no afirmar confirmación externa
porque la raíz exista en Fabric.

## Respaldo, recuperación y cierre de datos

- Cifrar el disco y los respaldos según ADR-0018. Utilizar copias SQLite consistentes,
  no una copia suelta del archivo de una base abierta sin su estado WAL.
- Guardar las claves, `server-secrets.json` y `ASIGNACIONES_KEY` en un medio separado
  del respaldo de las bases. Restringir también el acceso a `userData`.
- El respaldo de la red Fabric contiene material privado y necesita custodia cifrada.
- Practicar la restauración en un entorno aislado. Conservar las bases originales y
  comprobar integridad, asignaciones y raíces externas antes de reabrir el servicio.
- La pérdida de `ASIGNACIONES_KEY` no se resuelve generando otra para la misma base:
  el historial deja de verificar. Recuperar la clave original o aplicar un plan de
  recuperación documentado sin atribuir integridad a datos que no se pueden comprobar.
- Un retroceso respecto a compromisos anclados se investiga; no se recalcula ni se
  trunca una cadena para ocultarlo.

Los scripts y la prueba de respaldo están en `infra/respaldo/`; los pasos completos
de restauración y conservación están en [la sección 11 de la guía](INSTALACION-CCAV.md#11-respaldo-diario-de-las-bases-adr-0018).
Al cerrar una eventual medición, aplicar la anonimización y la destrucción de las
identidades de respaldo conforme a ADR-0016/0018. El comando de anonimización es
destructivo: confirmar el alcance con el responsable y conservar solo la evidencia
permitida. No ejecutar cierres contra datos de terceros para probar el software.

## Evaluación reproducible

Crear el entorno de la herramienta e instalar sus dependencias desde sus carpetas:

```bash
cd evaluation
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ../issuer -e "../verifier[web]" -e ../revocation -e ../evidence-log -e ../verifier-service -e ".[test]"
python -m pytest
```

En Windows, activar con `.venv\Scripts\Activate.ps1`. Las pruebas M3 necesitan el
servidor Node compilado y M2 una red Fabric real. La omisión de un caso se informa,
no se contabiliza como prueba aprobada.

La corrida completa se lanza desde Actions, **Batería de ataques — corrida completa**,
con 200 intentos, 1000 controles y semilla `20261027`. El flujo prepara Fabric y
guarda la batería, `tradicional/` y `comparacion/` como artefacto. Descargarlo antes
de su vencimiento y conservar sus entornos originales y hashes.

Para repetir solo la línea base, en otra terminal:

```bash
cd evaluation/baseline
npm ci
node --import tsx src/cli.ts --intentos 200 --control 1000 --semilla 20261027 --salida ../resultados/tradicional
```

Para recalcular una comparación existente, seguir el
[README de la evidencia](../evaluation/evidencia/2026-10-28/README.md). Las carpetas
de salida deben ser nuevas o vacías. Nunca usar claves ni datos de una instalación
real para ejecutar ataques de la batería.

## Empaquetado y entrega Windows

En una copia dedicada al empaquetado, instalar las dependencias de raíz, servidor y
cliente, compilar y ejecutar `npm run dist` dentro de `mi-app-qr`. El paso `prepack`
reinstala las dependencias de producción del servidor y recompila `better-sqlite3`
para la ABI de Electron; no omitirlo ni copiar un binario nativo del Node del sistema.

Para volver a ejecutar el servidor con Node después de empaquetar, restaurar sus
dependencias con `npm ci` dentro de `mi-app-qr/server`. El módulo nativo reconstruido
para Electron no es intercambiable con el del Node del sistema.

El instalador NSIS es solo la aplicación administrativa. No incluye por sí solo
los entornos Python, las claves institucionales ni una red Fabric lista para operar.
La aceptación en un Windows limpio se registra según [ENTREGA.md](ENTREGA.md).
Una compilación exitosa no sustituye esa comprobación.
