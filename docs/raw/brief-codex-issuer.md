# Brief para Codex — `issuer/` (issue #5)

> Este documento es autocontenido: Codex no comparte el historial de esta conversación,
> así que aquí está todo el contexto necesario para trabajar sin preguntar de vuelta lo
> que ya está decidido. Si algo no está aquí, está en los archivos que se referencian —
> léelos antes de escribir código, no asumas.

## Qué es este proyecto

**SecureQR-ID**: modelo criptográfico de validación de credenciales QR organizacionales.
Trabajo de grado, Maestría en Ciberseguridad, UNAD. Prototipo de investigación académica,
**no producción** — pero el código debe ser correcto y probado como si lo fuera, porque
es la base empírica de un artículo científico.

Repositorio: `https://github.com/rlases/SecureQR-ID` (rama base: `main`).

**Antes de escribir una línea de código, lee en este orden:**

1. `CLAUDE.md` — índice del proyecto, invariantes, convenciones de nombres.
2. `docs/ARCHITECTURE.md` — arquitectura completa de los cinco módulos.
3. `docs/SQRID-1.md` — el formato exacto del token que `issuer/` debe producir.
4. `docs/THREAT-MODEL.md` — qué ataques debe resistir este módulo específicamente.
5. `docs/DECISIONS.md` — ADR-0001 (ECDSA), ADR-0005 (stack, recién cerrado, ver abajo).
6. `.claude/rules/criptografia.md` — reglas no negociables de código criptográfico.
7. `SECURITY.md` — qué nunca debe entrar al repositorio.
8. `CONTRIBUTING.md` — flujo de rama/PR/revisión/pruebas.

## Tu tarea: issue #5 — `issuer/`

**Responsabilidad de `issuer/`:** emisión y firma ECDSA de tokens QR en formato
`SQRID/1`, y custodia del par de claves institucional.

**Frontera dura (no la cruces):**
- La clave privada del emisor **nunca sale de `issuer/`**. No la expongas por HTTP, no
  la loguees, no la pases a otro módulo salvo como resultado ya firmado.
- `issuer/` **no valida** tokens (eso es `verifier/`, issue #6, otro autor lo tiene).
- `issuer/` **no registra eventos** (eso es `evidence-log/`).

### Formato del token (`docs/SQRID-1.md`, resumen — lee el original completo)

Campos que `issuer/` debe producir, todos cubiertos por la firma:

| Campo | Significado |
|---|---|
| `v` | versión de formato, valor fijo `SQRID/1` |
| `kid` | id de la clave pública que verifica esta firma (habilita rotación) |
| `cid` | id opaco de la credencial — **nunca** el número de documento u otro dato personal |
| `iat` | timestamp de emisión |
| `exp` | timestamp de expiración (corto; hazlo parametrizable, no constante) |
| `n` | nonce de un solo uso, generado con CSPRNG |
| `sig` | firma ECDSA sobre la concatenación **canónica** de todos los campos anteriores |

Puntos de diseño todavía abiertos en `SQRID-1.md` que te tocan directamente:
- **Curva elíptica y función hash concretas.** ADR-0001 ya decidió ECDSA (vs. RSA) y usa
  P-256 como ejemplo de tamaño de firma, pero no lo fija formalmente. Si eliges curva y
  hash (recomendado: P-256 + SHA-256, por ser el par más estándar y con mejor soporte de
  librería), **regístralo como ADR nuevo en `docs/DECISIONS.md` antes de implementarlo**
  — es una regla no negociable de `.claude/rules/criptografia.md`, no una sugerencia.
- **Serialización canónica.** Debe ser determinista — mismo contenido, mismos bytes,
  siempre — o la firma no verifica o el payload es maleable. Documenta la elección.
- **Formato de timestamp y tolerancia de desfase de reloj**: decisión conjunta con
  `verifier/`, pero `issuer/` decide cómo codifica `iat`/`exp`. Sé explícito.
- El presupuesto de bytes del QR es un límite real (legibilidad en carné plástico,
  cámaras de gama baja); no es tu problema optimizar la densidad ahora, pero no elijas
  una serialización gratuitamente pesada (evita, por ejemplo, JSON con nombres de campo
  largos si puedes usar algo más compacto y sigue siendo estándar).

### Reglas de criptografía (no negociables — `.claude/rules/criptografia.md`)

- **No implementes primitivas propias.** Firma, hash, aleatoriedad: siempre de una
  librería establecida y mantenida (en Python: `cryptography`). Nada de curva elíptica a
  mano.
- **Aleatoriedad criptográfica siempre.** Nonces con `secrets` (Python), nunca `random`
  ni un timestamp como fuente de entropía.
- **Comparación en tiempo constante** para cualquier valor secreto (aunque `issuer/` no
  hace la comparación de verificación, si comparas cualquier secreto internamente aplica
  igual).
- **Sin claves en el código.** Ni literales, ni defaults, ni "solo para pruebas". Se
  cargan desde el entorno o un almacén externo — para el prototipo, variable de entorno o
  archivo fuera del repo está bien; nunca hardcodeada, nunca en un fixture de test.
- **Sin secretos en logs ni mensajes de error.**
- Cualquier cambio al esquema de firma exige el ADR **antes** del código, no después.

## Stack (ADR-0005, ya cerrado)

**Python** para `issuer/`, `verifier/`, `evidence-log/` — mejor ergonomía criptográfica
(`cryptography`) y consistencia con el análisis estadístico de la fase de evaluación, que
también es Python. `anchor/` es Node.js/TypeScript aparte (no te concierne para esta
tarea).

Estructura esperada, igual al patrón que ya usan `mi-app-qr/server` y `client` como
paquetes independientes:

```
issuer/
  pyproject.toml (o requirements.txt)
  src/
  tests/
```

Entorno virtual propio por módulo — no un monolito compartido con `verifier/` o
`evidence-log/`, aunque vivan en el mismo repositorio.

## Convenciones del repositorio

- **Identificadores de código en inglés** (`issuer`, `verify_signature`, `merkle_root`),
  **documentación y comentarios en español**.
- Los nombres deben coincidir con el vocabulario del artículo de grado: si el documento
  dice "raíz de Merkle", el código dice `merkle_root`, no `hash_tree_top`. Para `issuer/`
  esto aplica sobre todo a los nombres de los campos del token y las funciones públicas.
- No hay operación de borrado ni edición retroactiva en ningún componente de bitácora —
  no aplica directamente a `issuer/`, pero si tocas algo de custodia de claves, el
  principio de "append-only, nunca sobrescribir" es el mismo espíritu.

## Flujo de trabajo (`CONTRIBUTING.md`)

1. Rama desde `main` actualizado: `modulo/5-issuer-ecdsa`.
2. Commits en español, en imperativo, explicando el *porqué* cuando no sea obvio.
3. Abre un PR hacia `main` que:
   - Referencie `Closes #5`.
   - Explique qué se decidió y por qué (curva, hash, serialización), no solo qué
     archivos cambiaron.
   - Confirme explícitamente que revisaste `docs/THREAT-MODEL.md` y
     `.claude/rules/criptografia.md` — es un requisito del PR, no un formalismo.
4. **No te autoapruebes el PR.** El flujo de dos autores exige revisión cruzada; el
   dueño del repositorio (`rlases`) o su colaborador aprueban. No hagas merge tú mismo.
5. CI en verde es condición de merge. Ahora mismo no existe job de `pytest` en
   `.github/workflows/ci.yml` — si tu PR es el primero en aportar código Python real,
   añade ese job (instala dependencias, corre `pytest`) siguiendo el patrón de los jobs
   existentes para `mi-app-qr/server` y `client`.

### Pruebas mínimas exigidas (`CONTRIBUTING.md`, sección Pruebas)

Para `issuer/`, cada caso de rechazo se prueba por separado, no solo el camino feliz:
- Emisión produce un token bien formado, con todos los campos y firma válida verificable
  con la clave pública correspondiente.
- El `kid` emitido corresponde a la clave usada para firmar.
- Nonce único por token (no hay colisión trivial en una muestra razonable).
- Serialización canónica es realmente determinista (mismo input → mismos bytes, siempre).
- La clave privada nunca aparece en un log, error o valor de retorno serializable.

Usa `pytest`. Nada de datos reales — usa `data/ejemplo/` si necesitas fixtures, nunca un
documento de identidad real ni siquiera como ejemplo "descartable".

## Qué NO hacer

- No toques `verifier/`, `evidence-log/`, `anchor/`, `revocation/`, ni nada bajo
  `mi-app-qr/` — fuera de alcance de este issue.
- No decidas el esquema de firma en silencio: ADR primero.
- No hagas merge de tu propio PR.
- No subas ninguna clave, ni siquiera de prueba, al repositorio — ni en `.gitignore`
  parcial, ni "temporalmente". Si ocurre, se considera comprometida y hay que rotarla,
  no borrarla del historial.
