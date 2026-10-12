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

Todavía no hay una herramienta de línea de comandos para generar ese par de claves ni
para firmar la lista; hoy se hace desde Python con `sign_revocation_list`.
