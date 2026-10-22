# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-10-12
**Fase actual:** Fase 3 de `ROADMAP.md` (desarrollo tecnológico) en curso — la Fase 2
(diseño) ya cumple sus tres criterios de cierre: ADR-0005 aceptada, ADR-0007 aceptada,
`SQRID-1.md` dejó de ser borrador (ADR-0010) y el número de objetivos específicos quedó
unificado en tres (issue #4). Nadie ha puesto el tag `v0.1.0` que `ROADMAP.md` pide al
cerrar cada fase — pendiente, decisión conjunta, no depende de código. De los cinco
módulos de Fase 3 (`issuer/`, `verifier/`, `evidence-log/`, `revocation/`, `anchor/`)
solo falta `anchor/` (issue #9) para completarla.

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
  tipo `Registro` real — corregido tras revisión. El cableado del issue #48 está
  implementado en la rama `fix/48-integrar-componentes-registros`, pendiente de revisión
  cruzada y merge; ver "En curso" y la nota de sesión 2026-09-26.
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
- **Issue #4 cerrado — número de objetivos específicos unificado en tres.** La
  propuesta de grado (`docs/raw/2026-02-propuesta-grado.md`) y la entrega de Etapa 2
  (`docs/raw/2026-03-etapa-2-requerimientos.md`) ya coincidían en tres; el desajuste
  estaba en entregables posteriores del curso (Fase 4, Etapa 5) que reservaban espacio
  para un cuarto, fuera de este repositorio. Se decidió mantener los tres objetivos
  específicos ya redactados y ajustar esos entregables en consecuencia — no al revés.
  Notas de reconciliación en ambos documentos de `docs/raw/` actualizadas de
  "pendiente" a "resuelto".
- **Sistema de licencia/prueba adaptado al modelo cliente-servidor.** Decisión de
  Jhunier: no se elimina, se adapta. Antes era código muerto — un handler IPC
  (`check-license`) que solo el renderer viejo (`src/App.js`, nunca cargado desde que
  `main.js` sirve `localhost:4000`) invocaba. Pasó a ser una función que bloquea el
  arranque del servidor mismo (`app.whenReady().then(loadConfiguration).then(checkLicense).then(startServer)...`):
  si la licencia está vencida o manipulada, el servidor nunca se levanta y nadie en la
  red institucional puede usar la app, en vez de comprobarse por sesión de un renderer
  que ya nadie carga. Se quitó `checkLicense` de `preload.js` (sin consumidor legítimo
  ya). `src/App.js` sigue con su propia referencia a `window.electronAPI.checkLicense`,
  pero como ese archivo entero ya estaba huérfano (no lo carga ninguna ventana), no
  introduce ningún problema nuevo — es limpieza aparte, no parte de esta decisión.
- **Issue #45 — validación aceptada registrada en `evidence-log/` (PR #68 fusionado).**
  `RecordingVerifier` (en `verifier/`, sin importar `evidence-log/`) envuelve al
  `Verifier` y encadena cada aceptación; si la bitácora falla, rechaza (falla cerrado).
  `EvidenceLog.append_event` pasa a ser atómico con `BEGIN IMMEDIATE` y seguro entre
  hilos: antes, dos aceptaciones concurrentes bifurcaban la cadena (bug reproducido
  contra el código anterior durante la revisión cruzada, confirmando que el fix era
  real). ADR-0013 revisado y verificado por Jhunier con los test suites reales.
- **Issue #46 — arranque de producción con `RevocationList` real (PR #69 fusionado).**
  Nuevo paquete `verifier-service/` que compone verifier, revocation y evidence-log
  desde variables `SQRID_*` obligatorias y falla al arrancar si la lista o la bitácora
  no son confiables. La lista se firma con una clave de revocación dedicada, en un
  directorio de confianza propio. `revocation/` ahora verifica la lista con las reglas
  de un token (low-S, 64 bytes, `kid` ligado, `cids` tipados) — los tres defectos
  reportados (firma *high-S*, `cids` como texto iterado carácter por carácter, `kid`
  sin atar a la clave) verificados y confirmados corregidos. ADR-0014 revisado y
  verificado por Jhunier.
- **Issue #47 — distribución y frescura de la lista de revocación (PR #70 fusionado).**
  `RevocationListCache` con recarga en caliente, antirretroceso por `iat` y rechazo
  (falla cerrado) si la lista supera su antigüedad máxima; CLI `python -m
  secureqr_verifier_service.sync` para traerla por HTTPS con reemplazo atómico. ADR-0015
  revisado y verificado por Jhunier. **Queda pendiente, fuera de este PR:** decidir
  quién opera el servidor de publicación y la cadencia de refirmado — ver "Pendiente" y
  la nota de sesión de hoy.

- **Issue #48 — integración en `RegistrosPage` (PR #65 fusionado).**
  Se descarta y elimina `client/src/components/EditRecordModal.tsx` junto con sus
  pruebas aisladas; la única corrección sigue siendo `CorregirRegistroModal`, con
  motivo obligatorio y autorización `requireAdmin` en el servidor (ADR-0008).
  `ExportCsvModal` descarga todos los registros vigentes o un rol exacto, reutilizando
  el generador CSV de Informes (escape y protección de fórmulas); `null` identifica
  "todos" para no colisionar con un rol libre llamado `all`.
  `qrParser.parseQrTextData` rellena el formulario desde texto pegado o un lector que
  actúe como teclado; el usuario revisa y envía. No se añade cámara, consulta de URLs
  ni validación criptográfica o de vigencia; el parser HTML no se conecta a una red.
  `ForgottenOutModal` advierte si el último evento vigente del documento es entrada
  (orden por timestamp y luego id, incluidas correcciones), también el mismo día.
  Permite cancelar, confirmar otra entrada, o al admin revisar la entrada anterior
  mediante la corrección existente. No crea automáticamente una nueva entrada tras
  corregir, no convierte una entrada en salida y no inventa fechas de salida.
  El formulario permite registrar explícitamente entrada o salida mediante la API
  actual. El aviso usa el listado consultado (polling de 7s): es una ayuda de UX,
  no una garantía transaccional contra entradas concurrentes desde otros equipos.
  La API actual no admite añadir una salida omitida con fecha histórica; esa
  capacidad y su política de autorización quedan fuera de esta integración.
- **Issues #49 y #51 — empaquetado con `electron-builder` y HTTPS en la red del CCAV
  (PR #67 fusionado).** Ver "Cerrados desde el reparto original" en "Pendiente" para el
  detalle técnico.

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
  quedó sellado fuera de su control. Desbloquea issue #9 (`anchor/`) — `evidence-log/`
  (#7) ya se fusionó (PR #43), así que ya no lo bloquea ni en la práctica.

## Pendiente

### Bloqueantes

Ninguno por ahora — el único bloqueante que había (issue #4, número de objetivos
específicos) se resolvió el 2026-09-23, ver "Hecho" y nota de sesión.

### Diseño / frontend (nueva iniciativa 2026-09-23)

Objetivo: `mi-app-qr/client` y `verifier-web/` los usa personal institucional no
técnico — hace falta que se vean atractivos y consistentes entre sí, no solo
funcionales. Antes de repartir implementación visual, se documentan los estándares
compartidos, repartidos en partes iguales entre los dos autores (a diferencia del
reparto de módulos, aquí ninguno tiene ventaja de experiencia previa sobre el otro):

- Issue #55 — sistema de diseño: tokens visuales unificados (color, tipografía,
  espaciado, iconografía) → `docs/DESIGN-SYSTEM.md`. Asignado a Jhunier.
- Issue #56 — guía de contenido y microcopy en español (tono, mensajes de error/vacío,
  confirmaciones) → `docs/CONTENT-GUIDE.md`. Asignado a Jhunier.
- Issue #57 — catálogo de componentes UI y patrones de interacción (inventario de
  componentes, estados loading/vacío/error, patrón de modal de corrección) →
  `docs/COMPONENTS.md`. Asignado a Duverney.
- Issue #58 — guía de accesibilidad WCAG AA para todo el frontend (hoy ADR-0012 solo
  la exige en `verifier-web/`; se extiende a `mi-app-qr/client` con auditoría del
  estado actual) → `docs/ACCESSIBILITY.md`. Asignado a Duverney.

**Ajuste (2026-09-23, mismo día):** el asignado de cada issue redacta y hace el trabajo
de auditar/levantar el contenido, pero las decisiones de estilo en sí (valores de color,
tono, patrones de componente, qué es obligatorio en accesibilidad) no son suyas en
solitario — mismo patrón que un ADR en `docs/DECISIONS.md`: se propone, se discute entre
los dos autores, y solo entonces se cierra como estándar. Individual la ejecución,
conjunta la decisión. Los 4 issues ya se actualizaron con esta aclaración explícita.

Los cuatro son de documentación pura — ningún cambio de código todavía. La
implementación visual que salga de esto (aplicar el sistema de diseño a cada pantalla)
se reparte después, una vez existan los documentos, para que ambos trabajen sobre el
mismo estándar en vez de que cada uno resuelva lo mismo distinto.

### Implementación

Repartición actualizada 2026-09-23, ajustada el mismo día tras confirmar con Jhunier
que su lista de pendientes propia ya está corta (cerró la enorme mayoría de los PR del
repositorio) — ver nota de sesión más abajo. Los siete issues nuevos/reabiertos quedan
con Duverney; Jhunier no toma issue nuevo esta vuelta:

**Duverney** — su terceto original completo (`evidence-log/` y `revocation/` ya
fusionados hoy, PR #43 y #44) más el cierre de los frentes de `mi-app-qr/` que
estaban pendientes:

- Issue #9 — `anchor/`: Merkle + Hyperledger Fabric + sellado OpenTimestamps (ADR-0007).
- Issue #45 — conectar `evidence-log/` real en `verifier/`. Seguimiento directo de
  PR #43. Implementado en `modulo/45-evidence-log-verifier`, ya fusionado (PR #68);
  ver "Hecho".
- Issue #46 — conectar `RevocationList` real como `revocation_checker` al construir el
  `Verifier` de producción. Seguimiento directo de PR #44. Implementado en
  `modulo/46-revocation-produccion`, ya fusionado (PR #69); ver "Hecho".
- Issue #47 — distribución de la lista de revocación a verificadores con conectividad
  intermitente (decisión de arquitectura abierta en `ARCHITECTURE.md` desde el inicio).
  Implementado en `modulo/47-distribucion-revocacion` con ADR-0015 (*Propuesta*), ya
  fusionado (PR #70); ver "Hecho".

**Cerrados desde el reparto original (2026-09-26):**

- **Issue #48 — cablear los componentes migrados en `RegistrosPage`.** Cerrado por
  Duverney, PR #65 (fusionado): integró `ExportCsvModal`, `ForgottenOutModal` y
  `qrParser`; `EditRecordModal` se descartó a favor del flujo de corrección append-only
  ya existente (`CorregirRegistroModal`, ADR-0008), sin introducir una segunda vía de
  edición en sitio.
- **Issue #49 — empaquetado con `electron-builder`.** Resuelto por Jhunier, PR #67
  (fusionado). Excepción puntual al reparto por equidad — ver nota de sesión.
- **Issue #51 — HTTPS en la red del CCAV.** Resuelto por Jhunier, PR #67 (junto con
  #49, mismo PR — ver nota de sesión) — mecanismo documentado en ADR-0008.

**Jhunier** — issue #50 (decisión de producto sobre el sistema de licencia/prueba en
`main.js`), resuelto por él mismo — ver "Hecho" arriba; y ahora también #49/#51 (ver
nota de sesión 2026-09-26). Todas excepciones puntuales al reparto por equidad de
carga, no lo cambian de fondo: Jhunier sigue sin tomar issues de implementación nuevos
por iniciativa propia esta vuelta. Disponible para revisión cruzada (obligatoria por
`CONTRIBUTING.md` en cada PR que abra Duverney) y para las decisiones conjuntas de
abajo.

**Conjunta** (ninguno de los dos decide solo):

- Decisiones de producto sobre correcciones: que un operador corrija sus propios
  registros; deshacer una corrección. Sin issue todavía — quedan fuera de alcance a
  propósito del plan de corrección de registros ya cerrado (PR #28). (El historial
  completo de la cadena ya no está pendiente: PR #41, issue #38.)
- Fase 4/5 de `ROADMAP.md` (batería de ataques, instrumentos de evaluación, piloto,
  manuales, publicación) — trabajo conjunto de investigación, todavía no tiene issues
  de código.
- Quién opera el servidor de publicación de la lista de revocación y cada cuánto se
  refirma (ADR-0015 lo deja abierto a propósito). Propuesta de Jhunier en la nota de
  sesión 2026-10-12: quien administre el despliegue de `verifier-service/` en el piloto
  del CCAV Pitalito tenga la clave y refirme diario, con `SQRID_REVOCATION_MAX_AGE_SECONDS`
  en 48-72h y `SQRID_REVOCATION_REFRESH_SECONDS` en 300s. Sin confirmar con Duverney.
- Confirmar los estándares de #71/#58 (accesibilidad) y #72/#57 (catálogo de
  componentes) — siguen en borrador. Jhunier dejó respuestas a las preguntas abiertas de
  ambos en la nota de sesión 2026-10-12; falta acordarlas con Duverney.
- No existe aún una CLI para generar la clave de revocación ni firmar listas (anotado en
  ADR-0014/15); sin issue todavía.

WebSockets si el polling de 7s de `RegistrosPage` resulta insuficiente — no es
bloqueante todavía, sin issue.

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

**2026-10-12 — Revisión y fusión de #49/#51 (PR #67).** Jhunier, con el acuerdo
explícito de revisarlo él mismo por el tema de HTTPS (no cruzado por Duverney). Verifica
el certificado autofirmado persistente, `setCertificateVerifyProc` pineado a ese PEM
exacto, la cookie `secure` solo bajo HTTPS real, y el empaquetado con `electron-builder`
(`extraResources` para `server/node_modules`, recompilación de `better-sqlite3` contra
la ABI de Electron vía `ELECTRON_RUN_AS_NODE=1`). Verificación de punta a punta ya hecha
antes en la sesión: app empaquetada real arrancada, certificado generado, login con
cookie `Secure`. **No verificado:** instalar el `.exe` de Windows en una máquina limpia
(sin Windows disponible en este entorno) — queda pendiente de quien lo instale en el
CCAV. Al fusionar se aprovechó para poner al día el resto de `STATE.md`: issues #45-48
seguían marcados "pendiente de revisión" en varias secciones pese a estar ya fusionados
(PR #68, #69, #70, #65) — corregido en todas partes, no solo en la sección que tocaba
este PR. GitHub no deja autoaprobar el propio PR; quedó como revisión tipo comentario y
se fusionó directo como dueño del repositorio.

**2026-10-12 — Revisión cruzada y fusión de #45/#46/#47 (PR #68, #69, #70).** Jhunier.
Revisados en orden de dependencia, con los test suites reales corridos tras instalar
cada módulo (no solo confiando en la descripción del PR): en #68 se reprodujo el bug de
bifurcación de cadena contra el código anterior en `main` para confirmar que el fix era
real. Los tres quedaron sin hallazgos y se fusionaron con squash. ADR-0013/14/15
coinciden con lo implementado; recomendado pasarlos de *Propuesta* a *Aceptada*, aún sin
confirmar formalmente en `DECISIONS.md`. Nota técnica: cada squash-merge dejaba a la
siguiente rama marcada como "en conflicto" por git (mismo contenido, reescrito por el
squash) — se resolvió fusionando `main` dentro de las ramas de Duverney y pusheando
directo, verificando en cada caso que ningún lado perdiera contenido y volviendo a
correr los tests. Pendiente de Duverney: confirmar los ADR, las respuestas que dejó
Jhunier a las preguntas de #71/#58 y #72/#57 (siguen en borrador hasta entonces), y
quién opera el servidor de publicación de la lista de revocación y la cadencia de
refirmado (propuesta de Jhunier: diario, `MAX_AGE` 48-72h, `REFRESH` 300s). Pendiente de
Duverney también: revisión cruzada de #66 y #64 (de Jhunier, ninguno con aprobación
todavía) y confirmación del contenido de #63 (guía de contenido, ya verificado y listo
para revisión).

**2026-10-11 — Issue #47: lista de revocación con conectividad intermitente.** Duverney.
ADR-0015 (*Propuesta*) registrado antes de implementar. `RevocationListCache` en
`revocation/` (recarga, antirretroceso, antigüedad máxima con falla cerrada) y comando
de sincronización en `verifier-service/`. Dos variables nuevas obligatorias:
`SQRID_REVOCATION_MAX_AGE_SECONDS` y `SQRID_REVOCATION_REFRESH_SECONDS`. Verificación:
pytest en `revocation/` (53) y `verifier-service/` (48); fallos reales de red y de
esquema comprobados contra `https_fetch`. No se probó una descarga HTTPS exitosa contra
un servidor real. Pendiente: revisión de #68, #69 y este PR; definir quién opera el
servidor de publicación y la cadencia de refirmado; CLI para firmar listas.

**2026-10-11 — Issue #46: verificador real con revocación.** Duverney. Se crea
`verifier-service/` como capa de aplicación (ADR-0014, *Propuesta*): arranca el
`Verifier` con claves, nonces, `RevocationList.from_signed_bytes` y `RecordingVerifier`.
Decisiones: clave de revocación propia (no la del emisor) en directorio separado;
falla cerrado también al arrancar. Endurecimiento de `revocation/`: antes aceptaba
firmas *high-S* de cualquier longitud y convertía `cids = "abc"` en tres revocaciones.
Verificación: pytest en `verifier-service/` (24), `revocation/` (33), `verifier/` (83),
`evidence-log/` (13), `issuer/` (26), y arranque real con `uvicorn` (health, rechazo y
fallo de arranque sin lista). Pendiente: revisión de #68 y de este PR; CLI para firmar
listas; recarga y frescura de la lista (issue #47).

**2026-10-11 — Issue #45: bitácora conectada al verificador.** Duverney. Se compone
`Verifier` + `EvidenceLog` en la capa de aplicación mediante `RecordingVerifier`
(ADR-0013, *Propuesta*). Solo se registran aceptaciones, con `verifier_id` obligatorio
por instalación y una bitácora persistente por verificador, separada del almacén de
nonces. Un fallo al registrar produce el rechazo genérico y quema el nonce (documentado
y probado). Se corrigió una carrera real en `EvidenceLog`: sin transacción explícita,
escrituras concurrentes encadenaban sobre el mismo predecesor; además la conexión no
admitía hilos del servidor ASGI. Verificación local: `pytest` en `verifier/` (83) y
`evidence-log/` (13). CI del job `verifier-test` instala ahora `../evidence-log`.
Pendiente: revisión cruzada, CI del PR y decidir el punto de entrada de producción
(issue #46).

**2026-09-26 — Issue #48: componentes migrados conectados.** Se conserva la decisión
append-only de ADR-0008: se retira el modal de edición directa del cliente web y se
mantiene la corrección con motivo e historial. El prototipo Electron legado bajo
`mi-app-qr/src` no se modifica. Se integra la exportación CSV, la precarga desde QR de
texto y el aviso de posible salida olvidada, adaptando sus textos al modelo de eventos
separados. Un operador conserva la capacidad de crear entradas/salidas y confirmar
otra entrada, pero nunca recibe la acción de corregir. Los modales recién conectados
incluyen foco inicial, contención de Tab, Escape y restauración del foco.
Verificación local: `npm test` y `npm run build` en `mi-app-qr/client`; pruebas de
integración de QR, exportación, aviso, corrección, permisos, reintento y envío pendiente.
No se afirma validación manual en navegador ni E2E contra servidor real. Pendiente:
revisión cruzada y CI del PR antes de fusionar.

**2026-09-23 — Nueva iniciativa de diseño/frontend, repartida en partes iguales.**
Jhunier pidió mejorar el atractivo visual de `mi-app-qr/client` y `verifier-web/` para
el personal institucional que las usa, y que el trabajo quedara parejo entre los dos
autores — a diferencia de los módulos criptográficos, aquí ninguno tiene ventaja de
experiencia previa. Se crearon 4 issues de documentación pura (definir antes de
implementar): #55 y #56 para Jhunier (tokens visuales, contenido/microcopy); #57 y #58
para Duverney (catálogo de componentes, accesibilidad WCAG AA extendida a
`mi-app-qr/client`). Detalle en "Pendiente → Diseño / frontend" arriba. La
implementación visual que salga de estos documentos se repartirá después.

**2026-09-23 — Issue #50 cerrado: licencia/prueba adaptada, no eliminada.** Jhunier
decidió mantener el sistema de licencia/prueba de `main.js`, adaptándolo al modelo
cliente-servidor en vez de borrarlo. Detalle en "Hecho" arriba. Implementado
directamente por Jhunier pese a que el issue había quedado asignado a Duverney en el
reparto por equidad de carga — excepción puntual, no cambia el reparto general.

**2026-09-23 — Issue #4 cerrado: tres objetivos específicos.** Jhunier confirmó la
decisión: el proyecto queda en tres objetivos específicos (los de la propuesta de grado
y la Etapa 2, que ya coincidían entre sí). El desajuste que mantenía el issue abierto no
estaba en este repositorio, sino en entregables posteriores del curso (Fase 4, Etapa 5)
que reservaban espacio para un cuarto objetivo — se ajustan esos entregables, no la
propuesta ya sustentada. Con esto, y con los criterios de `ROADMAP.md` ya cumplidos
(ADR-0005, ADR-0007, `SQRID-1.md` fuera de borrador — ver PR #52), la Fase 2 no tiene
ya ningún bloqueante documentado en este repositorio.

**2026-09-23 — Ajuste del reparto: los 4 issues de `mi-app-qr/` también pasan a
Duverney.** El reparto inicial de esta misma fecha (nota siguiente) le había dejado a
Jhunier 4 issues nuevos (#48-#51) y a Duverney otros 4 (#9, #45-#47), en conteo parejo
pero no en carga real: Jhunier ya venía de cerrar ~29 PR contra 2 de Duverney, así que
"parejo en cantidad de issues nuevos" seguía sin ser equitativo. Se reasignaron #48-#51
a Duverney; Jhunier no toma issue de implementación nuevo esta vuelta. Único costo real:
Duverney tendrá que familiarizarse con `mi-app-qr/client`, que hasta ahora solo tocó
Jhunier — aceptado a cambio de la equidad.

**2026-09-23 — Repartición de pendientes por equidad de carga.** `evidence-log/`
(PR #43) y `revocation/` (PR #44) de Duverney se fusionaron hoy tras revisión cruzada
(se corrigió un hash ambiguo en `evidence-log/` — payload concatenado con `"|"` en vez
de codificación con prefijo de longitud, ver commit `d1a747a` en `main`) y resolución de
un conflicto real en `.github/workflows/ci.yml` entre ambos PR (ambos añadían su job al
mismo punto del archivo; se conservaron los dos). Con eso, el conteo de PR fusionados
del repositorio queda muy desbalanceado (~29 de Jhunier frente a 2 de Duverney, sin
contar los PR de infraestructura/documentación previos al reparto original de
`issuer/verifier` vs. `evidence-log/revocation/anchor`). Se repartieron los pendientes
de implementación en consecuencia — no por afinidad de módulo, sino para nivelar carga
acumulada: Duverney conserva y completa su terceto original (`anchor/` + conectar en
producción lo que ya construyó en `evidence-log/`/`revocation/`, issues #45-#47, más
#9 ya asignado); a Jhunier le tocó el cierre de frentes ya abiertos en `mi-app-qr/`
sin módulo criptográfico nuevo esta vuelta (issues #48-#51). Detalle completo en
"Pendiente → Implementación" arriba.

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

