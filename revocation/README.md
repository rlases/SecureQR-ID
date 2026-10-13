# Lista de revocación SecureQR-ID

Paquete Python que firma y verifica la lista de credenciales revocadas
(`SQRID-REVOKE/1`). `RevocationList.is_revoked(cid)` cumple la interfaz
`RevocationChecker` que espera `verifier/`.

```bash
cd revocation
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e ".[test]"
python -m pytest
```

## Verificación

La firma se valida con las mismas reglas que la de un token `SQRID/1`: ECDSA P-256 con
SHA-256, firma compacta de 64 bytes y forma canónica *low-S*. El sobre debe tener
exactamente los campos `v`, `kid`, `iat`, `cids` y `sig`; `cids` es una lista de textos
no vacíos y sin duplicados. Cualquier desviación lanza `RevocationError` (falla
cerrado).

`read_key_id(bytes)` devuelve el `kid` declarado para elegir la clave de un directorio
confiable, y `from_signed_bytes(..., expected_key_id=kid)` comprueba que el `kid`
firmado coincida.

## Recarga y antigüedad máxima

`secureqr_revocation.cache.RevocationListCache` también cumple `RevocationChecker`.
Revisa periódicamente el archivo, aplica solo listas con `iat` posterior a la vigente
(antirretroceso) y lanza `RevocationError` cuando la lista supera su antigüedad
máxima, de modo que el verificador rechaza (ADR-0015). Recibe un cargador inyectado
que verifica la firma; el de producción está en `verifier-service/`.

## Clave de revocación

La lista se firma con una clave dedicada, distinta de la clave de emisión de tokens
(ADR-0014). Su `kid` se deriva igual que en `issuer/` y su clave pública vive en un
directorio de confianza propio. El arranque del verificador está en
`verifier-service/`.

## Línea de comandos (issue #81)

`secureqr-revocation` (o `python -m secureqr_revocation`) crea la clave y firma la
lista. La contraseña de la clave se lee de `SQRID_REVOCATION_KEY_PASSWORD` o se pide en
la terminal; nunca se acepta como argumento ni aparece en mensajes. Debe tener al menos
16 bytes.

Una sola vez, para crear el par de claves:

```bash
secureqr-revocation generate-key \
  --private-key /ruta/segura/revocacion.pem \
  --public-dir /etc/secureqr-id/revocation-keys
```

Escribe la clave privada cifrada con permisos `0600` y la pública como `<kid>.pem` en
el directorio que el verificador usa como `SQRID_REVOCATION_KEYS_DIR`. Nunca sobrescribe
archivos existentes.

Cada día (refirmado de ADR-0015), y cuando haga falta revocar con urgencia:

```bash
secureqr-revocation sign \
  --key /ruta/segura/revocacion.pem \
  --input revocados.txt \
  --output /ruta/publicacion/lista.sqrid
```

- `revocados.txt` tiene un `cid` por línea; se ignoran las líneas vacías y las que
  empiezan con `#`. Un archivo vacío produce una lista vacía válida, que sirve para el
  refirmado diario.
- Un `cid` mal formado detiene el comando sin escribir nada; el error indica la línea,
  no el valor. Los repetidos se descartan y se informa cuántos.
- `iat` es la hora actual. La lista se verifica antes de escribirse y se instala con
  reemplazo atómico.
- Si la lista existente está firmada con otra clave, el comando se niega a reemplazarla:
  firmar por error con la clave equivocada dejaría al verificador sin arrancar tras un
  reinicio. Para una rotación de clave real se usa `--allow-key-change`, después de
  copiar la clave pública nueva a `SQRID_REVOCATION_KEYS_DIR`.

Termina con código 0 si todo salió bien y 2 ante cualquier error.
