# Brief para Gemini (Antigravity) — `verifier/` (issue #6)

> Este documento es autocontenido: no compartes el historial de la conversación donde se
> tomaron estas decisiones, así que aquí está todo el contexto necesario para trabajar
> sin tener que preguntar de vuelta lo que ya está decidido. Si algo no está aquí, está
> en los archivos que se referencian — léelos antes de escribir código, no asumas.

## Qué es este proyecto

**SecureQR-ID**: modelo criptográfico de validación de credenciales QR organizacionales.
Trabajo de grado, Maestría en Ciberseguridad, UNAD. Prototipo de investigación académica,
**no producción** — pero el código debe ser correcto y probado como si lo fuera, porque
es la base empírica de un artículo científico.

Repositorio: `https://github.com/rlases/SecureQR-ID` (rama base: `main`).

**Antes de escribir una línea de código, lee en este orden:**

1. `CLAUDE.md` — índice del proyecto, invariantes, convenciones de nombres.
2. `docs/ARCHITECTURE.md` — arquitectura completa de los cinco módulos.
3. `docs/SQRID-1.md` — el formato exacto del token que `verifier/` debe leer y verificar.
4. `docs/THREAT-MODEL.md` — qué ataques debe resistir este módulo específicamente.
5. `docs/DECISIONS.md` — ADR-0001 (ECDSA), ADR-0005 (stack, recién cerrado, ver abajo).
6. `.claude/rules/criptografia.md` — reglas no negociables de código criptográfico.
7. `SECURITY.md` — qué nunca debe entrar al repositorio.
8. `CONTRIBUTING.md` — flujo de rama/PR/revisión/pruebas.

## Tu tarea: issue #6 — `verifier/`

**Responsabilidad de `verifier/`:** verificar firma, frescura (expiración), nonce no
visto y estado de revocación de un token `SQRID/1`. Es quien decide aceptar o rechazar.

**Frontera dura (no la cruces):**
- `verifier/` **no firma** nada — eso es `issuer/` (issue #5, otro autor lo tiene).
- `verifier/` **no ancla** en blockchain — eso es `anchor/`.
- `verifier/` tampoco decide qué hacer con el evento de acceso más allá de
  aceptar/rechazar; registrar el evento aceptado es trabajo de `evidence-log/`.

### Orden de validación — no negociable, no lo reordenes

De `docs/ARCHITECTURE.md` y `.claude/rules/criptografia.md`, literalmente en este orden:

**firma → expiración → nonce no visto → revocación**

La razón de que sea firma primero: verificar la firma antes que cualquier otra cosa
evita procesar un payload no confiable. Si reordenas "para optimizar" (por ejemplo,
chequear expiración primero porque es más barato), estás procesando datos de un token
que podría estar falsificado antes de saber si es legítimo. No lo hagas aunque parezca
una micro-optimización razonable.

**Falla cerrado, siempre.** Si la verificación no puede completarse por cualquier motivo
— clave pública ausente para el `kid` recibido, lista de revocación inalcanzable, reloj
inconsistente, lo que sea — el resultado es **rechazo**, nunca aceptación por defecto ni
un "modo degradado permisivo". Esto es una regla dura, no un caso límite a discutir.

### Formato del token que vas a verificar (`docs/SQRID-1.md`, resumen — lee el original)

| Campo | Significado |
|---|---|
| `v` | versión de formato, valor fijo `SQRID/1`. La firma cubre este campo — rechaza si no coincide, no intentes ser compatible con una versión futura hipotética (evita ataques de downgrade) |
| `kid` | id de la clave pública que verifica esta firma — así resuelves cuál clave institucional aplicar |
| `cid` | id opaco de la credencial — no lo trates como dato personal, no lo loguees junto a nada que lo re-identifique innecesariamente |
| `iat` | timestamp de emisión |
| `exp` | timestamp de expiración — tu chequeo de "frescura" es contra esto |
| `n` | nonce de un solo uso — tu chequeo de "nonce no visto" requiere que persistas nonces ya vistos, al menos durante la ventana de validez del token |
| `sig` | firma ECDSA sobre la concatenación canónica de todos los campos anteriores |

Puntos que te tocan directamente y que hoy están abiertos en `SQRID-1.md`:
- **Curva y hash concretos**: decisión que hace `issuer/` (issue #5); coordina con esa
  implementación o, si tú vas primero, propopenla como ADR y que `issuer/` la siga
  (recomendado por consistencia con ADR-0001: P-256 + SHA-256). No implementes tu propia
  verificación de firma "genérica que soporte cualquier curva" — eso es alcance innecesario.
- **Tolerancia al desfase de reloj** entre emisor y verificador: tu chequeo de expiración
  necesita un margen explícito y documentado, no una comparación exacta de timestamps.
- **Persistencia del set de nonces vistos**: para el prototipo, una estructura local
  (archivo, tabla) alcanza — no necesitas una base distribuida. Pero debe sobrevivir un
  reinicio del proceso, o un reinicio malicioso/accidental se convierte en bypass del
  anti-repetición.
- **Consulta de revocación**: en esta fase, `revocation/` (issue #8, asignado a otro
  colaborador) todavía no existe. Diseña `verifier/` para que la consulta de revocación
  sea una interfaz/función reemplazable (una lista local firmada, por ejemplo) — no la
  bloquees ni la mockees de forma que haga trivial saltarse el chequeo. Si `revocation/`
  no está disponible, la regla de "falla cerrado" aplica: si no puedes consultar
  revocación, rechazas, no asumes "no revocado".

### Reglas de criptografía (no negociables — `.claude/rules/criptografia.md`)

- **No implementes primitivas propias.** Verificación de firma, hash: siempre de una
  librería establecida y mantenida (en Python: `cryptography`).
- **Comparación en tiempo constante** para cualquier comparación sobre un valor secreto o
  derivado de uno (la librería de verificación de firma ya lo hace internamente para la
  firma misma — no reimplementes esa parte; pero si comparas nonces o cualquier otro
  valor sensible a mano, no uses `==` ingenuo sobre secretos).
- **Sin secretos en logs ni mensajes de error.** Un rechazo de verificación no debe
  revelarle al usuario final *cuál* de los cuatro chequeos falló, en detalle suficiente
  para ayudar a un atacante a iterar (por ejemplo, no distingas públicamente "firma
  inválida" de "nonce repetido" en la respuesta externa; el detalle completo va a la
  bitácora interna, no a quien presenta el QR).
- Cualquier cambio al esquema de firma, derivación de nonce o ventana de validez exige
  ADR nuevo en `docs/DECISIONS.md` **antes** del código.

## Stack (ADR-0005, ya cerrado)

**Python** para `issuer/`, `verifier/`, `evidence-log/` — mejor ergonomía criptográfica
(`cryptography`) y consistencia con el análisis estadístico de la fase de evaluación, que
también es Python. `anchor/` es Node.js/TypeScript aparte (no te concierne para esta
tarea).

Estructura esperada, igual al patrón que ya usan `mi-app-qr/server` y `client` como
paquetes independientes:

```
verifier/
  pyproject.toml (o requirements.txt)
  src/
  tests/
```

Entorno virtual propio — no un monolito compartido con `issuer/` o `evidence-log/`,
aunque vivan en el mismo repositorio.

## Convenciones del repositorio

- **Identificadores de código en inglés** (`verify_signature`, `merkle_root`),
  **documentación y comentarios en español**.
- Los nombres deben coincidir con el vocabulario del artículo de grado — si tienes duda
  sobre cómo se llama algo en el documento de grado, prioriza el nombre que ya aparece en
  `docs/ARCHITECTURE.md` o `docs/SQRID-1.md` antes de inventar uno nuevo.

## Flujo de trabajo (`CONTRIBUTING.md`)

1. Rama desde `main` actualizado: `modulo/6-verifier-portal`.
2. Commits en español, en imperativo, explicando el *porqué* cuando no sea obvio.
3. Abre un PR hacia `main` que:
   - Referencie `Closes #6`.
   - Explique qué se decidió y por qué (tolerancia de reloj, persistencia de nonces,
     interfaz de revocación), no solo qué archivos cambiaron.
   - Confirme explícitamente que revisaste `docs/THREAT-MODEL.md` y
     `.claude/rules/criptografia.md`.
4. **No te autoapruebes el PR.** El flujo de dos autores exige revisión cruzada; el
   dueño del repositorio (`rlases`) o su colaborador aprueban. No hagas merge tú mismo.
5. CI en verde es condición de merge. Si el job de `pytest` en
   `.github/workflows/ci.yml` todavía no existe cuando llegues aquí (puede que `issuer/`
   ya lo haya añadido — revisa primero), añádelo siguiendo el patrón de los jobs
   existentes para `mi-app-qr/server` y `client`.

### Pruebas mínimas exigidas (`CONTRIBUTING.md`, sección Pruebas)

Cada caso de rechazo se prueba por separado, nunca solo el camino feliz — y en el orden
que reflejan los cuatro chequeos:
- Firma válida → acepta (dado que los otros tres chequeos también pasan).
- Firma inválida (payload alterado, o firmada con otra clave) → rechaza, y no continúa a
  los siguientes chequeos.
- Token expirado (con firma válida) → rechaza.
- Nonce repetido (mismo nonce presentado dos veces) → la segunda presentación rechaza.
- Credencial revocada (con firma y frescura válidas) → rechaza.
- Falla de infraestructura simulada (lista de revocación inalcanzable, `kid` desconocido)
  → rechaza, no acepta por defecto. Prueba esto explícitamente, no lo des por hecho.

Usa `pytest`. Nada de datos reales — usa `data/ejemplo/` si necesitas fixtures, nunca un
documento de identidad real ni siquiera como ejemplo "descartable". Los tokens de prueba
los puedes generar tú mismo con un par de claves de prueba (nunca reutilices ninguna
clave real ni de otro entorno).

## Qué NO hacer

- No toques `issuer/`, `evidence-log/`, `anchor/`, `revocation/`, ni nada bajo
  `mi-app-qr/` — fuera de alcance de este issue.
- No reordenes la secuencia de validación firma → expiración → nonce → revocación.
- No implementes un "modo degradado" que acepte cuando algo falla.
- No hagas merge de tu propio PR.
- No subas ninguna clave, pública o privada, real o de prueba persistente, al
  repositorio de forma que parezca material real — usa claves generadas efímeras en los
  tests.
