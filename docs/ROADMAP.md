# Hoja de ruta

Alineada con el cronograma de ocho meses de la propuesta de grado. Cada fase cierra con
un tag en el repositorio, de modo que el historial de versiones sirva como evidencia
del avance.

---

## Fase 1 — Investigación y diagnóstico ✅

Revisión de normativa (ISO/IEC 27001:2022, 27002:2022, Ley 1581 de 2012, Decreto 1078
de 2015), revisión sistemática de literatura, diagnóstico técnico del proceso actual y
entrevistas con especialistas.

**Entregable:** artículo del estudio de mapeo sistemático, brecha caracterizada.

---

## Fase 2 — Diseño del sistema → `v0.1.0`

Arquitectura modular, especificación cerrada del formato `SQRID/1`, modelo de seguridad
(anti-replay, expiración, bitácora), esquema de anclaje.

**Cierra cuando:** ADR-0005 y ADR-0007 estén resueltos y `SQRID-1.md` deje de ser borrador.

---

## Fase 3 — Desarrollo tecnológico → `v0.2.0`

Los cinco módulos implementados y probados en laboratorio.

**Orden sugerido, y no es arbitrario:**

1. `issuer/` — sin tokens firmados no hay nada que validar
2. `verifier/` — cierra el lazo mínimo emisión → validación
3. `evidence-log/` — añade la capa de integridad de registros
4. `revocation/` — completa el ciclo de vida de la credencial
5. `anchor/` — al final, porque es el que más dependencias externas arrastra

Empezar por `anchor/` es la trampa habitual: es la parte más vistosa, pero deja el
sistema sin nada que anclar durante semanas.

---

## Fase 4 — Pruebas de seguridad y piloto → `v0.3.0`

Batería de ataques (repetición, falsificación, reemplazo, manipulación interna),
despliegue en UNAD CCAV Pitalito con la muestra prevista, recolección de métricas.

**Métricas comprometidas en la propuesta:**

- Tasa de detección de credenciales inválidas (métrica principal)
- Reducción de intentos de suplantación ≥ 30 %
- Reducción del tiempo promedio de registro ≥ 40 %
- Integridad verificable de los registros de acceso

---

## Fase 5 — Implementación final y cierre → `v1.0.0`

Despliegue definitivo, capacitación (≥ 20 funcionarios), manual técnico y de usuario,
análisis estadístico, documento final bajo APA 7.

---

## Después del grado

- Publicación del repositorio y DOI vía Zenodo
- Envío del artículo a 20CCC, CLEI, IEEE Access o JESTE
- Evaluación de expansión a otras instituciones del sur del Huila
