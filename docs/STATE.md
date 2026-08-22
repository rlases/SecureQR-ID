# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-08-22
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
  datos sensibles; CI tiene un job propio. PR #29 fusionado en `main` e issue #6
  cerrado. Duverney abrió el issue #30 (`verifier-web/`, portal visual de escaneo) como
  seguimiento — hecho, ver más abajo.
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
  registros vía la API, no solo con mocks). Ampliado desde entonces con Dashboard,
  Informes (issue #32, PR #34), la migración de los componentes de dominio del
  prototipo Electron viejo (`EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`,
  `qrParser` — issue #36, PR #39) y el historial de correcciones (issue #38, PR #41
  fusionado): `GET /:id/historial` recorre la cadena vía `corrige_registro_id`, con
  protección real ante ciclos y referencias rotas (probada con casos sintéticos, no solo
  el camino feliz), y un modal de solo lectura accesible a admin y operador — sin
  deshacer ni autocorrección. 62 tests con Vitest + Testing Library.
- **Gestión de usuarios integrada en `main` (PR #25):** endpoints de creación y listado
  restringidos a administradores, `UsuariosPage`, ruta protegida y acceso condicional
  desde el `Sidebar`, con pruebas de servidor y cliente.
- **`verifier-web/` (issue #30, PR #33 fusionado):** portal React/TypeScript aislado de
  `mi-app-qr`, con escaneo por cámara bajo acción explícita, entrada manual protegida,
  estados accesibles y un historial volátil que no conserva tokens. El navegador delega
  toda decisión al adaptador HTTP fail-closed de `verifier/`. ADR-0012 fija la frontera
  navegador/verificador. Vitest y Playwright/axe cubren privacidad, concurrencia, cámara
  y layouts de escritorio, tableta y móvil.
- **Dependencias vulnerables de `mi-app-qr/client` actualizadas (PR #37):** react-router
  6→7, vite 5→8, vitest 2→4 — saltos de versión mayor, verificados uno por uno contra el
  uso real del cliente (solo APIs declarativas de react-router, ninguna de las que
  cambiaron en v7). 0 vulnerabilidades tras la actualización.
- **Migración de componentes de dominio a TypeScript (issue #36→PR #39):**
  `EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`, `qrParser` portados del
  prototipo Electron viejo. La primera versión conservaba el esquema de datos del
  prototipo (`record.Entrada`/`Rol`/`Nombre` en mayúsculas, tipado `any`) en vez del
  tipo `Registro` real — corregido tras revisión. **Ninguno está cableado a
  `RegistrosPage` todavía** — ver "Pendiente → Implementación".
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

### Implementación

- `evidence-log/` — bitácora encadenada
- `anchor/` — Merkle + Hyperledger Fabric
- `revocation/` — lista firmada
- `mi-app-qr/client`: cablear en `RegistrosPage` los componentes migrados en PR #39
  (`EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`, `qrParser`) — existen pero
  ninguno está en uso todavía. Ojo: `EditRecordModal` edita en sitio (esquema del
  prototipo viejo); `RegistrosPage` ya tiene un flujo de corrección con `motivo`
  obligatorio y traza append-only (`CorregirRegistroModal`, ADR-0008) — decidir si
  `EditRecordModal` se descarta a favor de ese flujo en vez de introducir una segunda
  vía de edición que lo contradiga. WebSockets si el polling de 7s resulta insuficiente.
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
- **Decisiones de producto pendientes sobre correcciones:** que un operador corrija sus
  propios registros; deshacer una corrección. Ambas fuera de alcance a propósito del
  plan de corrección de registros ya cerrado. (Ver historial completo de la cadena ya
  no está pendiente: PR #41, issue #38.)

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

**2026-08-22 — PR #37, #39, #40, #41: dependencias, migración de componentes,
historial de correcciones.** Codex resolvió issue #36 (dependencias, PR #37, fusionado)
y issue #38 (historial de correcciones, PR #41). Antigravity resolvió issue #36→#39
(migración de componentes). Cada PR se revisó con código en mano, no solo el reporte de
la herramienta: en PR #39 se encontró que los componentes migrados usaban el esquema de
datos del prototipo viejo en vez del tipo `Registro` real (corregido tras pedir el
ajuste); en PR #41 se encontró que la afirmación "accesibilidad validada con Playwright
y axe" era falsa — `mi-app-qr/client` no tiene esa dependencia ni un solo `.spec.ts`
(la accesibilidad del modal nuevo sí es real: trap de foco, Escape, ARIA, con test
propio en Testing Library; se pidió corregir solo la afirmación, no bloqueante).

**Hallazgo operativo importante:** Antigravity trabaja directo sobre este mismo
directorio de trabajo (`C:\Users\rlas\Documents\CODE\RegistroQR`), no en una copia
aislada como Codex (que usa worktrees en `.superpowers/codex-issue-XX/`). Su checkout
de rama chocó con uno propio en curso y terminó filtrando archivos de PR #39 dentro de
la rama de limpieza de `App.jsx` (PR #40) sin que nadie lo pidiera. Se detectó por
`git status` mostrando archivos inesperados, se reconstruyó la rama afectada desde
`main` limpio y se corrigió con `--force-with-lease` (autorizado explícitamente antes de
forzar). **Pendiente:** que Antigravity pase a trabajar en su propia carpeta/clon para
que esto no se repita — mientras tanto, evitar operaciones de git propias justo después
de pedirle una tarea a Antigravity sin verificar primero en qué rama quedó el directorio
compartido.

**2026-08-22 — historial de correcciones (issue #38).** Se creó un worktree aislado
desde `origin/main` y se implementó con TDD el recorrido completo de una cadena de
correcciones. La API conserva el rol del registro como texto libre según ADR-0009 y
aplica la misma autenticación de lectura que el listado; la autorización de escritura
continúa limitada a `admin`. El modal presenta todas las versiones sin acciones de
mutación y cubre carga, orden, acceso de operador, `Escape` y restauración del foco.

**2026-08-22 — Limpieza de repositorio: `App.jsx` suelto.** Se eliminó `App.jsx` en la
raíz del repo. Verificación antes de borrar: sin `package.json`/`index.html` en la raíz
que lo referenciara, sin historial de commits desde el commit inicial del proyecto
(`d904f41`), y contenido claramente anterior y superado por `mi-app-qr/src/App.js`
(331 líneas vs. 527, sin las importaciones de `EditRecordModal`/`ExportCsvModal`/
`ForgottenOutModal`/`qrParser` que sí tiene la versión vigente). Bloqueante cerrado.

**2026-08-21 — `verifier-web/` (issue #30).** Se creó una rama y un worktree aislados
desde `main` para no interferir con el trabajo paralelo sobre `mi-app-qr`. ADR-0012 fija
la frontera navegador/verificador y la política de datos efímeros. Se implementó el
portal responsive, el adaptador FastAPI y suites unitarias/E2E con auditoría de
accesibilidad. El fixture HTTP incluido sirve solo para recorrer estados visuales en
loopback; la operación real exige el `Verifier` configurado y HTTPS bajo el mismo
origen. Después de una primera revisión visual ("no me gustó el diseño"), se rehizo la
capa de presentación sobre los mismos tokens de marca — resultado dominante a pantalla
completa en vez de una card pequeña, token en texto plano, header con más profundidad —
sin tocar la lógica ya probada; los mismos 13 tests Vitest y 9 Playwright/Axe siguen en
verde.

**2026-08-21 — Dashboard e Informes (issue #32, PR #34 fusionado).** Se creó el
worktree aislado `feat/32-dashboard-informes` desde `origin/main`. Con TDD se añadieron
Dashboard, Informes, las rutas explícitas de Registros y navegación responsive. Los
datos se agregan y filtran en el cliente; el CSV exporta únicamente las filas visibles y
protege campos interpretables como fórmulas. No se modificaron servidor, tipos
compartidos, `RegistrosPage` ni `UsuariosPage`.

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
