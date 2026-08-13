# Material crudo

Aquí van los documentos originales del proyecto **sin curar**: propuesta de grado,
entregas por etapa, artículo del SMS, notas, actas. Es material desechable — lo que
sobrevive es lo destilado en `docs/*.md`.

## Convenciones

**Nombra los archivos para que digan qué contienen:** `2026-02-propuesta-grado.md` vale
mucho más que `documento_final_v3.docx`. Fecha al inicio en formato `AAAA-MM` para que
el orden alfabético sea cronológico.

**Convierte a Markdown o texto plano.** Un PDF o un `.docx` en el repositorio es opaco
para `grep`, para el historial de git y para las herramientas de lectura. Los binarios
están excluidos en `.gitignore` precisamente por eso; si necesitas versionar alguno,
quita la exclusión de forma consciente.

**Marca lo obsoleto, no lo borres.** Si un documento fue superado pero explica el porqué
de una decisión vigente, ponle una nota al inicio: `> OBSOLETO desde 2026-03. Conservado
porque justifica ADR-0004.` Esa trazabilidad es la que un jurado agradece.

**Nunca conviertas datos personales de identificación sin redactarlos primero.** Cédula,
teléfono, dirección de residencia u otros identificadores directos no pertenecen en un
repositorio público, ni siquiera de los propios autores. Redacta antes de commitear y
deja una nota visible al inicio del archivo indicando qué se removió.

## Inventario

| Archivo | Contenido | Fuente original | Vigencia |
|---|---|---|---|
| [`2026-02-propuesta-grado.md`](2026-02-propuesta-grado.md) | Propuesta de grado sustentada: resumen, planteamiento del problema, objetivos, marco conceptual y teórico, metodología, cronograma de 8 meses, productos esperados | `Formato Propuesta Proyecto Grado SIA I 16-01 2025.docx` (14 feb. 2026) | Vigente — datos de identificación de los autores redactados |
| [`2026-03-etapa-2-requerimientos.md`](2026-03-etapa-2-requerimientos.md) | Entrega de curso: PESTEL, DOFA, árbol de problemas, campos de fuerza, priorización de riesgos, métodos por objetivo específico, plan de validación, cronograma detallado, hitos | `Etapa 2_SecureQR-ID.docx` | Vigente |
| [`2026-05-articulo-sms.md`](2026-05-articulo-sms.md) | Artículo del Estudio de Mapeo Sistemático: metodología SMS (Petersen et al.), 24 estudios primarios, respuestas a RQ1–RQ4, referencias completas | `SecureQR_ID.pdf` | Vigente — base de `docs/THREAT-MODEL.md` y `docs/ARCHITECTURE.md` |
