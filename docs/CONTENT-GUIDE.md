# Guía de contenido y microcopy

> **Estado: acordada con Duverney en el PR #63 (issue #56).** Describe el tono y los patrones que ya usan
> `mi-app-qr/client` y `verifier-web/`, citando pantallas reales — no reescribe el copy
> existente. Señala también las inconsistencias encontradas y las reglas que aún no
> están decididas. Igual que un ADR (`docs/DECISIONS.md`), cualquier cambio posterior a esta
> guía debe acordarse explícitamente entre los dos autores — no basta con la aprobación
> de PR de rutina.

## Audiencia

`mi-app-qr/client` y `verifier-web/` las usa personal institucional **no técnico**:
vigilancia, administrativos, docentes (ADR-0009). El modelo de roles es deliberadamente
genérico — `admin`/`operador` como permiso fijo, más un campo `cargo` de texto libre
("vigilancia", "docente", "recepción") sin efecto en autorización — así que el copy
tampoco debe asumir vocabulario específico de un cargo institucional.

## Tono

Formal pero claro, sin jerga técnica ni códigos de error crudos.

**Tratamiento: tutear siempre.** Toda la interfaz se dirige a quien la usa de *tú*, de
forma consistente, y el copy nuevo debe seguir igual para no mezclar tratamientos. No se
encontró ninguna forma de *usted* en `mi-app-qr/client/src` ni en `verifier-web/src`.
Ejemplos reales:
- `mi-app-qr/client`: `"Intenta de nuevo."` (`RegistrosPage.tsx`), `"puedes corregirla"`
  (`ForgottenOutModal.tsx`), `"cópiala ahora"` (`UsuariosPage.tsx`), `"Selecciona qué
  registros deseas exportar"` (`ExportCsvModal.tsx`).
- `verifier-web`: `"Espera un momento…"`, `"Alinea la credencial…"`, `"Confirma el
  permiso…"`, `"Activa la cámara…"` (`ResultPanel.tsx`).

**Así sí** (ejemplos reales del repo):
- `"No fue posible cargar los registros."` + botón "Reintentar" (`InformesPage.tsx`)
- `"La credencial fue rechazada."` (`verifier-web`, `ResultPanel.tsx`) — genérico a
  propósito, ver la sección de `verifier-web` más abajo.
- `"Sin registros todavía."` (`RegistrosPage.tsx`) — dice lo que hay (nada), sin sonar a
  falla.

**Así no** (a evitar, aunque no aparezca literalmente en el repo hoy):
- Mostrar el código o mensaje crudo de una excepción del servidor.
- En `verifier-web`, cualquier mensaje que nombre la causa real de un rechazo
  ("firma inválida", "nonce ya usado", "credencial revocada") — ADR-0012 lo prohíbe
  explícitamente, ver más abajo.
- Vocabulario de "editar" para la corrección de un registro — ver Glosario.

## Estructura de mensajes de error

Patrón en uso en Dashboard, Informes e Historial de correcciones: **"No fue posible /
No se pudo" + verbo en infinitivo**, dentro de un contenedor con `role="alert"`, con
botón "Reintentar" cuando la operación se puede repetir.

| Pantalla | Mensaje real | Acción | `role="alert"` |
|---|---|---|---|
| Dashboard | `"No fue posible actualizar el resumen."` | Reintentar | Sí |
| Informes | `"No fue posible cargar los registros."` | Reintentar | Sí |
| Historial de correcciones | `"No se pudo cargar el historial."` | Reintentar | Sí |
| Login | `"No se pudo conectar con el servidor"` (*fallback* de red; si el servidor responde con un error, se muestra su mensaje tal cual) | — | **No** |

**Login es la excepción, no el patrón**: `LoginPage.tsx` muestra `serverError` en un
`<p>` simple, sin `role="alert"` ni región `aria-live` — un error al iniciar sesión no
se anuncia a quien usa un lector de pantalla. Es una inconsistencia real, señalada
también en la auditoría de accesibilidad del issue #58, no una variante aceptada del
patrón. Documentado aquí para que nadie copie la forma de Login como si fuera la
estructura correcta.

**Regla:** decir qué pasó y qué puede hacer la persona — nunca solo un término técnico
o un código. Mantener siempre esta misma estructura para mensajes nuevos.

### Caso especial: `verifier-web/` (ADR-0012)

`verifier-web/` tiene una restricción de seguridad explícita, no solo de estilo: **la
interfaz nunca diferencia públicamente entre firma inválida, expiración, replay,
revocación o una dependencia caída** (ADR-0012). Mostrar cuál de esas cuatro causas
ocurrió filtraría información que el modelo de amenazas protege. La única distinción
permitida es un fallo de transporte (el servicio no responde), porque ahí todavía no
existe ninguna decisión criptográfica que ocultar.

Mensajes reales (`ResultPanel.tsx`, función `getStatusCopy()`):

| Estado | Título | Descripción |
|---|---|---|
| Aceptado | `"Acceso validado"` | `"La credencial fue aceptada."` |
| Rechazado (cualquier causa) | `"Acceso denegado"` | `"La credencial fue rechazada."` |
| Servicio no disponible | `"Servicio no disponible"` | `"No se pudo completar la verificación."` |
| Verificando | `"Verificando credencial"` | `"Espera un momento antes de presentar otro código."` |
| Buscando código QR | `"Buscando código QR"` | `"Alinea la credencial dentro del marco de lectura."` |
| Solicitando cámara | `"Solicitando cámara"` | `"Confirma el permiso en el navegador para continuar."` |
| Listo | `"Listo para verificar"` | `"Activa la cámara o utiliza la entrada manual."` |

Esto está reforzado a nivel de código, no solo de convención: `verifierApi.ts` descarta
el campo `message` que llega del servidor y solo propaga un booleano `accepted`; el
texto que ve la persona lo redacta el propio frontend, no lo reenvía del backend. **Al
escribir copy nuevo para `verifier-web/`, nunca agregar un mensaje que dependa de la
causa interna del rechazo**, aunque técnicamente esté disponible en algún dato de
depuración.

## Estados vacíos

Ejemplos reales:

| Pantalla | Mensaje |
|---|---|
| Registros (vacío) | `"Sin registros todavía."` |
| Informes (sin resultados de filtro) | `"No hay registros que coincidan con los filtros."` |
| Dashboard (sin actividad) | `"Sin actividad registrada todavía."` |

Regla: decir que no hay nada que mostrar, sin que suene a error — ninguno de estos usa
`role="alert"` ni tono de falla.

**Inconsistencia encontrada:** el texto de *carga* (no el de
vacío) varía entre genérico y específico sin un criterio claro:

- Genérico: `"Cargando..."` (Registros, Usuarios, verificación de sesión)
- Específico: `"Cargando registros..."` (Informes), `"Cargando actividad..."` (Dashboard),
  `"Cargando historial..."` (`HistorialCorreccionesModal.tsx`)

Regla **acordada con Duverney** en la revisión del PR #63 (2026-10-12): usar siempre la forma específica, `"Cargando {objeto}..."`, porque orienta mejor a
alguien sin experiencia técnica sobre qué está tardando. Si se acepta, ajustar los tres
casos genéricos restantes en una tarea aparte (esta guía no reescribe copy existente).

## Confirmaciones y acciones irreversibles

Hay dos acciones de este tipo implementadas hoy, no solo una.

### Corregir un registro (`CorregirRegistroModal.tsx`)

Sigue el modelo append-only de ADR-0008: no hay "deshacer" ni "editar", solo un evento
correctivo nuevo que queda enlazado al anterior.

Información mínima que ya exige el formulario real y que debe mantenerse en cualquier
confirmación de este tipo:
- **Sobre qué registro se actúa**, con datos que la persona pueda verificar a simple
  vista (el diálogo real dice `"Corregir registro de {nombre}"`, no solo un ID).
- **Motivo obligatorio** — el campo `"Motivo de la corrección"` no se puede dejar
  vacío (`"El motivo es obligatorio"` si se intenta).
- **El verbo de la acción coincide con lo que realmente pasa**: el botón dice
  `"Guardar corrección"`, no "Guardar cambios" — porque no sobrescribe nada, agrega un
  evento nuevo. Ver Glosario.
- El registro corregido sigue siendo consultable: `HistorialCorreccionesModal.tsx`
  muestra `"Registro original"`, cada `"Corrección {n}"` con su motivo, y marca la
  vigente con la insignia `"Vigente"` — sin ninguna acción de mutación disponible ahí.

### Crear un usuario (`UsuariosPage.tsx`)

También es irreversible, aunque no se parezca a una corrección: `server/src/users/routes.ts`
solo expone `POST /` (crear) y `GET /` (listar) — no hay ruta para editar ni eliminar un
usuario, así que una cuenta creada por error no se puede quitar desde la aplicación.

A diferencia de corregir un registro, hoy **no hay ningún paso de confirmación** antes
de crear: el formulario se envía directo (`handleSubmit(onSubmit)`, sin `motivo` ni
diálogo de "¿estás seguro?"). Lo único que existe después de crear es el aviso de la
contraseña generada, que cumple su propio requisito de información mínima porque es
información que solo se muestra una vez:
- `"Usuario {username} creado. Contraseña generada (cópiala ahora — no se volverá a
  mostrar):"` — nombra qué se creó y advierte explícitamente que es la única
  oportunidad de ver la contraseña.
- Este aviso tampoco usa `role="status"` (hallazgo ya señalado en la auditoría del
  issue #58): un lector de pantalla no lo anuncia, así que alguien que no ve la pantalla
  podría no enterarse de que ahí está la contraseña que no se repetirá.

Si se decide agregar un paso de confirmación antes de crear (no implementado hoy),
debería seguir el mismo mínimo que la corrección: sobre quién se actúa (el `username`
elegido) y qué pasa exactamente (se crea la cuenta y no hay forma de deshacerlo desde
la aplicación).

## Glosario

| Término correcto | Significado | Evitar |
|---|---|---|
| **registro** | El objeto/evento en sí (una fila de la bitácora) | — |
| **entrada** / **salida** | El *tipo* o dirección de un registro (`tipo: 'entrada' \| 'salida'`) | Usarlos como sinónimo de "registro" |
| **corrección** / **corregir** | Única forma válida de referirse a modificar un registro ya guardado — siempre como evento nuevo append-only (ADR-0008) | **"editar" / "edición"** |
| **cargo** | Texto libre descriptivo del puesto de la persona usuaria (ADR-0009) — nunca controla permisos | Confundirlo con **rol** (`admin`/`operador`, el único que sí determina permisos) |

### Nota sobre "editar" — vocabulario prohibido, no solo desaconsejado

El componente `EditRecordModal.tsx` (título "Editar Registro", botón "Guardar
Cambios") era código muerto heredado del prototipo Electron viejo, de antes del flujo
de corrección actual — el propio ADR-0008 lo nombra como el problema que la corrección
append-only vino a resolver. Al integrar los componentes migrados en `RegistrosPage`
(issue #48, PR #65) se descartó y **se eliminó del repositorio**, y `ForgottenOutModal`
ya no mezcla "editar" con "corregir". Hoy no queda ningún rastro de ese vocabulario en
`mi-app-qr/client` (verificado, cero ocurrencias). La regla del glosario de arriba se
mantiene igual — **ninguna interfaz nueva debe usar "editar" para esta operación** —
pero ya no es una advertencia sobre código existente, sino la convención a seguir hacia
adelante.

## Aprobación

Borrador abierto por Jhunier. Revisado y verificado de nuevo el 2026-10-12: cada cita
de texto y cada afirmación sobre el código se comprobó contra `mi-app-qr/client/src/` y
`verifier-web/src/` tal como están hoy en `main`, no solo como estaban al redactar el
borrador — la tabla de estados de `verifier-web/` tenía 2 de 7 filas faltantes
(corregido arriba) y la nota sobre `EditRecordModal.tsx`/`ForgottenOutModal.tsx` estaba
desactualizada (ambos ya se resolvieron en PR #65, también corregido). Duverney revisó
el contenido completo en el PR #63 (2026-10-12): verificó las citas contra `main`,
acordó la regla del texto de carga y propuso la regla de tratamiento (tutear), que se
incorporó en la sección Tono.
