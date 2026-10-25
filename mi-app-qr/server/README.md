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

## Portal del titular (ADR-0016, puntos 2 a 4)

Rutas bajo `/api/portal`, para el teléfono del titular:

- `GET /alta`: si el registro está abierto (hay estamento base), los estamentos y la
  huella SHA-256 del certificado, para compararla con la del navegador.
- `POST /alta`: alta con datos declarados y autorización de tratamiento de datos. Vincula
  el teléfono y devuelve el código de recuperación **una sola vez**. Un documento repetido
  queda `en_revision`, sin vínculo ni código.
- `POST /recuperar`: documento + código vinculan un teléfono nuevo, desactivan el anterior
  y renuevan el código. Límite: 5 fallos por documento y 20 por IP cada 15 minutos.
- `GET /yo`: estado de la credencial del teléfono vinculado.

La sesión del titular es la cookie `sqrid_dispositivo` (llave de 256 bits, `HttpOnly`,
`SameSite=Strict`, `Secure` con HTTPS, solo para `/api/portal`). No usa la sesión del
personal: ninguna ruta del personal la acepta y el portal no acepta la del personal. Del
lado del servidor solo se guardan el SHA-256 de la llave y el bcrypt del código.

## Revocación (ADR-0016, punto 9)

- `POST /api/titulares/:id/revocar` (solo `admin`, con motivo): revoca la credencial
  vigente y suspende al titular. Desde ese momento `puedeEmitir` no autoriza tokens.
- `POST /api/titulares/:id/desvincular`: corta el vínculo del teléfono.
- `POST /api/titulares/:id/reactivar`: credencial nueva para un titular suspendido.
- `GET /api/titulares/revocados.txt`: los `cid` revocados, sin firmar, un `cid` por línea,
  en el formato de `secureqr-revocation sign`.
- Con `REVOCADOS_EXPORT_PATH`, el servidor escribe ese archivo al arrancar y cada 24
  horas, con reemplazo atómico; `POST /api/titulares/revocados/exportar` lo escribe en el
  momento («exportar ahora»).
