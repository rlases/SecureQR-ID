# `issuer/`

Emite tokens QR `SQRID/1` y custodia la clave privada institucional. Este paquete no
valida tokens ni registra eventos. Su unica interfaz de red es el servicio local de
emision, que solo escucha dentro del equipo (ver abajo). El contrato criptografico
completo esta en `docs/SQRID-1.md` y ADR-0010.

## Instalacion para desarrollo

Desde esta carpeta, con un entorno virtual propio:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[test]"
.venv\Scripts\python -m pytest
```

## Configuracion

La CLI solo recibe secretos mediante el entorno. No coloque estos valores en el
repositorio ni en un archivo `.env`:

| Variable | Uso |
|---|---|
| `SQRID_PRIVATE_KEY_PATH` | Ruta externa al PEM PKCS#8 cifrado |
| `SQRID_PUBLIC_KEY_PATH` | Ruta externa donde `generate-key` crea la clave publica |
| `SQRID_PRIVATE_KEY_PASSWORD` | Contrasena del PEM; minimo 16 bytes |
| `SQRID_TOKEN_TTL_SECONDS` | Vigencia positiva elegida para el despliegue |

En PowerShell se puede leer la contrasena sin escribirla en el historial:

```powershell
$issuerPassword = Read-Host "Contrasena de la clave" -AsSecureString
$env:SQRID_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new("", $issuerPassword).Password
```

Defina las rutas fuera del checkout. Los comandos disponibles son:

```powershell
secureqr-issuer generate-key
$cid = secureqr-issuer generate-cid
secureqr-issuer issue --cid $cid
```

`generate-key` falla si cualquiera de los archivos ya existe. La clave privada nunca es
un valor de retorno; `Issuer.public_key_pem()` devuelve unicamente la parte publica para
distribuirla por un canal confiable al futuro `verifier/`.

## Uso como biblioteca

```python
from secureqr_issuer import Issuer, create_credential_id

issuer = Issuer(
    private_key_path=private_key_path,
    password=private_key_password,
    token_ttl_seconds=token_ttl_seconds,
)
token = issuer.issue_token(create_credential_id())
```

Las tres variables del ejemplo provienen de la configuracion del proceso; el paquete no
define rutas, contrasenas ni vigencias por defecto.

## Servicio local de emision (issue #83, ADR-0016)

`mi-app-qr` pide un token nuevo cada pocos segundos por titular. Para que nunca tenga
que conocer la contrasena de la clave, `issuer/` corre como un servicio de larga
duracion en el mismo equipo:

- el custodio escribe la contrasena **una sola vez** al arrancarlo, y la clave queda
  solo en la memoria del proceso;
- escucha unicamente en `127.0.0.1` (o `::1`); cualquier otra direccion se rechaza al
  arrancar, nunca escucha en la red;
- solo atiende solicitudes con el secreto compartido de la instalacion, que permite
  pedir tokens pero no leer la clave.

Una vez, crear el secreto compartido (256 bits, permisos `0600`, nunca sobrescribe):

```bash
secureqr-issuer generate-secret --output /ruta/segura/issuer.secret
```

Arrancar el servicio (pide la contrasena en la terminal):

```bash
export SQRID_PRIVATE_KEY_PATH=/ruta/segura/emision.pem
export SQRID_TOKEN_TTL_SECONDS=60
export SQRID_ISSUER_SECRET_FILE=/ruta/segura/issuer.secret
secureqr-issuer serve --port 8765
```

Si no hay terminal, se acepta `SQRID_PRIVATE_KEY_PASSWORD` y el proceso la retira de su
entorno apenas la lee. Aun asi, el sistema operativo conserva una copia del entorno
inicial del proceso, visible para la misma cuenta y para el administrador del equipo:
en el piloto se prefiere escribirla en la terminal.

### Contrato

| Solicitud | Respuesta |
|---|---|
| `POST /v1/tokens` con `Authorization: Bearer <secreto>` y `{"cid": "<cid>"}` | `200 {"token": "...", "expires_in": 60}` |
| Sin secreto o con secreto incorrecto | `401` |
| JSON mal formado, campos de mas, `cid` invalido o cuerpo de mas de 1 KB | `400` |
| `GET /health` (sin secreto) | `200 {"status": "ready"}` |

Las respuestas llevan `Cache-Control: no-store`. El servicio no registra el `cid`, el
token, el secreto ni la contrasena: los rechazos solo dejan un codigo
(`issuer_service_rejected` con `reason_code`). El limite de tokens por dispositivo lo
aplica `mi-app-qr` (#85), que es quien conoce el dispositivo.

### Cuenta propia del sistema operativo

El PEM de emision solo debe poder leerlo la cuenta que ejecuta el servicio. El secreto
compartido lo leen esa cuenta y la de `mi-app-qr`.

En Linux (systemd):

```bash
sudo useradd --system --home /var/lib/secureqr-issuer --shell /usr/sbin/nologin secureqr-issuer
sudo install -d -o secureqr-issuer -g secureqr-issuer -m 0700 /var/lib/secureqr-issuer
sudo chown secureqr-issuer: /var/lib/secureqr-issuer/emision.pem
sudo chmod 0600 /var/lib/secureqr-issuer/emision.pem
# El secreto: dueño secureqr-issuer, grupo de la cuenta de mi-app-qr, permisos 0640.
sudo -u secureqr-issuer -E secureqr-issuer serve --port 8765
```

En Windows: crear una cuenta local sin privilegios de administrador, dejar el PEM en una
carpeta cuyas ACL solo den lectura a esa cuenta (Propiedades → Seguridad, quitando la
herencia) y arrancar el servicio con "Ejecutar como" esa cuenta, desde una terminal
para escribir la contrasena.

Si el equipo se reinicia, el servicio no arranca solo: el custodio debe volver a
escribir la contrasena (ADR-0016). Mientras tanto, `mi-app-qr` no puede emitir QR.

