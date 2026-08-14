# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-08-12
**Fase actual:** diseño y levantamiento de requerimientos (Fase 2 de `ROADMAP.md`)

---

## Hecho

- Revisión sistemática de literatura completada — 24 estudios primarios, metodología SMS
  de Petersen et al. Artículo redactado.
- Brecha de investigación identificada y caracterizada.
- Modelo de amenazas derivado de la literatura, con controles asociados por capa.
- Flujo de validación definido (Algoritmo 1 del artículo).
- Análisis de contexto: PESTEL, DOFA, árbol de problemas, campos de fuerza.
- Diagnóstico del sector y antecedentes internacionales, nacionales y locales.
- Propuesta de grado presentada y sustentada.
- Estructura del repositorio y documentación base (`docs/`, ADRs, glosario, modelo de
  amenazas, especificación `SQRID/1`).
- **Prototipo funcional "Registro QR" (`mi-app-qr/`)**: app de escritorio Electron + React
  para registro de asistencia por QR, con formulario de registro, panel de control,
  edición de registros, exportación a CSV, selección de rol y sistema de licencia/prueba.
  Publicada en GitHub. **No implementa ningún control de seguridad de este diseño** —
  decodifica un QR de texto plano por expresión regular, sin firma ni anti-repetición.
  Es la línea base que motiva el problema de investigación, no un avance de `issuer/` o
  `verifier/`. Ver "Relación con el prototipo existente" en `ARCHITECTURE.md`.
- **Flujo de colaboración con Duverney Torres Figueroa (`Duverney24`):** invitado como
  colaborador del repositorio; issues creados para los dos ADR bloqueantes, el ajuste de
  objetivos específicos y los cinco módulos, con dependencias y milestones por fase de
  `ROADMAP.md`. Repartición inicial: `issuer/`+`verifier/` (núcleo de credencial) para
  Jhunier, `evidence-log/`+`revocation/`+`anchor/` (integridad y anclaje) para Duverney;
  los ADR y el ajuste de objetivos quedan como decisión conjunta.
- **Metodología de trabajo estipulada en `CONTRIBUTING.md`:** rama por tarea, PR
  obligatorio, revisión cruzada antes de fusionar, CI en verde como condición de merge.
  Rama `main` protegida en GitHub (PR + 1 aprobación + check de CI; el dueño del repo
  conserva push directo solo para emergencias justificadas).
- **Infraestructura de pruebas de `mi-app-qr/` reparada:** faltaban las dependencias de
  `@testing-library` (el test por defecto de Create React App nunca había corrido
  realmente). Se agregaron, se reescribió el smoke test para que valide contra la UI
  real de la app, y se añadió `.github/workflows/ci.yml` que lo ejecuta en cada PR.

## En curso

- Reconciliación de la documentación de investigación (traída del material de trabajo
  individual) con el estado real del código en este repositorio.
- **ADR-0008 — `mi-app-qr` pasa a servidor multiusuario en red.** Requerimiento nuevo:
  al ejecutarse, la app debe levantar un servidor accesible por IP en la red
  institucional, con login para personal (no estudiantes), roles diferenciados y
  generación de informes. Registrado como ADR en estado *Propuesta*; quedan pendientes
  el motor de almacenamiento, el transporte cifrado, el catálogo de roles y la política
  de auditoría. Ver `DECISIONS.md` y las amenazas nuevas en `THREAT-MODEL.md`.

## Pendiente

### Bloqueantes

- **ADR-0005: definir el stack.** Nada de código de los módulos seguros puede empezar
  antes de esto.
- **ADR-0007: gobernanza de la red blockchain.** Es la objeción más probable en la
  sustentación; conviene resolverla antes de implementar `anchor/`.
- **Unificar el número de objetivos específicos.** La propuesta define tres; la tabla de
  contenido de la Fase 4 y la Etapa 5 reserva espacio para cuatro. Debe cuadrar antes de
  la entrega final.
- **Limpieza de repositorio:** hay un `App.jsx` suelto en la raíz del repo, anterior a
  `mi-app-qr/src/App.js` y desactualizado respecto a él. Decidir si se elimina o se
  documenta por qué se conserva.

### Implementación

- `issuer/` — emisión y firma ECDSA
- `verifier/` — portal de validación
- `evidence-log/` — bitácora encadenada
- `anchor/` — Merkle + Hyperledger Fabric
- `revocation/` — lista firmada

### Evaluación

- Diseño experimental cuasi-experimental pretest/postest
- Batería de ataques: repetición, falsificación de firma, reemplazo, manipulación interna
- Medición de latencia de validación y consumo de recursos
- Instrumentos Likert de usabilidad y aceptación
- Consentimiento informado y anonimización para la fase piloto

### Cierre

- Piloto en UNAD CCAV Pitalito
- Análisis estadístico de resultados
- Manual técnico y manual de usuario
- Publicación del repositorio y obtención de DOI vía Zenodo
- Envío del artículo (20CCC / CLEI / IEEE Access / JESTE)

---

## Notas de la última sesión

Se creó el repositorio remoto `SecureQR-ID` en GitHub y se publicó el código existente de
`mi-app-qr/` (el commit inicial incluía por error los binarios de build de Electron —
`dist/`, ~400 MB, con archivos de más de 100 MB — lo que impedía el push; se sacaron del
historial y se agregó `/dist` a `.gitignore`). A continuación se incorporó a este
repositorio la documentación de investigación (arquitectura, ADRs, modelo de amenazas,
especificación `SQRID/1`, glosario, hoja de ruta) y se reconcilió `STATE.md` con el hecho
de que ya existe un prototipo funcional sin las capas de seguridad del diseño. Los
documentos fuente originales (propuesta de grado, entrega de Etapa 2, artículo SMS) se
destilaron en `docs/raw/`, con los datos personales de identificación (cédula, teléfono,
dirección de residencia) redactados antes de commitear — no pertenecen en un repositorio
público. Pendiente: revisar `docs/raw/` con el otro autor y resolver ADR-0005 y ADR-0007.
