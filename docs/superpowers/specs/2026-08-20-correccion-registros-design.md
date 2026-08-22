# Corrección de registros — diseño

**Estado:** Aprobado, pendiente de plan de implementación.

## Contexto

`mi-app-qr/server` ya tiene `registros` (crear + listar) y `users` (crear + listar,
admin) funcionando en producción (issues #12 cerrado). Falta la capacidad de
**corregir** un registro después de creado — el prototipo legado (`EditRecordModal.jsx`,
`mi-app-qr/src/`) permitía sobrescribir directamente, pero eso choca con la invariante
append-only que ADR-0008 ya estableció para cuando exista `evidence-log/`: *"una
corrección se registra como evento correctivo nuevo, con autor y motivo, en lugar de
sobrescribir el anterior"*.

El esquema nuevo del servidor multiusuario no es equivalente al modal legado: cada fila
de `registros` es un evento único (`tipo: 'entrada' | 'salida'`), no un registro con
campos `entrada`/`salida` combinados como en el prototipo de escritorio. El diseño de
corrección parte de este esquema, no del modal legado.

## Modelo de datos

Se agregan dos columnas nulables a la tabla `registros` existente — no se crea tabla
nueva. Mismo patrón que ya se usó para agregar `role`/`cargo` a `users` en ADR-0009: se
reescribe la sentencia `CREATE TABLE IF NOT EXISTS registros` en `migrate.ts` con las
columnas nuevas incluidas desde el inicio (no hay sistema de migraciones incrementales
en este proyecto — es un prototipo de investigación, no producción, así que una base de
datos de desarrollo con el esquema viejo simplemente se borra y se recrea).

Columnas nuevas, con un `CHECK` que ata ambas entre sí:

```sql
CHECK (
  (corrige_registro_id IS NULL AND motivo IS NULL) OR
  (corrige_registro_id IS NOT NULL AND motivo IS NOT NULL)
)
```

Un registro original tiene ambas columnas en `NULL`. Una corrección es una **fila
nueva**, no una actualización: se reescriben los 5 campos existentes (`nombre`,
`documento`, `rol`, `tipo`, `timestamp` — los cinco son corregibles, no hay campos
protegidos), y además:

- `corrige_registro_id` apunta al `id` de la fila que esta corrección reemplaza.
- `motivo` es obligatorio — texto libre, quién corrige explica por qué.

**El autor de la corrección no necesita columna nueva.** `creado_por_usuario_id` ya
existe y ya significa "quién creó esta fila" — para una fila de corrección, eso es
exactamente el admin que la hizo. No hay ambigüedad porque cada fila (original o
corrección) tiene exactamente un creador.

**Encadenamiento sin límite.** Se puede corregir una corrección ya hecha: la fila nueva
apunta a la corrección anterior, no al original. La cadena entera queda en la tabla
como historial completo (útil cuando exista `evidence-log/`), pero solo la **punta
vigente** de cada cadena se expone en el listado — ver más abajo.

## Endpoints

### `GET /api/registros` (existente, cambia el filtro)

Antes: `SELECT * FROM registros ORDER BY timestamp DESC, id DESC`.

Ahora excluye cualquier fila que sea el `corrige_registro_id` de otra — solo devuelve
la punta vigente de cada cadena:

```sql
SELECT * FROM registros
WHERE id NOT IN (
  SELECT corrige_registro_id FROM registros WHERE corrige_registro_id IS NOT NULL
)
ORDER BY timestamp DESC, id DESC
```

El orden sigue siendo por `timestamp` (la hora real del evento, ya corregida si aplica),
no por cuándo se hizo la corrección — si se corrige la hora de un registro, su posición
en la lista cambia para reflejar la hora corregida.

### `POST /api/registros/:id/correcciones` (nuevo)

Protegido por `requireAdmin` — **no** todo el router de `registros`, solo esta ruta.
`GET /` y `POST /` (crear registro original) siguen exigiendo solo `requireAuth`, sin
cambios.

Body (Zod, mismo patrón que `createUserSchema`/`createRegistroSchema`):

```typescript
z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
  timestamp: z.string().min(1),
  motivo: z.string().min(1),
})
```

Reglas de negocio, en orden:

1. `401` si no hay sesión (lo cubre `requireAdmin` igual que en `users`).
2. `403` si la sesión no es de un `admin` (lo cubre `requireAdmin`).
3. `400` si el body no pasa el schema de arriba.
4. `404` si `:id` no corresponde a ningún registro existente.
5. **`409` si `:id` ya fue corregido antes** — es decir, si ya existe otra fila cuyo
   `corrige_registro_id` sea `:id`. Esto impide bifurcar la cadena: solo se puede
   corregir la punta vigente, nunca un eslabón intermedio. El mensaje de error debe
   explicar esto (no un 409 crudo) para que el cliente pueda mostrarlo con sentido —
   ej. "este registro ya tiene una corrección más reciente, corrige esa en su lugar".
6. `201` con la fila nueva si todo pasa.

## Cliente

- `apiClient.correctRegistro(id: number, data: CorregirRegistroRequest): Promise<{ registro: Registro }>`
  — `POST /api/registros/${id}/correcciones`, mismo patrón que `createUser`/`createRegistro`.
- `CorregirRegistroModal.tsx` (nuevo componente): react-hook-form + zod, mismo patrón
  que el formulario de `UsuariosPage`. Precarga los 5 campos desde la fila que se va a
  corregir (el timestamp como `datetime-local`, igual que hacía `EditRecordModal.jsx`
  legado) más un campo `motivo` (textarea, obligatorio, vacío al abrir).
- `RegistrosPage.tsx`: agrega un botón "Corregir" por fila, visible solo si
  `user.role === 'admin'` (se consulta vía `useAuth()`, mismo patrón que ya usa
  `Sidebar` para el link a Usuarios) — **UX, no autorización real**; la autorización
  real vive en `requireAdmin` del servidor, igual que con Usuarios. Al enviar, se llama
  `correctRegistro`, se invalida la query `['registros']`, se cierra el modal.
- Tipos nuevos en `shared/src/types.ts`: `CorregirRegistroRequest` (los 6 campos del
  body de arriba) y se extiende `Registro` con `corrigeRegistroId: number | null` y
  `motivo: string | null`.

## Fuera de alcance de este diseño

- UI para ver el historial completo de una cadena (original + cada corrección) — la
  cadena queda en la base de datos, pero no hay pantalla para recorrerla todavía. Se
  agrega como tarea aparte si se necesita antes de que exista `evidence-log/`.
- Que un operador corrija sus propios registros — se decidió que corrección es
  exclusivamente de `admin`, sin excepción por autoría.
- Deshacer una corrección — no existe "revertir", solo corregir de nuevo con el valor
  correcto y un motivo que lo explique.
- Cambios al esquema de `registros` más allá de las dos columnas nuevas.

## Testing

**Servidor** (`registros.test.ts`, extendiendo el archivo existente o uno nuevo
`registros-correcciones.test.ts` — decisión del plan de implementación):

- `POST /api/registros/:id/correcciones` sin sesión → 401.
- Con sesión de operador (no admin) → 403.
- Con `:id` inexistente → 404.
- Corregir un registro que ya tiene corrección más reciente → 409, con mensaje claro.
- Corrección válida → 201, la fila nueva tiene `corrigeRegistroId` apuntando a la
  original y el `motivo` enviado.
- Después de corregir, `GET /api/registros` ya no incluye la fila original, sí la
  corrección.
- Cadena de dos correcciones seguidas → `GET /api/registros` muestra solo la más
  reciente, nunca las dos intermedias.
- Corrección sin `motivo` → 400.

**Cliente:**

- `apiClient.correctRegistro()` envía el payload correcto y devuelve la respuesta.
- El botón "Corregir" no aparece en `RegistrosPage` si `user.role !== 'admin'`.
- `CorregirRegistroModal` exige `motivo` (no se puede enviar vacío).
- Enviar la corrección invoca `correctRegistro` con los datos del formulario y cierra
  el modal al terminar.
