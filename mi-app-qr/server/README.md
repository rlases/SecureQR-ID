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
- `ASIGNACIONES_KEY` (32 bytes en hexadecimal) también es obligatoria: autentica con HMAC
  el historial `cid` → titular. Va en un respaldo distinto del de la base.
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
  queda `en_revision`, sin vínculo ni código. Límite por IP: `ALTA_MAX_POR_IP` altas por
  hora (10 por defecto), contando también las que quedan en revisión; al excederlo
  responde 429.
- `POST /recuperar`: documento + código vinculan un teléfono nuevo, desactivan el anterior
  y renuevan el código. Límite: 5 fallos por documento y 20 por IP cada 15 minutos.
- `GET /yo`: estado de la credencial del teléfono vinculado.
- `POST /qr` (issue #85): con el teléfono vinculado, aplica la puerta de emisión
  (`puedeEmitir`: titular activo, credencial vigente y dentro de las ventanas de su
  estamento, en la zona `SITE_TIME_ZONE`) y pide el token al servicio local de `issuer/`
  con el `cid` vigente. Devuelve `{ token, expiraEn, renovarEnSegundos }` (unos 15 s antes
  de vencer), o `403 { motivo, mensaje }` fuera de horario o con la credencial suspendida.
  Límite: 6 tokens por minuto por teléfono, en memoria. La página del titular renueva el QR
  sola y no guarda el token en `localStorage`, historial ni caché.

  Configuración (en el entorno del servidor o de la app de escritorio, que lo hereda):
  `ISSUER_SERVICE_URL` (solo `http://127.0.0.1:<puerto>` o `http://[::1]:<puerto>`) y
  `SQRID_ISSUER_SECRET_FILE` (el mismo archivo que usa `secureqr-issuer serve`). Sin ellas
  el portal funciona, pero responde 503 al pedir el QR. `npm run test:e2e:emision` prueba
  el flujo contra el servicio real (ver el trabajo `emision-e2e` de CI).

La sesión del titular es la cookie `sqrid_dispositivo` (llave de 256 bits, `HttpOnly`,
`SameSite=Strict`, `Secure` con HTTPS, solo para `/api/portal`). No usa la sesión del
personal: ninguna ruta del personal la acepta y el portal no acepta la del personal. Del
lado del servidor solo se guardan el SHA-256 de la llave y el bcrypt del código.

## Revocación (ADR-0016, punto 9)

- `POST /api/titulares/:id/revocar` (solo `admin`, con motivo): revoca la credencial
  vigente y suspende al titular. Desde ese momento `puedeEmitir` no autoriza tokens.
- `POST /api/titulares/:id/desvincular`: corta el vínculo del teléfono.
- `POST /api/titulares/:id/reactivar`: credencial nueva para un titular suspendido.
- Altas en revisión por documento repetido (enmienda de 2026-10-24 a ADR-0016, issue #109),
  solo `admin`:
  - `POST /api/titulares/:id/rechazar` (nota opcional): el alta se anonimiza de inmediato.
  - `POST /api/titulares/:id/reemplazar` (`motivo`: `misma_persona` o
    `registro_anterior_indebido`): el registro vigente pasa a `reemplazado`, su credencial a
    `reemplazada` o `revocada` y su teléfono a `revocado`; el alta queda activa.
  - `POST /api/titulares/:id/aprobar`: si ya no hay registro vigente con ese documento.
  - `POST /api/titulares/:id/regenerar-codigo`: invalida el código provisional pendiente.
  - Reemplazar, aprobar y regenerar devuelven **una sola vez** un código provisional
    (`Cache-Control: no-store`) que vence a las 72 horas y se canjea en `POST /recuperar`.
- `GET /api/titulares/revocados.txt`: los `cid` revocados, sin firmar, un `cid` por línea,
  en el formato de `secureqr-revocation sign`.
- Con `REVOCADOS_EXPORT_PATH`, el servidor escribe ese archivo al arrancar y cada 24
  horas, con reemplazo atómico; `POST /api/titulares/revocados/exportar` lo escribe en el
  momento («exportar ahora»).

## Reseteo trimestral del cid (ADR-0016, punto 8)

Al arrancar y cada seis horas, el servidor comprueba el trimestre local de la sede
(`SITE_TIME_ZONE`, por defecto `America/Bogota`). La primera vez solo anota la línea base;
después, la primera vez en un trimestre nuevo, da un `cid` nuevo a cada titular activo y
deja el anterior `reemplazada`. El teléfono sigue vinculado, los suspendidos no reciben
`cid` nuevo y el historial encadenado conserva cada `cid` anterior. `reseteos_cid` impide
reiniciar dos veces el mismo trimestre.

## Anonimización y conservación (ADR-0016, punto 10)

La limpieza incluye los motivos libres de las correcciones de asistencia: se
reemplazan por «Anonimizado» y se conserva la relación con el registro corregido.
En el registro de consultas, una entrada que no tiene formato de `cid` canónico
puede contener un nombre, documento o correo escrito por error: al anonimizar se
sustituye por `anon-<id de consulta>`. Los `cid` canónicos nunca se reescriben; se
conservan el autor, la fecha y la atribución histórica de cada consulta. El mismo
criterio se aplica a las filas vencidas al configurar un plazo de conservación.

- **Cierre del piloto:** `npm run anonimizar -- --cierre` pide escribir `ANONIMIZAR TODO`
  y anonimiza nombre, documento y correo de todos los titulares, los registros de
  asistencia y los motivos de las consultas, y borra los intentos de recuperación. Después,
  ningún `cid` se puede atribuir a una persona. No toca la bitácora de `evidence-log/`, el
  historial encadenado (solo tiene el identificador opaco del titular), las credenciales
  ni los dispositivos.
- **Uso posterior:** un `admin` fija un plazo en días (`PUT /api/titulares/conservacion`).
  Cada día se anonimizan los registros y las consultas más antiguos, que se conservan el
  mismo tiempo (ADR-0016). `npm run anonimizar -- --vencidos` lo aplica a mano.
- Cada ejecución queda en `anonimizaciones`.
- Al cierre y por plazo también se eliminan `nota` y `motivo` libre del registro de
  cambios, conforme a #147. Los motivos de lista cerrada y la estructura del historial
  se conservan. El formulario sigue pidiendo no escribir datos personales en texto libre.

## Compromiso externo del historial cid → titular (issue #119)

Con `ASIGNACIONES_CABEZA_PATH`, el servidor escribe cada 15 minutos la cabeza de
`asignaciones_cid` (seq y etiqueta HMAC, sin datos personales) para que
`evidence-log cycle --head-file` la registre y la ancle. Con
`ASIGNACIONES_COMPROMISOS_PATH` (el archivo de `--commitments-file`), compara cada hora el
historial con los compromisos anclados y registra una alerta si una asignación
comprometida falta o cambió, aunque la cadena verifique con la clave HMAC.
`GET /api/titulares/integridad` (solo `admin`) muestra la cabeza y el resultado.
