# `mi-app-qr/server`

API Express + SQLite + TypeScript para el cliente multiusuario de `mi-app-qr`
(ver `docs/DECISIONS.md` ADR-0008 y `docs/superpowers/specs/2026-08-15-cliente-web-multiusuario-design.md`).

## Ejecutar en desarrollo

```bash
cp .env.example .env   # y edita SESSION_SECRET con un valor real
npm install
npm run dev
```

El servidor queda escuchando en `http://localhost:4000` (o el `PORT` que definas).

## Pruebas

```bash
npm test
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | No | Confirma que el servidor está vivo |
| POST | `/api/auth/login` | No | `{ username, password }` → cookie de sesión + usuario |
| GET | `/api/auth/me` | Sí | Usuario de la sesión actual |
| POST | `/api/auth/logout` | Sí | Cierra la sesión |
| POST | `/api/registros` | Sí | Crea un registro de entrada/salida |
| GET | `/api/registros` | Sí | Lista los registros, más reciente primero |

## Notas de seguridad

- Las contraseñas se hashean con bcryptjs (12 rounds) — nunca en texto plano.
- Una cuenta se bloquea 15 minutos tras 5 intentos fallidos consecutivos.
- `SESSION_SECRET` es obligatorio; el servidor no arranca sin él (falla cerrado).
- La autorización se verifica siempre en el servidor (`requireAuth`), nunca solo en el cliente.

## Registro de credenciales (ADR-0016)

El servidor guarda la relación `cid` → titular que el token no lleva. Las tablas están
en `src/db/migrate.ts`:

- `estamentos`: los crea el `admin` de cada instalación; como mucho uno es la base.
- `titulares`: datos declarados (nombre, documento, correo de contacto) y estamento. Un
  registro vigente por documento; una alta repetida queda `en_revision`. Un titular se
  anonimiza, nunca se borra.
- `credenciales`: un `cid` vigente por titular. Una credencial reemplazada o revocada
  se conserva y no vuelve atrás.
- `dispositivos`: solo el SHA-256 de la llave del teléfono, uno activo por titular.
- `asignaciones_cid`: historial `cid` → titular de solo agregar y encadenado por hash
  (`verifyAsignaciones`). Guarda el identificador opaco del titular (`ref`), nunca sus
  datos personales.

Disparadores de SQLite impiden borrar o reescribir el historial. Quien tenga el archivo
puede quitarlos, pero no recalcular la cadena sin que `verifyAsignaciones` lo note.
