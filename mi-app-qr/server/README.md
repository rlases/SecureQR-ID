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
