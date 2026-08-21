# `issuer/`

Emite tokens QR `SQRID/1` y custodia la clave privada institucional. Este paquete no
valida tokens, no registra eventos y no expone una API HTTP. El contrato criptografico
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
