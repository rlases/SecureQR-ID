> **Material crudo.** Destilado de `SecureQR_ID.pdf` — artículo de la revisión sistemática
> de literatura (Estudio de Mapeo Sistemático), producto de la Fase 1 del proyecto (ver
> `docs/ROADMAP.md`). Documento original conservado fuera del repositorio. Sin datos
> personales; solo autoría académica ya pública en `CITATION.cff`.
>
> El modelo de amenazas y las implicaciones de diseño derivadas de este artículo ya están
> destiladas en `docs/THREAT-MODEL.md` y `docs/ARCHITECTURE.md`. Este documento resume el
> resto del artículo — metodología SMS, clasificación de la literatura y respuestas a las
> preguntas de investigación — y conserva el listado completo de referencias.

# SecureQR-ID: Una Revisión Sistemática de Literatura sobre Validación Criptográfica Segura para Credenciales QR

**Autores:** Jhunier Libardo Hernandez Calderon, Duverney Torres Figueroa — Maestría en
Ciberseguridad, Universidad Nacional Abierta y a Distancia (UNAD), Colombia

## Abstract

A medida que las credenciales organizacionales migran cada vez más hacia formatos
digitales, los códigos QR han surgido naturalmente como el mecanismo principal para la
identificación y el control de acceso en entornos institucionales. Sin embargo, a pesar
de su adopción masiva, la mayoría de las implementaciones actuales operan sin
protecciones criptográficas robustas. Esta omisión crítica deja la información
incrustada altamente vulnerable a la clonación, la suplantación de identidad, los
ataques de repetición y la manipulación no autorizada de registros.

Este artículo presenta una revisión sistemática de literatura que analiza el estado del
arte en la seguridad de los códigos QR y sus mecanismos de validación criptográfica
asociados. Siguiendo la metodología de Estudio de Mapeo Sistemático (SMS) propuesta por
Petersen et al. (2008), el protocolo incluyó una búsqueda estructurada en IEEE Xplore,
Scopus, SpringerLink, ACM Digital Library, ScienceDirect y Google Scholar, y resultó en
la selección y análisis de **24 estudios primarios**.

Los hallazgos revelan un patrón claro: aunque la investigación académica ha desarrollado
soluciones parciales para autenticidad, integridad y trazabilidad de forma
independiente, no existe un modelo integrado que garantice las tres simultáneamente en
sistemas de credenciales QR organizacionales. La contribución principal del estudio es
la identificación y caracterización de esa brecha de investigación, que motiva y
fundamenta el diseño de SecureQR-ID: firmas digitales para autenticidad, encadenamiento
de hashes y estructuras de Merkle para un registro a prueba de manipulaciones, y anclaje
periódico en blockchain para inmutabilidad verificable.

**Index Terms:** Blockchain, validación criptográfica, credenciales digitales, firma
digital, seguridad de códigos QR, estudio de mapeo sistemático, trazabilidad.

## Motivación local: UNAD CCAV Pitalito

El artículo cita explícitamente el caso que origina el proyecto: en el campus de la UNAD
CCAV Pitalito, el personal de seguridad gestiona el control de acceso estudiantil y el
registro de asistencia mediante verificación manual de documentos y hojas de cálculo
Excel — un proceso sin ninguna validación criptográfica, susceptible a error humano y
suplantación, y sin pista de auditoría a prueba de manipulaciones. Aunque la UNAD emite
carnés con QR, se usan solo para ingreso general al campus, sin integración a un sistema
dinámico de validación. Esta brecha operativa concreta ejemplifica el problema sistémico
más amplio que SecureQR-ID busca resolver — y es, literalmente, el problema que
`mi-app-qr/` automatiza sin resolver (ver "Relación con el prototipo existente" en
`docs/ARCHITECTURE.md`).

## Metodología (Estudio de Mapeo Sistemático, Petersen et al., 2008)

**Preguntas de investigación:**

- **RQ1:** ¿Cuáles son las principales vulnerabilidades de seguridad asociadas con el uso
  de códigos QR en los sistemas de identificación?
- **RQ2:** ¿Qué mecanismos criptográficos se han propuesto para asegurar la autenticidad
  y la integridad en las credenciales basadas en QR?
- **RQ3:** ¿Qué enfoques se utilizan para garantizar la trazabilidad y la inmutabilidad de
  los registros generados por los sistemas basados en QR?
- **RQ4:** ¿Qué limitaciones existen en las soluciones actuales y qué brechas de
  investigación se pueden identificar?

**Estrategia de búsqueda:** bases de datos IEEE Xplore, ACM Digital Library,
SpringerLink, ScienceDirect, Scopus, ResearchGate y Google Scholar. Cadena de búsqueda
principal: `("QR code security" OR "secure QR") AND ("digital signature" OR
"cryptography") AND ("blockchain" OR "hash chain" OR "Merkle tree")`, sin restricción
temporal, complementada con términos como *credential validation*, *digital identity*,
*tamper-evident logging*, *academic certificate verification* y *paper-based document
authentication*.

**Embudo de selección:** 80 estudios identificados → 50 tras cribado de título/resumen →
30 elegibles tras evaluación a texto completo → **24 estudios primarios** finales, tras
control de calidad y eliminación de duplicados.

**Criterios de inclusión:** artículos revisados por pares, actas de conferencia,
estándares técnicos y documentos criptográficos fundamentales; estudios sobre seguridad
de códigos QR, identidad digital, verificación de documentos o validación de
credenciales; investigaciones con mecanismos criptográficos activos (firmas digitales,
hash, Merkle, contratos inteligentes, blockchain); en inglés o español.

**Criterios de exclusión:** fuentes no académicas sin trazabilidad técnica; estudios sin
vínculo directo con seguridad QR/validación/auditoría; duplicados; documentos con
detalles metodológicos insuficientes.

**Evaluación de calidad (no excluyente, pondera la interpretación):** cinco criterios
(QC1–QC5) puntuados 0/0.5/1 — abordaje directo del problema, claridad del mecanismo
criptográfico, suficiencia metodológica, evidencia de autenticidad/integridad/
trazabilidad, y discusión explícita de limitaciones.

**Uso declarado de IA:** los autores declaran que las herramientas de IA se usaron
únicamente para revisión lingüística, corrección gramatical y formato de figuras. El
diseño del estudio, la selección de literatura, la extracción de datos, la clasificación
temática y la interpretación que identificó la brecha de investigación fueron un proceso
autoral humano, con verificación manual de cada referencia contra su fuente original.

### Clasificación del corpus por categoría temática

| Categoría | Descripción | Estudios |
|---|---|---|
| Vulnerabilidades de códigos QR | Clonación, suplantación, reemplazo, repetición, phishing, acceso no autorizado a datos | 6 |
| Autenticación criptográfica | Firmas digitales, cifrado o mecanismos asimétricos para autenticidad | 7 |
| Mecanismos de integridad de datos | Funciones hash, encadenamiento, estructuras de Merkle, registros seguros | 5 |
| Trazabilidad basada en blockchain | Blockchain, contratos inteligentes, registros distribuidos, inmutabilidad | 6 |
| **Total** | | **24** |

La concentración en autenticación criptográfica y trazabilidad blockchain, frente a la
menor cobertura de integridad de datos y vulnerabilidades operativas específicas,
confirma la fragmentación del ecosistema de soluciones — y motiva un enfoque integrado
como SecureQR-ID.

## Respuestas a las preguntas de investigación

- **RQ1:** los esquemas QR, al carecer de barreras estructurales, son inherentemente
  débiles frente a phishing, reutilización delictiva y manipulación visual.
- **RQ2:** las firmas RSA/ECDSA cubren la autoría e inmutabilidad estática de las
  credenciales, pero su enfoque exclusivo en la autenticación de registros pasivos las
  hace insuficientes para el control de acceso dinámico.
- **RQ3:** el encadenamiento jerárquico de hashes, las estructuras de Merkle y el
  anclaje en blockchain son la tríada preferida para inmutabilidad, pero la literatura
  no logra integrarlos fluidamente con un emisor QR interactivo.
- **RQ4:** el mapeo confirma una brecha de aplicación científica real — la ausencia de un
  modelo unificador —, lo que valida teóricamente el diseño de SecureQR-ID.

## Trabajo futuro (según el artículo)

1. **Implementación del prototipo:** emisor ECDSA de tokens QR, portal de escaneo,
   bitácora hash local continua y un puente que genere e inyecte periódicamente raíces
   de Merkle sobre Hyperledger Fabric permisionada.
2. **Validación de seguridad:** exponer el prototipo a repetición de tokens, falsificación
   de firmas, reemplazo de carnés y manipulación interna, con despliegue de campo en los
   torniquetes de la UNAD CCAV Pitalito, midiendo usabilidad con escalas Likert.
3. **Diseminación:** enviar el manuscrito consolidado a la Conferencia Colombiana de
   Computación (20CCC), CLEI, IEEE Access o JESTE.

Esto coincide con las fases 3–5 de `docs/ROADMAP.md`.

## Referencias

[1] K. Krombholz, P. Frühwirt, P. Kieseberg, I. Kapsalis, M. Huber, y E. Weippl, "QR Code
Security: A Survey of Attacks and Challenges for Usable Security," en *Human Aspects of
Information Security, Privacy, and Trust*, LNCS vol. 8533. Springer, 2014, pp. 79–90.
https://doi.org/10.1007/978-3-319-07620-1_8

[2] R. Focardi, F. L. Luccio, y H. A. M. Wahsheh, "Usable security for QR code," *Journal
of Information Security and Applications*, vol. 48, p. 102369, 2019.
https://doi.org/10.1016/j.jisa.2019.102369

[3] M. S. Haque y R. Dybowski, "Advanced QR code based identity card: A new era for
generating student ID card in developing countries," en *Proceedings of the 2014 First
International Conference on Systems Informatics, Modelling and Simulation*, IEEE, 2014,
pp. 97–103. https://doi.org/10.5555/2681970.2682472

[4] X. Zhang, X. Zhang, B. Zhao, Y. Nan, Z. Liu, J. Chen, H. Zhou, y M. Yang,
"Demystifying the (In)Security of QR Code-based Login in Real-world Deployments," en
*Proceedings of the USENIX Security Symposium 2025*, 2025.
https://www.usenix.org/system/files/conference/usenixsecurity25/sec25cycle1-prepub-1311-zhang-xin.pdf

[5] M. A. U. Naser, E. T. Jasim, y H. M. Al-Mashhadi, "QR code based two-factor
authentication to verify paper-based documents," *TELKOMNIKA*, vol. 18, no. 4, pp.
1834–1842, 2020. https://doi.org/10.12928/TELKOMNIKA.v18i4.14339

[6] Y. Azizi, M. Azizi, y M. Elboukhari, "Log Data Integrity Solution based on Blockchain
Technology and IPFS," *International Journal of Interactive Mobile Technologies
(iJIM)*, vol. 16, no. 15, pp. 4–15, 2022.
https://www.researchgate.net/publication/362759213

[7] A. Singh, Y. Zhou, S. Mehrotra, M. Sadoghi, S. Sharma, y F. Nawab, "WedgeBlock: An
Off-Chain Secure Logging Platform for Blockchain Applications," en *Proceedings of the
26th International Conference on Extending Database Technology (EDBT)*, 2023.
https://doi.org/10.48786/edbt.2023.45

[8] H. Wang y J. Zhang, "Blockchain Based Data Integrity Verification for Large-Scale IoT
Data," *IEEE Access*, 2019. https://doi.org/10.1109/ACCESS.2019.2952635

[9] H. A. Ahmed y J. W. Jang, "Document Certificate Authentication System Using
Digitally Signed QR Code Tag," en *Proceedings of IMCOM '18*, ACM, 2018.
https://doi.org/10.1145/3164541.3164586

[10] K. A. Yasa, P. G. Sukarata, G. P. M. E. Putra, I. M. R. A. Nugroho, y I. N. G. A.
Astawa, "Secure Electronic Document with QR Code and RSA Digital Signature Algorithm,"
en *Proceedings of iCAST-ES 2021*, SCITEPRESS, 2023.
https://doi.org/10.5220/0010965600003260

[11] M. Wagasa, E. Winarno, y A. Sudarsono, "QR Code-Based Smart Document Implementation
Using Distributed Database And Digital Signature," *Indonesian Journal of Computer
Science*, vol. 13, no. 1, 2024. https://www.ijcs.net/ijcs/index.php/ijcs/article/view/3673

[12] T. Wellem, Y. Nataliani, y A. Iriani, "Academic Document Authentication using
Elliptic Curve Digital Signature Algorithm and QR Code," *International Journal on
Informatics Visualization*, vol. 6, no. 3, pp. 667–675, 2022.
https://doi.org/10.62527/joiv.6.3.872

[13] A. Badr, L. Rafferty, Q. H. Mahmoud, K. Elgazzar, y P. C. K. Hung, "A Permissioned
Blockchain-Based System for Verification of Academic Records," en *2019 10th IFIP
International Conference on New Technologies, Mobility and Security (NTMS)*, IEEE, 2019.
https://doi.org/10.1109/NTMS.2019.8763831

[14] D. Dobre y A. Vasilățeanu, "Electronic health record authentication and
authorization using Blockchain and QR codes," *Procedia Computer Science*, vol. 239, pp.
1784–1791, 2024. https://doi.org/10.1016/j.procs.2024.06.358

[15] M. Al Hemairy, M. Abu Talib, A. Khalil, A. Zulfiqar, y T. Mohamed,
"Blockchain-based framework and platform for validation, authentication & equivalency of
academic certification and institution's accreditation: UAE case study," *Education and
Information Technologies*, vol. 29, pp. 18203–18232, 2024.
https://doi.org/10.1007/s10639-024-12493-6

[16] K. Petersen, R. Feldt, S. Mujtaba, y M. Mattsson, "Systematic mapping studies in
software engineering," en *Proceedings of EASE 2008*, pp. 68–77.

[17] R. C. Merkle, "A Digital Signature Based on a Conventional Encryption Function," en
*Advances in Cryptology — CRYPTO '87*, LNCS vol. 293. Springer, 1988, pp. 369–378.

[18] S. Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System," 2008.
https://bitcoin.org/bitcoin.pdf

[19] P. A. Grassi, J. L. Fenton, N. B. Lefkovitz, J. M. Danker, Y.-Y. Choong, K. K.
Greene, y M. F. Theofanos, "Digital Identity Guidelines: Enrollment and Identity
Proofing," NIST SP 800-63A, 2017. https://doi.org/10.6028/NIST.SP.800-63a

[20] P. Subpratatsavee y P. Kuacharoen, "An Implementation of a Paper Based
Authentication Using HC2D Barcode and Digital Signature," en *Computer Information
Systems and Industrial Management*. Springer, 2014, pp. 592–601.
https://doi.org/10.1007/978-3-662-45237-0_54

[21] O. S. Saleh, O. Ghazali, y Q. Al Maatouk, "Graduation Certificate Verification
Model: A Preliminary Study," *IJACSA*, vol. 10, no. 7, pp. 575–581, 2019.
https://doi.org/10.14569/IJACSA.2019.0100777

[22] T. Wang, H. Zheng, C. You, y J. Ju, "A Texture-Hidden Anti-Counterfeiting QR Code
and Authentication Method," *Sensors*, vol. 23, no. 2, p. 795, 2023.
https://doi.org/10.3390/s23020795

[23] X. Zhai, S. Pang, M. Wang, S. Qiao, y Z. Lv, "TVS: a trusted verification scheme for
office documents based on blockchain," *Complex & Intelligent Systems*, vol. 9, pp.
2865–2877, 2023. https://doi.org/10.1007/s40747-021-00617-1

[24] A. Rustemi, F. Dalipi, V. Atanasovski, y A. Risteski, "DIAR: a blockchain-based
system for generation and verification of academic diplomas," *Discover Applied
Sciences*, vol. 6, p. 297, 2024.

[25] B.-L. Do, V.-T. Nguyen, H.-N. Dinh, T.-C. Dao, y B. M. Nguyen, "Blockchain for
Education: Verification and Management of Lifelong Learning Data," *Computer Systems
Science and Engineering*, vol. 43, no. 2, pp. 591–604, 2022.
https://doi.org/10.32604/csse.2022.023508

[26] Congreso de la República de Colombia, "Ley 1581 de 2012: Por la cual se dictan
disposiciones generales para la protección de datos personales," Diario Oficial No.
48.587, 18 de oct. de 2012.

[27] Consejo Nacional de Política Económica y Social, "CONPES 3995: Política Nacional de
Confianza y Seguridad Digital," Departamento Nacional de Planeación, Bogotá, Colombia,
2020.

[28] International Organization for Standardization, "ISO/IEC 27001:2022 Information
security, cybersecurity and privacy protection — Information security management
systems — Requirements," ISO/IEC, 2022.
