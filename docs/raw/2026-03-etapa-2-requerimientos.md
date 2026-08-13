> **Material crudo.** Destilado de `Etapa 2_SecureQR-ID.docx` — entrega de curso
> "Requerimientos, diagnóstico, métodos y procesos", Maestría en Ciberseguridad, UNAD,
> 2026. Documento original conservado fuera del repositorio. Sin datos personales de
> identificación en el original; no requirió redacción.

# Etapa 2 — Requerimientos, diagnóstico, métodos y procesos

**Presentado por:** Duverney Torres Figueroa, Jhunier Libardo Hernández Calderón
**Tutor:** Edgar Roberto Dulce
**Universidad Nacional Abierta y a Distancia (UNAD) · ECBTI · Maestría en Ciberseguridad · 2026**

## Introducción

El proyecto SecureQR-ID propone un sistema de identificación digital segura basado en
códigos QR dinámicos, mecanismos criptográficos y trazabilidad soportada en blockchain,
con el propósito de reducir riesgos de suplantación de identidad, manipulación de
credenciales y ataques de repetición. Este documento desarrolla el diagnóstico del
contexto, la priorización de aspectos críticos, la selección y justificación de métodos
y procesos por objetivo específico, y el plan de trabajo estratégico para su ejecución y
validación.

## Objetivos de esta etapa

**General:** elaborar un plan de trabajo para la selección y aplicación de metodologías
y procesos adecuados en el proyecto SecureQR-ID, a partir del diagnóstico de su
contexto, la priorización de aspectos críticos y la definición de estrategias de
validación.

**Específicos:**
1. Realizar un diagnóstico integral del proyecto mediante PESTEL, DOFA, árbol de
   problemas y análisis de campos de fuerza.
2. Priorizar los problemas, riesgos y oportunidades identificados, modelando la solución
   propuesta.
3. Seleccionar los métodos y procesos más adecuados por objetivo específico, definiendo
   el plan de validación y el plan de trabajo estratégico.

## Diagnóstico del contexto

**PESTEL** — resumen por factor:

- **Político:** la propuesta se alinea con políticas de modernización institucional y
  gobernanza digital; entorno favorable a la adopción de mecanismos criptográficos de
  identificación.
- **Económico:** costos de desarrollo (arquitectura, integración criptográfica, pruebas
  piloto, capacitación) frente a beneficios potenciales (reducción de suplantación,
  menos errores de registro, optimización administrativa).
- **Social:** creciente preocupación por protección de identidad digital; el proyecto
  responde tanto a un desafío tecnológico como a una necesidad social de confianza en
  los sistemas de autenticación.
- **Tecnológico:** pilar central del proyecto — criptografía asimétrica, firma digital,
  funciones hash, árboles de Merkle y blockchain como componentes maduros y disponibles.
- **Ecológico:** beneficio indirecto por digitalización (menos documentos físicos e
  impresiones administrativas); no es objetivo principal del proyecto.
- **Legal:** cumplimiento de la Ley 1581 de 2012 (protección de datos personales) como
  eje central; el modelo criptográfico refuerza confidencialidad, integridad,
  autenticidad y trazabilidad exigidas por el marco normativo colombiano.

**DOFA** — síntesis:

- **Fortalezas:** modelo criptográfico integral (firma digital + hash encadenado +
  anclaje blockchain); ataca directamente el problema de suplantación y manipulación de
  registros.
- **Oportunidades:** adopción creciente de credenciales digitales; madurez de blockchain
  y criptografía aplicada; políticas de transformación digital favorables.
- **Debilidades:** requiere conocimiento especializado en criptografía aplicada; gestión
  de claves crítica; posible necesidad de infraestructura e integración adicional.
- **Amenazas:** evolución constante de técnicas de ataque; resistencia organizacional al
  cambio; limitaciones presupuestales; dependencia de decisiones institucionales.

**Árbol de problemas** — problema central: *ausencia de un modelo criptográfico integral
que permita validar de forma segura credenciales organizacionales basadas en códigos QR
y garantizar la integridad verificable de los registros de acceso generados por su uso.*

- **Causas:** QR sin protección criptográfica; falta de validación de autenticidad;
  registros almacenados sin garantía de integridad; ausencia de trazabilidad verificable.
- **Efectos:** riesgo de suplantación de identidad; exposición de datos personales;
  manipulación de registros institucionales; debilidad en auditoría y control.

**Campos de fuerza:** fuerzas impulsoras (creciente necesidad de seguridad digital,
madurez de criptografía asimétrica/hash/blockchain) frente a fuerzas restrictivas
(complejidad técnica, gestión de claves, requerimientos de infraestructura). El balance
favorece la viabilidad del proyecto.

## Priorización de problemas y riesgos

Matriz de impacto vs. probabilidad:

| Problema identificado | Probabilidad | Impacto | Prioridad |
|---|---|---|---|
| Suplantación de identidad mediante clonación de códigos QR | Alta | Alto | **Crítico** |
| Exposición de información personal en credenciales QR | Media | Alto | Alto |
| Manipulación de registros de acceso organizacionales | Media | Alto | Alto |
| Falta de trazabilidad verificable de los registros | Media | Medio | Medio |
| Limitaciones en mecanismos de autenticación de credenciales digitales | Media | Medio | Medio |

## Métodos y procesos por objetivo específico

| Objetivo específico | Método seleccionado | Proceso de implementación (resumen) |
|---|---|---|
| 1. Revisión de literatura y levantamiento de requerimientos | Revisión crítica de literatura + levantamiento estructurado de requerimientos | Ecuaciones de búsqueda y criterios de inclusión/exclusión; matriz de antecedentes; matriz de requerimientos funcionales, no funcionales, técnicos y legales; matriz de trazabilidad problema→requerimientos→solución |
| 2. Arquitectura criptográfica y prototipo funcional | Diseño y desarrollo de arquitectura criptográfica con prototipado funcional integrado | Modelado de arquitectura y actores; estructura de la credencial QR; selección de algoritmos de cifrado/firma; gestión de claves; flujo de emisión/validación; encadenamiento hash por evento; construcción de Merkle por lotes; anclaje periódico en blockchain |
| 3. Evaluación comparativa | Prueba controlada comparativa de validación de credenciales QR | Línea base del método actual → despliegue piloto de SecureQR-ID → escenarios de prueba (uso legítimo, clonación, replay, manipulación) → análisis comparativo descriptivo/inferencial |

Referentes técnicos citados para el diseño del protocolo de verificación: NIST SP
800-63B-4 (resistencia a replay mediante nonces y desafíos de frescura) y OWASP ASVS
(controles de autenticación, protección de datos y logging).

## Plan de validación (objetivo específico 3)

| Aspecto | Definición |
|---|---|
| Método | Prueba controlada comparativa de validación de credenciales QR |
| Grupo de comparación | Esquema tradicional de validación de credenciales |
| Grupo experimental | SecureQR-ID (cifrado, firma digital, verificación criptográfica, hash encadenado, Merkle, anclaje blockchain) |
| Unidad de análisis | Eventos de validación de credenciales QR y registros de acceso asociados |
| Variables dependientes | Tasa de detección de credenciales inválidas (principal); tiempo promedio de validación e integridad verificable de registros (complementarias) |
| Instrumentos | Bitácoras del sistema, pruebas controladas de falsificación y replay, lista de chequeo técnica, verificación criptográfica de integridad |
| Criterios de éxito | Mayor tasa de detección que el esquema tradicional, tiempo de validación operativamente aceptable, integridad verificable demostrada |

## Cronograma estratégico (8 meses)

| Mes | Objetivo | Actividades | Producto |
|---|---|---|---|
| 1 | 1 | Revisión de literatura técnica y normativa; levantamiento de requerimientos de seguridad; atributos sensibles del carné QR | Matriz de literatura, requerimientos y atributos sensibles |
| 2 | 1 | Análisis de antecedentes (validación QR, criptografía asimétrica, trazabilidad, blockchain); consolidación de requerimientos | Informe de revisión + matriz consolidada de requerimientos y criterios de diseño |
| 3 | 2 | Diseño de arquitectura criptográfica; esquema de cifrado/firma; flujo de emisión y lectura; política de claves | Documento de arquitectura + diagrama de componentes |
| 4 | 2 | Mecanismo de verificación; protocolo de validación; reglas de autenticidad/expiración/revocación/anti-replay | Especificación formal del protocolo |
| 5 | 2 | Implementación del módulo emisor-validador; encadenamiento hash; árbol de Merkle; anclaje periódico | Prototipo funcional v1 + módulo de integridad v1 |
| 6 | 2 | Integración verificación + trazabilidad; pruebas de integridad e inmutabilidad; hardening | Prototipo integrado v2 + informe técnico de pruebas |
| 7 | 3 | Ejecución de la prueba controlada; escenarios de clonación/replay/manipulación; recolección de métricas | Base de datos del piloto + informe preliminar |
| 8 | 3 | Análisis de resultados; ajustes finales; manual técnico y de usuario | Informe final, manual técnico, guía de usuario |

## Hitos e indicadores de desempeño

| Hito | Momento | Meta |
|---|---|---|
| 1. Diagnóstico y requerimientos consolidados | Fin mes 1 | 100 % de matriz completada |
| 2. Arquitectura criptográfica definida | Fin mes 2 | Documento técnico aprobado |
| 3. Mecanismo de verificación especificado | Fin mes 3 | 100 % de reglas críticas definidas |
| 4. Prototipo funcional inicial | Fin mes 4 | ≥80 % de módulos críticos implementados |
| 5. Integridad criptográfica operativa | Fin mes 6 | ≥95 % de registros procesados correctamente |
| 6. Piloto ejecutado | Fin mes 7 | 100 % del piloto programado |
| 7. Evaluación final y ajustes cerrados | Fin mes 8 | Metas de reducción de suplantación y tiempos cumplidas |
| Transversal. Socialización en foro | Antes del cierre | Socialización realizada, ≥3 días antes del cierre (15 de marzo de 2026) |

## Conclusiones de la entrega

Esta etapa reorganizó el proyecto en torno a **tres objetivos específicos** (fusionando
"arquitectura criptográfica" y "prototipo funcional" en uno solo, frente a una versión
previa más fragmentada), y centró las métricas de evaluación en la tasa de detección de
credenciales inválidas, el tiempo promedio de validación y la integridad verificable de
los registros de acceso.

> Ver nota de reconciliación en `docs/STATE.md`: otros entregables (Fase 4, Etapa 5)
> reservan espacio para un cuarto objetivo específico — pendiente de unificar.

## Referencias bibliográficas

Capili, B., & Anastasi, J. K. (2024). An introduction to the quasi-experimental design
(nonrandomized design). *American Journal of Nursing*, 124(11), 50–52.
https://doi.org/10.1097/01.NAJ.0001081740.74815.20

Do, B.-L., Dinh, H.-N., Nguyen, V.-T., Tran, M.-H., Le, T.-L., & Nghiem, V.-T. (2022).
B4E: A system for creating and validating digital credentials using remote signing and
blockchain. In *Proceedings of the 11th International Symposium on Information and
Communication Technology* (pp. 420–426). ACM. https://doi.org/10.1145/3568562.3568656

Fresno Chávez, C. (2019). *Metodología de la investigación: así de fácil*. El Cid Editor.
https://elibronet.bibliotecavirtual.unad.edu.co/es/ereader/unad/98278

Geetha, R., Jayakumar, D., Prabakaran, P., Nivedha, S., Sindhu, M., & Thivyarathi, R. C.
(2024). An experimental evaluation of an effective QR code based duplicate product
detection using blockchain technology. In *2024 International Conference on Intelligent
Systems for Cybersecurity*. https://doi.org/10.1109/ISCS61804.2024.10581168

Hernández Calderón, J. L., & Torres Figueroa, D. (2026). *Formato propuesta proyecto de
grado — SecureQR-ID* [Manuscrito no publicado].

Inyangetoh, J. A., & Johnson, E. A. (2025). Development of QR code-based authentication
system for admitting students into examination hall for polytechnics in Nigeria.
*European Journal of Computer Science and Information Technology*, 13(3), 20–42.
https://doi.org/10.37745/ejcsit.2013/vol13n32042

Li, W., Feng, Y., Liu, N., Li, Y., Fu, X., & Yu, Y. (2024). A secure and efficient log
storage and query framework based on blockchain. *Computer Networks*, 252, 110683.
https://doi.org/10.1016/j.comnet.2024.110683

Liu, Z., Ren, L., Feng, Y., Wang, S., & Wei, J. (2023). Data integrity audit scheme based
on quad Merkle tree and blockchain. *IEEE Access*, 11, 59263–59273.
https://doi.org/10.1109/ACCESS.2023.3240066

López Razo, B. S., Campero Domínguez, J. I., de la O. Martinez, V. H., & Trejo de la
Cruz, N. (2026). Modelo basado en blockchain y Ethereum para la emisión y validación de
certificados digitales. *International Journal of Professional Business Review*, 11(1),
e05713. https://doi.org/10.26668/businessreview/2026.v11i1.5713

Merkle, R. C. (1987). A digital signature based on a conventional encryption function.
In *Advances in Cryptology — CRYPTO '87* (LNCS Vol. 293, pp. 369–378). Springer.
https://link.springer.com/chapter/10.1007/3-540-48184-2_32

Molina Arévalo, N., Tovar Perilla, N. J., & Sánchez Echeverri, L. A. (2022). *Proceso de
formulación y gestión de proyectos de investigación, desarrollo e innovación (I+D+i) de
acuerdo con los requisitos de la norma técnica colombiana 5802 del 2008*. Sello Editorial
UNAD. https://doi.org/10.22490/9789586518581

Nakamoto, S. (2008). *Bitcoin: A peer-to-peer electronic cash system*.
https://bitcoin.org/bitcoin.pdf

National Institute of Standards and Technology. (2008). *Technical guide to information
security testing and assessment* (SP 800-115). https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-115.pdf

National Institute of Standards and Technology. (2017). *Digital identity guidelines*
(SP 800-63-3). https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63-3.pdf

National Institute of Standards and Technology. (2025a). *Digital identity guidelines*
(SP 800-63-4). https://doi.org/10.6028/NIST.SP.800-63-4

National Institute of Standards and Technology. (2025b). *Digital identity guidelines:
Authentication and authenticator management* (SP 800-63B-4).
https://doi.org/10.6028/NIST.SP.800-63B-4

OWASP Foundation. (2025). *OWASP Application Security Verification Standard (ASVS)*,
Version 5.0.

Perez, L., Perez, R., & Seca, M. V. (2020). *Metodología de la investigación científica*.
Editorial Maipue. https://elibronet.bibliotecavirtual.unad.edu.co/es/ereader/unad/138497

Purwanto, Y., Ruriawan, M. F., Virgono, A., & Fatihulhaq, H. (2025). Certifichain:
Secure QR codes for blockchain-verified digital credentials. *Digital Threats: Research
and Practice*, 6(3), 1–25. https://doi.org/10.1145/3754458

Riveros, A. J. R., Salinas Meza, J. E., & Mendoza de los Santos, A. C. (2023). Modelo de
autentificación de doble factor. *Innovación y Software*, 4(1), 82–95.
https://doi.org/10.48168/innosoft.s11.a81

Rupok, M. H. K., & Hasan, K. M. A. (2025). BDIMS: A blockchain based digital identity
management system with zero knowledge proof. In *Proceedings of the 3rd International
Conference on Computing Advancements* (pp. 607–615). ACM.
https://doi.org/10.1145/3723178.3723258

Santos Valencia, R. A., Barroso Tanoira, F. G., & Chuc Canul, F. A. (2020). *Cómo
elaborar un proyecto de investigación*. Instituto Mexicano de Contadores Públicos.
https://elibronet.bibliotecavirtual.unad.edu.co/es/ereader/unad/130921

Trejos Buriticá, O. I., Muñoz Guerrero, L. E., & Ríos Patiño, J. I. (2024). *Tesis de
maestría o doctorado: Un enfoque muy práctico*. Universidad Tecnológica de Pereira.
https://repositorio.utp.edu.co/entities/publication/0d5c6268-0b3b-4bcb-bda3-47f5e0720ee0

Universidad Nacional Abierta y a Distancia. (2026). *Guía de aprendizaje – Etapa 2:
Requerimientos, diagnóstico, métodos y procesos* [Guía de curso].
