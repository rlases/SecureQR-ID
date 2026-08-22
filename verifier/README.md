# Verificador SecureQR-ID

Paquete Python que decide si un token `SQRID/1` puede aceptarse. Aplica las etapas en
orden estricto: firma, vigencia, nonce no visto y revocación. Cualquier dependencia
ausente, respuesta inválida o error interno produce el mismo rechazo público.

Este paquete contiene el motor de validación y un adaptador HTTP opcional que consume el
portal de escaneo. No incluye una interfaz gráfica, no firma tokens, no ancla hashes y
no registra el evento de acceso aceptado.

## Instalación

Para uso del paquete:

```bash
cd verifier
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install .
```

Para exponer el adaptador ASGI se instala el extra web:

```bash
python -m pip install ".[web]"
```

Para desarrollo, las pruebas instalan `issuer/` únicamente como dependencia de test y
comprueban interoperabilidad con tokens emitidos por su API real:

```bash
cd verifier
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e ../issuer -e ".[test]"
python -m pytest
```

## Dependencias de ejecución

El constructor de `Verifier` exige cuatro decisiones explícitas:

- `DirectoryKeyResolver`: directorio externo con claves públicas P-256 nombradas
  `<kid>.pem`. El contenido de cada clave se vuelve a derivar y debe coincidir con el
  nombre.
- `SqliteReplayStore`: ruta persistente fuera del repositorio. `:memory:` se rechaza
  porque perder el estado al reiniciar permitiría replay.
- `RevocationChecker`: implementación institucional de `is_revoked(cid) -> bool`. No
  existe una lista vacía o una respuesta permisiva por defecto.
- `clock_skew_seconds`: entero obligatorio entre 0 y 60 segundos, sin valor por defecto.

```python
from secureqr_verifier import DirectoryKeyResolver, SqliteReplayStore, Verifier

verifier = Verifier(
    key_resolver=DirectoryKeyResolver("/etc/secureqr-id/trusted-keys"),
    replay_store=SqliteReplayStore("/var/lib/secureqr-id/replay.sqlite3"),
    revocation_checker=institutional_revocation_client,
    clock_skew_seconds=30,
)

result = verifier.verify(scanned_token)
if result.accepted:
    opaque_credential_id = result.credential_id
```

## Adaptador HTTP

La fábrica exige un `Verifier` ya configurado; no crea claves, almacenamiento ni una
política de revocación permisiva por defecto:

```python
from secureqr_verifier.web import create_app

app = create_app(verifier)
```

Expón `app` mediante un servidor ASGI y sirve `/api` bajo el mismo origen HTTPS que
`verifier-web/`. `POST /api/verify` recibe únicamente `{ "token": "..." }` y responde
solo con `accepted` y un mensaje público genérico. La API no devuelve identificadores,
motivos internos, nonce, firma ni contenido del token. `GET /api/health` permite al
portal comprobar disponibilidad sin acceder al estado criptográfico.

El fixture de `verifier-web/dev/` es exclusivamente visual y no sustituye este
adaptador.

Los rechazos siempre devuelven `accepted=False`, `credential_id=None` y el mensaje
`Token rechazado.`. El motivo concreto solo se registra como un código estable, sin
token, identificadores, nonce, firma ni texto de excepciones.

## Persistencia y concurrencia

SQLite conserva tanto los nonces aceptados como el máximo de reloj observado. El nonce
se consulta antes de revocación y se consume mediante una inserción única justo después;
dos verificadores concurrentes pueden consultar el mismo token, pero solo uno logra
aceptarlo. Una caída de revocación rechaza el intento sin consumir el nonce.

Las reglas completas y su justificación están en ADR-0011 de
[`docs/DECISIONS.md`](../docs/DECISIONS.md).
