# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-08-21
**Fase actual:** diseño (Fase 2) con desarrollo tecnológico iniciado (Fase 3 de
`ROADMAP.md`); con ADR-0005 y ADR-0007 ya resueltas, falta solo que `SQRID-1.md` deje de
ser borrador para cerrar formalmente la Fase 2 (ver `ROADMAP.md`).

---

## Hecho

- Revisión sistemática de literatura completada — 24 estudios primarios, metodología SMS
  de Petersen et al. Artículo redactado.
- Brecha de investigación identificada y caracterizada.
- Modelo de amenazas derivado de la literatura, con controles asociados por capa.
- Flujo de validación definido (Algoritmo 1 del artículo).
- Análisis de contexto: PESTEL, DOFA, árbol de problemas, campos de fuerza.
- Diagnóstico del sector y antecedentes internacionales, nacionales y locales.
- Propuesta de grado presentada y sustentada.
- Estructura del repositorio y documentación base (`docs/`, ADRs, glosario, modelo de
  amenazas, especificación `SQRID/1`).
- **`issuer/` implementado en la rama `modulo/5-issuer-ecdsa`:** paquete Python
  independiente para emitir tokens `SQRID/1` con ECDSA P-256/SHA-256, CBOR determinista,
  firmas compactas *low-S*, nonces CSPRNG y claves PKCS#8 cifradas fuera del repositorio.
  ADR-0010 cierra el esquema criptográfico y la codificación. La batería de pytest cubre
  firma, canonicalización, `kid`, unicidad y no exposición de la clave privada; CI tiene
  un job propio. PR #27 fusionado en `main` e issue #5 cerrado.
- **`verifier/` implementado en la rama `modulo/6-verifier-portal`:** paquete Python
  independiente que valida `SQRID/1` en el orden firma → vigencia → nonce → revocación,
  rechaza firmas ECDSA no canónicas y falla cerrado ante claves o dependencias no
  disponibles. ADR-0011 fija un clock skew obligatorio de 0–60 segundos, máximo de
  reloj persistente, replay durable en SQLite y consumo atómico del nonce. La suite usa
  el issuer real y cubre reinicios, concurrencia, revocación y respuestas públicas sin
  datos sensibles; CI tiene un job propio. PR #29 fusionado en `main` e issue #6 cerrado.
  Duverney abrió el issue #30 (`verifier-web/`, portal visual de escaneo) como
  seguimiento — todavía sin triage.
- **`mi-app-qr` — corrección de registros (PR #28 fusionado):** un `admin` corrige un
  registro mal capturado insertando una fila nueva que apunta a la que corrige
  (`corrige_registro_id`) con `motivo` obligatorio, nunca sobrescribiendo — consistente
  con la invariante append-only de ADR-0008. `GET /api/registros` solo devuelve la
  punta vigente de cada cadena. Autorización real en `requireAdmin` (servidor); el
  botón "Corregir" en `RegistrosPage` es UX, no seguridad. 48 tests en servidor, 35 en
  cliente, todos en verde.
- **Prototipo funcional "Registro QR" (`mi-app-qr/`)**: app de escritorio Electron + React
  para registro de asistencia por QR, con formulario de registro, panel de control,
  edición de registros, exportación a CSV, selección de rol y sistema de licencia/prueba.
  Publicada en GitHub. **No implementa ningún control de seguridad de este diseño** —
  decodifica un QR de texto plano por expresión regular, sin firma ni anti-repetición.
  Es la línea base que motiva el problema de investigación, no un avance de `issuer/` o
  `verifier/`. Ver "Relación con el prototipo existente" en `ARCHITECTURE.md`.
- **Flujo de colaboración con Duverney Torres Figueroa (`Duverney24`):** invitado como
  colaborador del repositorio; issues creados para los dos ADR bloqueantes, el ajuste de
  objetivos específicos y los cinco módulos, con dependencias y milestones por fase de
  `ROADMAP.md`. Repartición inicial: `issuer/`+`verifier/` (núcleo de credencial) para
  Jhunier, `evidence-log/`+`revocation/`+`anchor/` (integridad y anclaje) para Duverney;
  los ADR y el ajuste de objetivos quedan como decisión conjunta.
- **Metodología de trabajo estipulada en `CONTRIBUTING.md`:** rama por tarea, PR
  obligatorio, revisión cruzada antes de fusionar, CI en verde como condición de merge.
  Rama `main` protegida en GitHub (PR + 1 aprobación + check de CI; el dueño del repo
  conserva push directo solo para emergencias justificadas).
- **Infraestructura de pruebas de `mi-app-qr/` reparada:** faltaban las dependencias de
  `@testing-library` (el test por defecto de Create React App nunca había corrido
  realmente). Se agregaron, se reescribió el smoke test para que valide contra la UI
  real de la app, y se añadió `.github/workflows/ci.yml` que lo ejecuta en cada PR.
- **`mi-app-qr/server`**: fundación del servidor multiusuario (ADR-0008) — Express +
  TypeScript + SQLite, autenticación con sesión, bloqueo tras intentos fallidos, y
  endpoints de registros protegidos. Probado con Vitest + Supertest.
- **`mi-app-qr/client`**: cliente web walking skeleton — Vite + React + TypeScript,
  Tailwind con el tema claro/índigo aprobado, shadcn/ui, `AuthContext`, `LoginPage`,
  `RequireAuth` + `Sidebar`, `RegistrosPage` (crear y listar con refetch cada 7s).
  Verificado de punta a punta contra el servidor real (login, crear y listar
  registros vía la API, no solo con mocks). 20 tests con Vitest + Testing Library.
  Dashboard e Informes quedan pendientes — ver "Implementación" abajo.
- **Gestión de usuarios integrada en `main` (PR #25):** endpoints de creación y listado
  restringidos a administradores, `UsuariosPage`, ruta protegida y acceso condicional
  desde el `Sidebar`, con pruebas de servidor y cliente.
- **Electron arranca el servidor real (ADR-0008 cerrado en su forma mínima):**
  `mi-app-qr/server` ahora sirve el build de `mi-app-qr/client` (fallback SPA), y
  `main.js` arranca ese servidor como proceso hijo al abrir la app, genera y
  persiste `SESSION_SECRET` + credenciales de admin en `userData` (primer
  arranque muestra un diálogo con la contraseña generada), y carga
  `http://localhost:4000` en la ventana — reemplazando por completo el dev
  server de Create React App al que apuntaba antes. Verificado de punta a punta
  con `npm run electron-dev`: login, crear/listar registros, y persistencia
  entre reinicios. Bloqueo real encontrado y resuelto durante la verificación:
  `better-sqlite3` está compilado contra la ABI de Node del sistema, no la que
  empaqueta Electron — se arrancó el servidor con un binario `node` real en vez
  de `process.execPath`, documentado en el propio código. **Limitación
  conocida:** el equipo que actúa como servidor necesita Node.js instalado
  mientras no exista un instalador empaquetado (`electron-builder`, fuera de
  alcance — ver "Implementación").

## En curso

- **Dashboard e Informes de `mi-app-qr/client` (issue #32):** implementación local en
  `feat/32-dashboard-informes`, aislada desde `main`. Dashboard pasa a `/`, Registros a
  `/registros` e Informes a `/informes`; los conteos, filtros y CSV se calculan en el
  cliente sobre los endpoints existentes. El catálogo de roles del informe se deriva
  de los registros cargados, sin vocabulario institucional hardcodeado (ADR-0009).
  Suite completa del cliente en 40 pruebas y build en verde; pendiente de publicación y
  revisión cruzada.
- Reconciliación de la documentación de investigación (traída del material de trabajo
  individual) con el estado real del código en este repositorio.
- **ADR-0008 — `mi-app-qr` pasa a servidor multiusuario en red.** Requerimiento nuevo:
  al ejecutarse, la app debe levantar un servidor accesible por IP en la red
  institucional, con login para personal (no estudiantes), roles diferenciados y
  generación de informes. Registrado como ADR en estado *Propuesta*; quedan pendientes
  el transporte cifrado y la política de auditoría (el motor de almacenamiento y el
  catálogo de roles ya se resolvieron — ver `DECISIONS.md` y ADR-0009 abajo).
  **Aclaración de foco (2026-08-20):** el cliente multiusuario es principalmente un
  módulo de gestión/verificación/extracción de datos (`Dashboard`, `Informes`,
  `Usuarios`) — no una terminal de registro. Que el personal también pueda registrar
  una entrada desde ahí es una capacidad secundaria que suma (útil para docentes), no
  el objetivo. Esto prioriza `Dashboard`/`Informes` por delante de ampliar
  `RegistrosPage`. Ver `DECISIONS.md` y las amenazas nuevas en `THREAT-MODEL.md`.
- **ADR-0009 — Modelo de roles genérico (permiso fijo + cargo en texto libre).**
  El `UserRole` original (`vigilancia`/`administrativo`/`docente`) estaba hardcodeado al
  vocabulario de la UNAD y nunca fue ratificado como decisión de producto. Se corrigió a
  dos niveles de permiso universales (`admin`/`operador`, con `CHECK` en la base de
  datos) más un campo `cargo` en texto libre, puramente descriptivo, sin efecto en
  autorización — así el proyecto puede usarse en instituciones distintas sin tocar
  código. Aplicado ya en `shared/src/types.ts`, el esquema de `users`, el seed de admin,
  y todos los tests afectados (27 en servidor, 20 en cliente, todos en verde). Principio
  general para todo el diseño en adelante: lo que varía por institución es
  configuración/texto libre, no código.
- **ADR-0007 — gobernanza de la red blockchain, cerrada.** Con la UNAD como único
  operador real (sin otra institución candidata a par independiente en esta fase),
  "definir pares independientes" en Fabric habría sido teatro. Se decidió un anclaje
  híbrido: Fabric se mantiene tal como ya estaba diseñado para la operación local, y
  además `anchor/` sella periódicamente la raíz vigente de la ledger con
  **OpenTimestamps** (Bitcoin, gratuito, sin infraestructura propia) — la pieza que
  responde la objeción real, porque la UNAD no puede alterar retroactivamente lo que ya
  quedó sellado fuera de su control. Desbloquea issue #9 (`anchor/`), aunque sigue
  esperando a `evidence-log/` (#7) en la práctica.

## Pendiente

### Bloqueantes

- **Unificar el número de objetivos específicos.** La propuesta define tres; la tabla de
  contenido de la Fase 4 y la Etapa 5 reserva espacio para cuatro. Debe cuadrar antes de
  la entrega final.
- **Limpieza de repositorio:** hay un `App.jsx` suelto en la raíz del repo, anterior a
  `mi-app-qr/src/App.js` y desactualizado respecto a él. Decidir si se elimina o se
  documenta por qué se conserva.

### Implementación

- `evidence-log/` — bitácora encadenada
- `anchor/` — Merkle + Hyperledger Fabric
- `revocation/` — lista firmada
- `mi-app-qr/client`: migración de los componentes de dominio existentes
  (`EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`, `qrParser.js`) y WebSockets
  si el polling de 7s resulta insuficiente. Dashboard e Informes están en curso en el
  issue #32.
- **Empaquetado con `electron-builder`** de la app integrada (instalador `.exe`
  distribuible con `server/dist`, `server/node_modules` — incluyendo el binario
  nativo de `better-sqlite3` recompilado contra la ABI de Electron, probablemente
  con `electron-rebuild` — y `client/dist`). Riesgo real de problemas específicos
  de plataforma; necesita su propio plan con su propia verificación (construir el
  instalador, instalarlo, correrlo). Hasta que esto exista, la app solo corre sin
  empaquetar (`npm run electron-dev`), lo que exige Node.js instalado en el
  equipo que actúa como servidor.
- **Decisión de producto pendiente:** qué hacer con el sistema de licencia/prueba
  existente en `main.js` frente al modelo multiusuario — el cliente nuevo no lo
  llama, quedó como código muerto sin que nadie lo haya decidido explícitamente.
- HTTPS en la red del CCAV — ya señalado como pendiente en ADR-0008.
- Ver historial completo de una cadena de correcciones de registro; que un operador
  corrija sus propios registros; deshacer una corrección — los tres fuera de alcance
  a propósito del plan de corrección de registros ya cerrado.

### Evaluación

- Diseño experimental cuasi-experimental pretest/postest
- Batería de ataques: repetición, falsificación de firma, reemplazo, manipulación interna
- Medición de latencia de validación y consumo de recursos
- Instrumentos Likert de usabilidad y aceptación
- Consentimiento informado y anonimización para la fase piloto

### Cierre

- Piloto en UNAD CCAV Pitalito
- Análisis estadístico de resultados
- Manual técnico y manual de usuario
- Publicación del repositorio y obtención de DOI vía Zenodo
- Envío del artículo (20CCC / CLEI / IEEE Access / JESTE)

---

## Notas de sesiones recientes

**2026-08-21 — Dashboard e Informes (issue #32).** Se creó el worktree aislado
`feat/32-dashboard-informes` desde `origin/main`. Con TDD se añadieron Dashboard,
Informes, las rutas explícitas de Registros y navegación responsive. Los datos se
agregan y filtran en el cliente; el CSV exporta únicamente las filas visibles y protege
campos interpretables como fórmulas. No se modificaron servidor, tipos compartidos,
`RegistrosPage` ni `UsuariosPage`.

**2026-08-20/21 — corrección de registros y limpieza de documentación.** Se diseñó
(brainstorming + spec aprobada) y se implementó en 6 tareas TDD, con revisión de dos
etapas por tarea más una revisión final holística, la corrección de registros en
`mi-app-qr` — ver "Hecho" arriba. PR #28 fusionado. Aparte, se cerró formalmente en
`DECISIONS.md` el motor de almacenamiento de ADR-0008 (ya estaba implementado de facto
desde hace varias sesiones, nunca se había vuelto a cerrar el ítem) y se puso al día
`STATE.md` con el cierre de `issuer/`/`verifier/` (issues #5 y #6) y de la gestión de
usuarios (issue #12) — esta rama (`docs/state-cierre-sesion`) tuvo que reconciliarse dos
veces porque `main` avanzó con el trabajo de `issuer/` y luego `verifier/` mientras
seguía abierta; en ambos casos se resolvió reconstruyendo sobre el `main` real en vez de
forzar el contenido viejo encima, para no revertir ADR-0010/ADR-0011 ni las notas de
sesión que esos merges ya habían agregado.

**2026-08-20 — `verifier/` (issue #6).** Se creó la rama aislada
`modulo/6-verifier-portal` desde `main` después del merge del issuer. Antes del código se
registró ADR-0011 para cerrar tolerancia de reloj, persistencia anti-replay y revocación
fail-closed. Se implementó el parser canónico, resolución de claves P-256, verificación
ECDSA *low-S*, estado SQLite y la interfaz obligatoria de revocación. Se añadieron 44
pruebas, incluidas interoperabilidad con `issuer/`, persistencia tras reinicio y carrera
concurrente del mismo token. No se generó ni versionó material criptográfico persistente.

**2026-08-20 — `issuer/` (issue #5).** Se creó un worktree y una rama aislados para no
interferir con el desarrollo paralelo de `mi-app-qr/`. Antes del código se registró
ADR-0010 y se concretó `SQRID/1`: P-256/SHA-256, CBOR determinista, firma P1363 de 64
bytes con `s` bajo, timestamps Unix UTC y transporte Base64url. Se implementó la CLI y
la API de emisión, se añadieron 26 pruebas y el job `issuer-test`. No se generó ni se
versionó material criptográfico persistente; las pruebas crean claves efímeras dentro de
los temporales de pytest.

**2026-08-12 — inicio del repositorio.**

Se creó el repositorio remoto `SecureQR-ID` en GitHub y se publicó el código existente de
`mi-app-qr/` (el commit inicial incluía por error los binarios de build de Electron —
`dist/`, ~400 MB, con archivos de más de 100 MB — lo que impedía el push; se sacaron del
historial y se agregó `/dist` a `.gitignore`). A continuación se incorporó a este
repositorio la documentación de investigación (arquitectura, ADRs, modelo de amenazas,
especificación `SQRID/1`, glosario, hoja de ruta) y se reconcilió `STATE.md` con el hecho
de que ya existe un prototipo funcional sin las capas de seguridad del diseño. Los
documentos fuente originales (propuesta de grado, entrega de Etapa 2, artículo SMS) se
destilaron en `docs/raw/`, con los datos personales de identificación (cédula, teléfono,
dirección de residencia) redactados antes de commitear — no pertenecen en un repositorio
público. Pendiente: revisar `docs/raw/` con el otro autor y resolver ADR-0005 y ADR-0007.
