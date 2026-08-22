# SecureQR-ID

Modelo criptográfico de validación de credenciales QR organizacionales. Trabajo de grado,
Maestría en Ciberseguridad, UNAD. Prototipo de investigación, no producción.

## Antes de tocar código, lee

- `docs/ARCHITECTURE.md` — obligatorio antes de modificar cualquier módulo
- `docs/SQRID-1.md` — obligatorio antes de tocar `issuer/` o `verifier/`
- `docs/THREAT-MODEL.md` — obligatorio antes de cambiar cualquier control de seguridad
- `docs/DECISIONS.md` — por qué las cosas son como son; consulta antes de proponer cambios
- `docs/STATE.md` — dónde quedó el trabajo
- `CONTRIBUTING.md` — flujo de ramas, PR, revisión cruzada y pruebas obligatorias

Este archivo es un índice, no una enciclopedia. El detalle vive en `docs/`.

## Comandos

Stack decidido en ADR-0005: **Python** para `issuer/`, `verifier/`, `evidence-log/`;
**Node.js/TypeScript** para `anchor/` (SDK oficial de Hyperledger Fabric). Cada módulo
Python es su propio paquete, con su propio entorno virtual — no un monolito compartido.

```bash
# issuer/ (Python — entorno propio dentro del módulo)
python -m venv .venv && source .venv/bin/activate   # o .venv\Scripts\activate en Windows
python -m pip install -e ".[test]"
python -m pytest

# verifier/ (instala issuer solo para pruebas de interoperabilidad)
python -m venv .venv && source .venv/bin/activate   # o .venv\Scripts\activate en Windows
python -m pip install -e ../issuer -e ".[test]"
python -m pytest

# evidence-log/ seguirá el mismo patrón cuando exista

# anchor/ (Node.js/TypeScript — mismo patrón que mi-app-qr/server)
npm install
npm test
npm run build

# verifier-web/ (Node.js 22.12+)
npm ci
npm test
npm run build
npm run test:e2e
```

## Los cuatro módulos y su frontera

| Módulo | Hace | NO hace |
|---|---|---|
| `issuer/` | firma tokens con la clave privada institucional | no valida, no registra eventos |
| `verifier/` | verifica firma, frescura, nonce, revocación | no firma, no ancla |
| `verifier-web/` | captura QR y presenta la decisión pública | no interpreta ni persiste tokens |
| `evidence-log/` | encadena eventos por hash | no decide aceptar/rechazar |
| `anchor/` | construye Merkle y ancla la raíz | no ve datos personales, solo hashes |

La separación es deliberada: es lo que permite que la validación sea local y rápida
mientras el anclaje corre asíncrono. No la colapses "por simplicidad".

## `mi-app-qr/`

Es un prototipo aparte: app de escritorio Electron + React de registro de asistencia por
QR, ya funcional, **sin ninguno de los controles de seguridad de este diseño** (QR de
texto plano, sin firma, sin nonce). No es `issuer/` ni `verifier/` y no se debe mezclar
código de uno con el otro. Ver "Relación con el prototipo existente" en
`docs/ARCHITECTURE.md`.

## Invariantes que no se rompen

- La clave privada del emisor nunca sale de `issuer/`.
- A la blockchain solo va la raíz de Merkle. Nunca datos personales, nunca un hash
  reversible por fuerza bruta sobre un espacio pequeño.
- Todo token lleva nonce y expiración. Un token sin frescura verificable se rechaza,
  aunque su firma sea válida.
- La bitácora es append-only. No hay operación de borrado ni de edición.
- No se implementan primitivas criptográficas propias; se usan librerías establecidas.

## Convenciones

- Documentación, comentarios y mensajes de commit en español; identificadores de código
  en inglés (`issuer`, `verify_signature`, `merkle_root`).
- Todo cambio de diseño se registra como ADR en `docs/DECISIONS.md` antes de implementarse.
- Al cerrar cada sesión de trabajo, actualiza `docs/STATE.md`. Es el handoff real.
- Los nombres del código deben coincidir con los del documento de grado. Si el artículo
  dice "raíz de Merkle", el código dice `merkle_root`, no `hash_tree_top`.

## Trampas conocidas

- **SDK de Hyperledger Fabric:** el SDK de Python está sin mantenimiento activo; el de
  Node.js (`fabric-network`) es el oficial. Por eso `anchor/` es Node mientras el resto
  de los módulos criptográficos son Python — repositorio políglota, decisión ya cerrada
  en ADR-0005. El puente entre `evidence-log/` (Python) y `anchor/` (Node) es un límite
  de proceso, no una llamada de función — no importes código de un lenguaje desde el otro.
- **"SecureQR" a secas ya está tomado** por una app de terceros. Usa siempre el nombre
  completo `SecureQR-ID` en código, documentos y publicaciones.
- **CCAV vs CEAD Pitalito:** los documentos fuente alternan entre ambos. La forma
  canónica del proyecto es **CCAV Pitalito** (ver ADR-0006).
