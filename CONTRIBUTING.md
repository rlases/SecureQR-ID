# Cómo trabajamos

Somos dos autores (Jhunier Libardo Hernández Calderón — `rlases`, Duverney Torres
Figueroa — `Duverney24`). Este documento fija el flujo de trabajo en el repositorio para
que quede estipulado, no solo acordado de palabra. La rama `main` está protegida en
GitHub para que la mecánica coincida con lo que dice este archivo — ver
[configuración de la rama](#protección-de-main-en-github) al final.

## Flujo: rama → PR → revisión cruzada → merge

1. **Nunca se trabaja directo sobre `main`.** Cada tarea (issue) se desarrolla en su
   propia rama, creada desde `main` actualizado.

2. **Nombre de rama:** `<tipo>/<issue>-<slug-corto>`, en minúsculas.

   | Tipo | Uso |
   |---|---|
   | `modulo/` | Implementación de uno de los cinco módulos (`issuer/`, `verifier/`, `evidence-log/`, `anchor/`, `revocation/`) |
   | `adr/` | Resolución de una decisión de arquitectura pendiente |
   | `docs/` | Documentación, sin cambios de código |
   | `fix/` | Corrección de un defecto |

   Ejemplos: `modulo/5-issuer-ecdsa`, `adr/2-stack`, `docs/contributing`.

3. **Commits en español**, en imperativo, describiendo el *porqué* cuando no sea obvio
   (ver convención ya establecida en `CLAUDE.md`).

4. **Abrir un Pull Request hacia `main`** cuando la rama esté lista. El PR debe:
   - Referenciar el issue que resuelve (`Closes #5`, por ejemplo).
   - Explicar qué se decidió y por qué, no solo qué archivos cambiaron.
   - Si toca un control de seguridad (rutas bajo `issuer/`, `verifier/`, `revocation/`,
     `evidence-log/`, `anchor/`), confirmar explícitamente que se revisaron
     `docs/THREAT-MODEL.md` y las reglas de `.claude/rules/`.

5. **Revisión cruzada antes de fusionar.** El autor del PR no lo aprueba ni lo fusiona
   él mismo salvo emergencia justificada. El otro autor revisa y aprueba — o pide
   cambios — antes del merge. En un equipo de dos, esto significa en la práctica: *si
   tú abriste el PR, lo aprueba Duverney; si él lo abrió, lo apruebas tú.*

6. **CI en verde es condición para fusionar**, no una sugerencia. Ver
   [Pruebas](#pruebas) abajo.

7. **Fusionar con "Squash and merge"** para mantener el historial de `main` legible: un
   commit por PR, con mensaje que resuma la tarea completa.

8. **Al cerrar cada sesión de trabajo, actualizar `docs/STATE.md`** con lo hecho, lo que
   quedó a medias y lo pendiente. Esto ya estaba establecido en `CLAUDE.md`; se repite
   aquí porque es la pieza que más se olvida bajo presión de entrega.

## Pruebas

- **Todo PR debe incluir las pruebas correspondientes a lo que cambia.** Un módulo
  nuevo sin pruebas no se fusiona, sin excepción — y menos tratándose de rutas
  criptográficas.
- **`mi-app-qr/`** usa Jest + React Testing Library (`npm test` dentro de esa carpeta).
  El flujo de CI (`.github/workflows/ci.yml`) lo ejecuta en cada PR que toque esa
  carpeta.
- **`mi-app-qr/server`** usa Vitest + Supertest (`npm test` dentro de `mi-app-qr/server`).
  El flujo de CI lo ejecuta en cada PR que toque esa carpeta.
- **`mi-app-qr/client`** usa Vitest + React Testing Library (`npm test` dentro de
  `mi-app-qr/client`). El flujo de CI lo ejecuta en cada PR que toque esa carpeta.
- **`issuer/`** usa pytest. Desde esa carpeta: crear y activar un entorno virtual,
  ejecutar `python -m pip install -e ".[test]"` y luego `python -m pytest`. El job
  `issuer-test` de CI reproduce esos dos últimos comandos.
- **`verifier/`** usa pytest y comprueba interoperabilidad contra el paquete real del
  emisor. Desde `verifier/`: ejecutar `python -m pip install -e ../issuer -e ".[test]"`
  y luego `python -m pytest`. El job `verifier-test` reproduce esos comandos.
- **`verifier-web/`** usa Vitest + Testing Library y Playwright. Desde esa carpeta:
  ejecutar `npm ci`, `npm test`, `npm run build`, `npx playwright install chromium` y
  `npm run test:e2e`. El job `verifier-web-test` reproduce el flujo en escritorio,
  tableta y móvil e incluye auditoría axe.
- **El futuro módulo Python** `evidence-log/` debe usar pytest y un entorno virtual
  propio siguiendo el mismo patrón. `anchor/` definirá su runner de Node.js al
  implementarse.
- **Pruebas mínimas exigidas por módulo, una vez exista código:**
  - `issuer/`: token bien formado y verificable con su clave pública, `kid` derivado de
    esa clave, nonce único, serialización canónica y ausencia de clave privada en logs,
    errores o retornos serializables.
  - `verifier/`: firma válida e inválida, token expirado, nonce repetido, credencial
    revocada, reinicio y concurrencia — cada rechazo por separado y en el orden de
    `docs/ARCHITECTURE.md`.
  - `evidence-log/`: cadena de hashes íntegra, detección de un eslabón alterado,
    verificación completa de la cadena.
  - `anchor/`: cálculo de raíz de Merkle, generación y verificación de prueba de
    inclusión, sin depender de una red Fabric real en las pruebas unitarias.
  - `revocation/`: verificación de firma de la lista, distribución a un verificador con
    conectividad intermitente.
- **Nada de datos reales en pruebas.** Usa `data/ejemplo/` (sintético) — ver
  `SECURITY.md`.

## Protección de `main` en GitHub

Configurada para que el flujo anterior no dependa solo de la disciplina:

- Pull request obligatorio antes de fusionar a `main`.
- Al menos **1 revisión aprobada**.
- El check de CI (`test`) debe pasar.
- Revisiones obsoletas se descartan si se suben commits nuevos al PR.
- **Excepción:** el dueño del repositorio (`rlases`) puede saltarse esta regla para
  casos urgentes (ej. revertir algo roto en producción del piloto). Usarla como
  excepción, no como costumbre — si se usa, avisar al otro autor y dejar constancia en
  el PR o el commit de por qué no se siguió el flujo normal.
