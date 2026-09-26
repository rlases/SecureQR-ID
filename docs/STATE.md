# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-09-26
**Fase actual:** Fase 3 de `ROADMAP.md` (desarrollo tecnológico) — los cinco módulos
tienen código fusionado en `main`, pero **`anchor/` solo cierra la mitad de lo que exige
ADR-0007**: PR #61 fusionó la construcción del árbol de Merkle, las pruebas de inclusión
y el contrato con `evidence-log/` (issue #9, ya cerrado en GitHub), pero el único
`LedgerClient` que existe es `InMemoryLedgerClient` (`anchor/src/anchoring.ts:6-9`) — un
doble de prueba, no una integración real. Ni el cliente Hyperledger Fabric
(`fabric-network`, ADR-0005) ni el sellado periódico con OpenTimestamps (ADR-0007)
están implementados; `anchor/package.json` no tiene ninguna de las dos dependencias.
Cerrar issue #9 fue prematuro respecto al alcance real de ADR-0007 — queda como gap sin
issue abierto que lo trackee, ver "Pendiente → Implementación". Nadie ha puesto el tag
`v0.1.0` que `ROADMAP.md` pide al cerrar cada fase — pendiente, decisión conjunta, no
depende solo de este gap. Issues #45-#47 (conectar `evidence-log/`/`revocation/` reales
en producción) y #48-#51 (`mi-app-qr/`) también siguen abiertos.

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
  espaciado, iconografía) → `docs/DESIGN-SYSTEM.md`. Asignado a Jhunier. **Borrador
  abierto en PR #62**, en revisión de Duverney — no cerrar el issue hasta acuerdo
  explícito sobre las cuatro divergencias que el documento deja pendientes (paleta
  única vs. dos lenguajes visuales, tokens de éxito/advertencia, pesos de fuente de
  `verifier-web/`, modo oscuro).
- Issue #56 — guía de contenido y microcopy en español (tono, mensajes de error/vacío,
  confirmaciones) → `docs/CONTENT-GUIDE.md`. Asignado a Jhunier. **Borrador abierto en
  PR #63**, en revisión de Duverney — quedan dos hallazgos por acordar: unificar el
  texto de carga (hoy inconsistente) y el vocabulario "editar" sobreviviente en
  componentes muertos (`EditRecordModal`, `ForgottenOutModal`) pese a ADR-0008.
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

- **Sin issue abierto todavía** — `anchor/`: cliente Hyperledger Fabric real
  (`fabric-network`) y sellado periódico con OpenTimestamps (ADR-0007). El issue #9 se
  cerró con solo la mitad de este alcance (Merkle + doble de prueba en memoria); hace
  falta un issue nuevo para la integración real antes de que la Fase 3 pueda darse por
  completa. No asignado — decisión conjunta pendiente, igual que el resto del reparto
  nuevo (ver convención en `CLAUDE.md`).
- Issue #45 — conectar `evidence-log/` real en `verifier/` (que cada validación
  **aceptada** quede registrada en la bitácora — `ARCHITECTURE.md` líneas 27 y 46-59
  solo contempla eventos aceptados, y `REJECTED_RESULT` en `verifier.py` nunca lleva
  `credential_id`, así que un rechazo no tiene con qué construir un `Event` sin inventar
  un identificador o exponer datos que ADR-0011 mantiene fuera de la respuesta pública).
  Seguimiento directo de PR #43.
- Issue #46 — conectar `RevocationList` real como `revocation_checker` al construir el
  `Verifier` de producción. Seguimiento directo de PR #44.
- Issue #47 — distribución de la lista de revocación a verificadores con conectividad
  intermitente (decisión de arquitectura abierta en `ARCHITECTURE.md` desde el inicio).
  ninguno está en uso todavía. Decisión previa obligatoria: `EditRecordModal` edita en
  sitio (esquema del prototipo viejo); `RegistrosPage` ya tiene un flujo de corrección
  append-only (`CorregirRegistroModal`, ADR-0008) — no cablearlo a ciegas. Requiere
  familiarizarse primero con `mi-app-qr/client`, que hasta ahora solo tocó Jhunier.
- Issue #49 — empaquetado con `electron-builder` (instalador `.exe` con
  `server/dist`, `server/node_modules` incluyendo `better-sqlite3` recompilado contra
  la ABI de Electron, y `client/dist`). Hasta que exista, la app solo corre sin
  empaquetar (`npm run electron-dev`), lo que exige Node.js instalado en el equipo que
  actúa como servidor.
- Issue #51 — HTTPS en la red del CCAV (ADR-0008).

**Jhunier** — issue #50 (decisión de producto sobre el sistema de licencia/prueba en
`main.js`), resuelto por él mismo en este mismo PR — ver "Hecho" arriba. Excepción
puntual al reparto por equidad de carga, no lo cambia de fondo: sigue sin tomar más
issues de implementación esta vuelta, más allá de este. Disponible para revisión
cruzada (obligatoria por `CONTRIBUTING.md` en cada PR que abra Duverney) y para las
decisiones conjuntas de abajo.

**Conjunta** (ninguno de los dos decide solo):

- Decisiones de producto sobre correcciones: que un operador corrija sus propios
  registros; deshacer una corrección. Sin issue todavía — quedan fuera de alcance a
  propósito del plan de corrección de registros ya cerrado (PR #28). (El historial
  completo de la cadena ya no está pendiente: PR #41, issue #38.)
- Fase 4/5 de `ROADMAP.md` (batería de ataques, instrumentos de evaluación, piloto,
  manuales, publicación) — trabajo conjunto de investigación, todavía no tiene issues
  de código.

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

**2026-09-26 — Issues #55 y #56: borradores abiertos como PR, en revisión.** Jhunier
redactó `docs/DESIGN-SYSTEM.md` (PR #62) y `docs/CONTENT-GUIDE.md` (PR #63), ambos
extrayendo valores y textos reales del código en vez de inventar estándares — colores
HSL de `mi-app-qr/client`, paleta CSS de `verifier-web/`, mensajes de error/vacío
existentes, la restricción de mensajes genéricos de ADR-0012. Hallazgo no anticipado en
el issue original: `mi-app-qr/client` y `verifier-web/` no comparten hoy ningún sistema
de tokens (paletas y escalas tipográficas completamente distintas) — se documenta el
estado real de cada una en vez de forzar una tabla única. Ambos PR quedan como borrador,
con revisión pedida explícitamente a Duverney, tal como exige el issue ("decisión
conjunta, redacción individual") — no se cierran con la aprobación de PR de rutina.
Puntos concretos que quedan para acordar entre los dos: si unificar paleta entre las dos
apps, tokenizar éxito/advertencia, normalizar pesos de fuente de `verifier-web/`, modo
oscuro (issue #55); y unificar el texto de carga inconsistente y confirmar que
"editar/edición" queda prohibido pese a seguir en componentes muertos (issue #56).

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
