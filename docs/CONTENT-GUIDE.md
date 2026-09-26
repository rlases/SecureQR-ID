# Guía de contenido y microcopy

> **Estado: borrador (issue #56).** Describe el tono y los patrones que ya usan
> `mi-app-qr/client` y `verifier-web/`, citando pantallas reales — no reescribe el copy
> existente. Señala también las inconsistencias encontradas y las reglas que aún no
> están decididas. Igual que un ADR (`docs/DECISIONS.md`), el contenido de esta guía no
> queda cerrado hasta que Duverney lo revise y lo acuerde explícitamente — no basta con
> la aprobación de PR de rutina.

## Audiencia

`mi-app-qr/client` y `verifier-web/` las usa personal institucional **no técnico**:
vigilancia, administrativos, docentes (ADR-0009). El modelo de roles es deliberadamente
genérico — `admin`/`operador` como permiso fijo, más un campo `cargo` de texto libre
("vigilancia", "docente", "recepción") sin efecto en autorización — así que el copy
tampoco debe asumir vocabulario específico de un cargo institucional.

## Tono

Formal pero claro, sin jerga técnica ni códigos de error crudos.

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

Patrón ya en uso, consistente en `mi-app-qr/client`: **"No fue posible / No se pudo" +
verbo en infinitivo**, dentro de un contenedor con `role="alert"`, con botón
"Reintentar" cuando la operación se puede repetir.

| Pantalla | Mensaje real | Acción |
|---|---|---|
| Dashboard | `"No fue posible actualizar el resumen."` | Reintentar |
| Informes | `"No fue posible cargar los registros."` | Reintentar |
| Historial de correcciones | `"No se pudo cargar el historial."` | Reintentar |
| Login | `"No se pudo conectar con el servidor"` (*fallback* de red; si el servidor responde con un error, se muestra su mensaje tal cual) | — |

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

**Inconsistencia encontrada, pendiente de acordar:** el texto de *carga* (no el de
vacío) varía entre genérico y específico sin un criterio claro:

- Genérico: `"Cargando..."` (Registros, Usuarios, verificación de sesión)
- Específico: `"Cargando registros..."` (Informes), `"Cargando actividad..."` (Dashboard)

Se propone una regla — **pendiente de acuerdo con Duverney, no decidida todavía**:
usar siempre la forma específica, `"Cargando {objeto}..."`, porque orienta mejor a
alguien sin experiencia técnica sobre qué está tardando. Si se acepta, ajustar los tres
casos genéricos restantes en una tarea aparte (esta guía no reescribe copy existente).

## Confirmaciones y acciones irreversibles

La única acción de este tipo implementada hoy es corregir un registro
(`CorregirRegistroModal.tsx`), que sigue el modelo append-only de ADR-0008: no hay
"deshacer" ni "editar", solo un evento correctivo nuevo que queda enlazado al anterior.

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

## Glosario

| Término correcto | Significado | Evitar |
|---|---|---|
| **registro** | El objeto/evento en sí (una fila de la bitácora) | — |
| **entrada** / **salida** | El *tipo* o dirección de un registro (`tipo: 'entrada' \| 'salida'`) | Usarlos como sinónimo de "registro" |
| **corrección** / **corregir** | Única forma válida de referirse a modificar un registro ya guardado — siempre como evento nuevo append-only (ADR-0008) | **"editar" / "edición"** |
| **cargo** | Texto libre descriptivo del puesto de la persona usuaria (ADR-0009) — nunca controla permisos | Confundirlo con **rol** (`admin`/`operador`, el único que sí determina permisos) |

### Nota sobre "editar" — vocabulario prohibido, no solo desaconsejado

El componente `EditRecordModal.tsx` (título "Editar Registro", botón "Guardar
Cambios") sigue existiendo en el repositorio pero es **código muerto**: no lo importa
ninguna pantalla activa, es un resto migrado del prototipo Electron viejo antes de que
existiera el flujo de corrección actual. El propio ADR-0008 lo nombra como el problema
que la corrección append-only vino a resolver — permitir una edición en sitio rompería
el invariante append-only del modelo. **Ninguna interfaz nueva debe usar "editar" para
esta operación, aunque `EditRecordModal.tsx` siga en el árbol de archivos.** Si algún
día se reactiva ese componente (o `ForgottenOutModal.tsx`, que hoy mezcla "corregir" y
"editar" en la misma pantalla), su copy debe corregirse primero para usar
"corrección"/"corregir" de forma consistente.

## Aprobación

Borrador abierto por Jhunier. Pendiente de revisión explícita de Duverney sobre el
contenido completo, en particular la regla propuesta para unificar el texto de carga —
antes de considerar cerrado el issue #56.
