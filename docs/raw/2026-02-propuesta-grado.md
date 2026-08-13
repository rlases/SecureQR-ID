> **Material crudo.** Destilado de `Formato Propuesta Proyecto Grado SIA I 16-01 2025.docx`
> (14 de febrero de 2026). Documento original conservado fuera del repositorio.
>
> **Redactado antes de commitear:** se removieron cédula, teléfono y dirección de
> residencia de los dos integrantes — datos personales de identificación que no
> pertenecen en un repositorio público, aunque sean de los propios autores. El resto del
> contenido se conserva tal como fue presentado y sustentado.

# Propuesta de proyecto de grado

**Fecha:** 14 de febrero de 2026

**Título de la propuesta:** SecureQR-ID: Modelo Criptográfico con Anclaje Blockchain,
para Validación Inmutable de Credenciales Digitales en Entornos organizacionales

## Integrantes de la propuesta

**Jhunier Libardo Hernandez Calderon**
Programa académico: Maestría en Ciberseguridad · Créditos aprobados: 10 (27,78 %)
Correo electrónico: jlhernandezcal@unadvirtual.edu.co
Municipio / Departamento: Pitalito, Huila · Centro: CCAV Pitalito · Zona: Sur

**Duverney Torres Figueroa**
Programa académico: Maestría en Ciberseguridad · Créditos aprobados: 10 (27,78 %)
Correo electrónico: dtorresfi@unadvirtual.edu.co
Municipio / Departamento: Pitalito, Huila · Centro: CCAV Pitalito · Zona: Sur

## Datos específicos del proyecto

**Línea de investigación:** Ingeniería de Software, Seguridad Informática y
Transformación Digital
**Escuela:** ECBTI
**Palabras clave:** Códigos QR seguros, Firma digital, Criptografía asimétrica,
Blockchain, Hash encadenado, Identidad digital, Control de acceso

## Resumen

El proyecto SecureQR-ID propone el diseño e implementación de un modelo criptográfico
para la validación segura de códigos QR utilizados en carnets organizacionales. En
múltiples organizaciones, estos códigos almacenan información sensible sin mecanismos
robustos de protección, lo que facilita su lectura no autorizada, clonación y
suplantación de identidad, además de permitir la manipulación posterior de registros
almacenados en bases de datos tradicionales.

La propuesta integra cifrado y firma digital asimétrica para garantizar confidencialidad
y autenticidad de las credenciales, complementadas con un esquema de hash encadenado que
permite detectar alteraciones en los registros de acceso. Adicionalmente, se implementa
un mecanismo de generación de raíces de Merkle con anclaje periódico en blockchain,
proporcionando evidencia externa de inmutabilidad y fortaleciendo la trazabilidad
organizacional.

El estudio adopta un enfoque de investigación aplicada con diseño cuasi-experimental,
comparando el desempeño del modelo propuesto frente a sistemas QR convencionales. Se
evaluará la reducción del riesgo de suplantación y la capacidad de detección de
manipulaciones, aportando un modelo replicable alineado con estándares internacionales
de seguridad de la información y gestión de identidad digital.

## Planteamiento del problema

La transformación digital ha incrementado el uso de credenciales digitales en
organizaciones públicas y privadas, especialmente mediante carnets institucionales que
incorporan códigos QR para identificación y control de acceso. Estos códigos suelen
almacenar información como número de identificación, nombre, cargo e incluso datos
sensibles. Sin embargo, en múltiples casos, dicha información se encuentra en texto
plano o sin mecanismos criptográficos robustos, lo que permite su lectura directa por
cualquier dispositivo, su clonación y reutilización indebida. La ausencia de mecanismos
de autenticación fuerte y validación criptográfica incrementa el riesgo de suplantación
de identidad y exposición de datos personales (National Institute of Standards and
Technology [NIST], 2017).

Las directrices internacionales de seguridad de la información establecen la necesidad
de proteger la confidencialidad, integridad y disponibilidad de los activos digitales
mediante controles técnicos verificables. ISO/IEC 27001:2022 exige que las
organizaciones implementen medidas para prevenir modificaciones no autorizadas de la
información y garantizar su integridad (International Organization for Standardization
[ISO], 2022). No obstante, en la práctica organizacional, los sistemas basados en
códigos QR rara vez incorporan firma digital, cifrado asimétrico o mecanismos de
verificación que permitan validar la autenticidad de la credencial en tiempo real.

Adicionalmente, los eventos derivados del uso de estos códigos como registros de
ingreso, salida o asistencia se almacenan generalmente en bases de datos tradicionales
que pueden ser modificadas por actores con privilegios elevados. Esta situación
compromete la confiabilidad de la evidencia digital y debilita los procesos de auditoría
y control interno. En entornos hiperconectados, la manipulación de registros representa
un riesgo crítico para la gobernanza digital y la confianza institucional (Schneier,
2020).

En el contexto colombiano, la Ley 1581 de 2012 establece la obligación de proteger los
datos personales frente a accesos, usos o divulgaciones no autorizadas (Congreso de la
República de Colombia, 2012). Asimismo, el Documento CONPES 3995 de 2020 promueve el
fortalecimiento de la confianza y seguridad digital en las organizaciones, impulsando la
adopción de estándares y buenas prácticas en ciberseguridad (Departamento Nacional de
Planeación [DNP], 2020). Sin embargo, la adopción de modelos criptográficos integrales
para proteger credenciales organizacionales sigue siendo limitada.

El problema central identificado es la inexistencia de un modelo criptográfico integral
que proteja la información contenida en códigos QR organizacionales y garantice la
inmutabilidad verificable de los registros generados por su uso. Esta situación
incrementa el riesgo de suplantación de identidad, exposición de datos personales,
manipulación de registros y ausencia de evidencia verificable ante auditorías. En este
sentido, surge la siguiente pregunta de investigación:

> ¿En qué medida la implementación de un modelo criptográfico con firma digital, hash
> encadenado y anclaje periódico en blockchain reduce el riesgo de suplantación y
> garantiza la inmutabilidad verificable de registros en sistemas institucionales de
> control de acceso?

## Justificación

La digitalización de procesos organizacionales ha consolidado el uso de credenciales
electrónicas como mecanismo de identificación y control de acceso. En este contexto, los
carnets con códigos QR se han convertido en una herramienta ampliamente utilizada en
organizaciones públicas y privadas. Sin embargo, la seguridad de estas credenciales
depende de la implementación de mecanismos criptográficos que garanticen
confidencialidad, integridad y autenticidad. ISO (2022) establece que las organizaciones
deben implementar controles técnicos que protejan la información frente a modificaciones
no autorizadas y accesos indebidos, integrando la gestión del riesgo dentro de sus
sistemas de seguridad. Desde esta perspectiva, fortalecer los sistemas de identificación
basados en QR no constituye únicamente una mejora tecnológica, sino una necesidad
estratégica en materia de seguridad de la información.

En el ámbito de identidad digital, NIST (2017) señala que los sistemas de autenticación
deben incorporar mecanismos robustos que reduzcan el riesgo de suplantación y fraude.
Los códigos QR convencionales, al no integrar firma digital ni cifrado asimétrico,
presentan debilidades estructurales frente a estos lineamientos. En consecuencia, la
implementación de un modelo criptográfico basado en firma digital y validación en tiempo
real permite elevar el nivel de seguridad de estas credenciales y alinearlas con
estándares internacionales.

En el contexto colombiano, la Ley 1581 de 2012 obliga a las organizaciones a adoptar
medidas técnicas y administrativas que garanticen la protección de datos personales
frente a accesos o usos no autorizados. De manera complementaria, el CONPES 3995 (DNP,
2020) promueve el fortalecimiento de la confianza y seguridad digital mediante la
adopción de buenas prácticas y estándares internacionales en ciberseguridad.

En este sentido, el desarrollo de un sistema que incorpore firma digital, hash encadenado
y anclaje en blockchain contribuye al cumplimiento normativo y al fortalecimiento de la
gobernanza digital organizacional. Desde el punto de vista técnico y metodológico, la
propuesta es viable porque utiliza tecnologías consolidadas como criptografía asimétrica,
funciones hash seguras y mecanismos de verificación distribuida. Este enfoque permite
aprovechar la infraestructura existente sin reemplazar los sistemas actuales, lo que
reduce costos y facilita su adopción organizacional. Además, el diseño cuasi-experimental
permitirá medir empíricamente la reducción del riesgo de suplantación y la capacidad de
detección de alteraciones en los registros, aportando evidencia cuantificable sobre la
efectividad del modelo.

SecureQR-ID no solo fortalece la protección de credenciales digitales basadas en QR,
sino que aporta un modelo replicable que integra criptografía aplicada, trazabilidad
verificable y gestión del riesgo organizacional, contribuyendo tanto al ámbito académico
como a la práctica profesional en ciberseguridad.

## Objetivo general

Construir un modelo criptográfico de validación segura para códigos QR en carnets
organizacionales que permita fortalecer la confidencialidad de la información, mejorar
la autenticidad de la identidad e incrementar la trazabilidad verificable de los
registros de acceso mediante mecanismos de hash encadenado y anclaje periódico en
blockchain.

## Objetivos específicos

1. Realizar una revisión de literatura y un levantamiento de requerimientos sobre
   validación segura de credenciales QR, criptografía asimétrica, trazabilidad de
   registros y uso de blockchain, con el fin de identificar los componentes, criterios
   de seguridad y necesidades funcionales y técnicas que fundamentarán la arquitectura y
   la herramienta propuesta.
2. Desarrollar la arquitectura criptográfica y el prototipo funcional de la herramienta,
   integrando mecanismos de cifrado, firma digital asimétrica, encadenamiento hash,
   raíces de Merkle y anclaje periódico en blockchain para la validación de credenciales
   QR y el registro trazable de eventos de acceso.
3. Evaluar el desempeño del modelo criptográfico propuesto mediante una prueba
   controlada de validación de credenciales QR, utilizando como métrica principal la
   tasa de detección de credenciales inválidas y, de manera complementaria, el tiempo
   promedio de validación y la integridad verificable de los registros de acceso, en
   comparación con un esquema tradicional de validación de credenciales.

> Nota (ver `docs/STATE.md`): otros entregables del curso reservan espacio para un cuarto
> objetivo específico. Pendiente de unificar antes de la entrega final.

## Marco conceptual y teórico (resumen)

El documento completo desarrolla, con soporte bibliográfico extenso (ver referencias al
final), los siguientes bloques:

- **Antecedentes internacionales:** estandarización ISO/IEC 18004 de códigos QR,
  vulnerabilidades documentadas por Krombholz et al. (2013), Digital Identity Guidelines
  del NIST (SP 800-63-3), secure logging con hash encadenado (Schneier & Kelsey, 1999),
  Certificate Transparency / árboles de Merkle (RFC 6962), Time-Stamp Protocol
  (RFC 3161) y anclaje de evidencia en blockchain.
- **Antecedentes nacionales:** CONPES 3995 (Política Nacional de Confianza y Seguridad
  Digital), Ley 1581 de 2012, investigaciones colombianas sobre blockchain y trazabilidad
  (Vega & Martínez, 2021), ISO 27001 en organizaciones colombianas (Gómez & Ramírez,
  2019), y el Modelo de Seguridad y Privacidad de la Información del MinTIC.
- **Antecedentes locales:** evolución del control de acceso en la UNAD — de registro
  manual en Excel, a biometría para personal docente/administrativo, a carnés con QR sin
  validación criptográfica ni plataforma centralizada de asistencia por evento.
- **Diagnóstico del sector:** mercado inicial en el sector educativo público local
  (UNAD, sede de Pitalito), con posibilidad de expansión a otras instituciones del sur
  del Huila.
- **Marco conceptual:** protección de datos personales y legitimidad en el sector
  público colombiano; registro centralizado vs. anclaje inmutable (hash + blockchain);
  registro de eventos, trazabilidad y auditoría; QR estático vs. QR dinámico con token
  efímero; limitaciones conceptuales (ISO/IEC 27001 y NIST CSF 2.0 no prescriben
  primitivas criptográficas concretas; riesgo de sobrediseño si el anclaje blockchain se
  aplica sin que el modelo de riesgo lo justifique).
- **Marco teórico:** gestión del riesgo y gobernanza (ISO/IEC 27001:2022, NIST CSF 2.0);
  identidad digital y QR dinámico (NIST SP 800-63-3, QRLjacking documentado por OWASP,
  fallas reales de login por QR reportadas por Zhang et al., 2025); controles de
  registro de eventos (ISO/IEC 27002:2022); fundamentos de hash y árboles de Merkle
  (Merkle, 1987); blockchain como evidencia de inmutabilidad (Nakamoto, 2008;
  Hyperledger Fabric); marco normativo colombiano (Ley 1581 de 2012, CONPES 3995).

## Metodología

**Enfoque:** investigación aplicada, experimental de desarrollo tecnológico, con diseño
mixto (cuantitativo y cualitativo) y desarrollo ágil por iteraciones.

**Diseño:** cuasi-experimental con medición pretest/postest, comparando el sistema
tradicional (registro manual o carné físico) frente al sistema digital propuesto.

**Hipótesis:** la implementación de un sistema de control de acceso basado en códigos QR
con validación criptográfica reduce al menos en un 30 % los intentos de suplantación y
mejora en un 40 % el tiempo promedio de registro frente a métodos tradicionales.

**Variable independiente:** implementación del sistema digital con validación
criptográfica y registro de trazabilidad.
**Variables dependientes:** reducción de suplantación, tiempo promedio de registro,
integridad y auditabilidad de los datos.

**Población:** ~200 usuarios de un entorno institucional académico/empresarial con
control de asistencia a eventos o jornadas laborales.
**Muestra:** 75 usuarios, muestreo no probabilístico por conveniencia, participación
voluntaria en la fase piloto.

### Fases del proyecto (cronograma de 8 meses)

| Fase | Meses | Actividades clave |
|---|---|---|
| 1. Investigación y diagnóstico | 1–2 | Análisis normativo (ISO/IEC 27001:2022, 27002:2022, 29147, Ley 1581, Decreto 1078); entrevistas con 5 especialistas; diagnóstico técnico sobre 75 registros de asistencia; revisión documental de soluciones QR existentes |
| 2. Diseño del sistema | 3–4 | Arquitectura modular (backend seguro, BD cifrada, QR dinámico con tokens temporales); modelo de seguridad anti-replay; integración opcional de hash en blockchain privada |
| 3. Desarrollo tecnológico | 5–6 | Generador de QR con validación en tiempo real; hash + timestamp seguro; bitácora de auditoría; pruebas de laboratorio alineadas a ISO/IEC 27001 |
| 4. Pruebas piloto | 6–7 | Despliegue institucional; medición de tiempo de registro e intentos de suplantación detectados; entrevistas de retroalimentación; estadística descriptiva y prueba T |
| 5. Implementación final y capacitación | 8 | Despliegue definitivo; 2 talleres para 20 funcionarios; manual técnico y de usuario; evaluación de impacto (reducción ≥35 % en suplantación, aceptación ≥85 %) |

**Métricas comprometidas:** reducción de suplantación ≥30 % (fase piloto) / ≥35 %
(evaluación final), reducción del tiempo de registro ≥40 %, integridad verificable de
registros, ≥20 funcionarios capacitados, ≥90 % de conformidad en auditoría de controles
de seguridad, cumplimiento de la Ley 1581 de 2012.

**Consideraciones éticas:** anonimización de datos personales, consentimiento informado
para encuestas y entrevistas, y registro en blockchain únicamente de valores hash (nunca
datos personales).

## Resultados o productos esperados

| Resultado / producto | Indicador | Beneficiario |
|---|---|---|
| Sistema digital de control de acceso basado en QR con validación criptográfica | Sistema funcional implementado y operando en entorno institucional piloto | Instituciones académicas y organizaciones empresariales |
| Reducción de intentos de suplantación de identidad | Disminución ≥30 % en intentos de acceso no autorizado detectados | Organizaciones con control de asistencia presencial |
| Optimización del tiempo de registro | Reducción ≥40 % en el tiempo promedio de validación de ingreso | Departamentos administrativos y talento humano |
| Trazabilidad e integridad mediante hash y/o blockchain | Registro verificable de asistencia con evidencia criptográfica sin alteraciones | Entidades reguladoras y directivos institucionales |
| Cumplimiento de la Ley 1581 de 2012 | Informe de auditoría con ≥90 % de conformidad en controles de seguridad | Usuarios finales y responsables de protección de datos |
| Capacitación en uso seguro del sistema | ≥20 funcionarios capacitados, satisfacción ≥4/5 | Administradores y personal operativo |
| Documentación técnica y manual de usuario | Manual técnico y guía aprobados en ≥2 validaciones internas | Equipos de TI institucionales |
| Informe de pruebas de seguridad (suplantación y replay) | Evidencia documentada de pruebas de penetración con mitigación validada | Área de ciberseguridad institucional |
| Documento final de investigación bajo norma APA 7 | Entrega y aprobación académica del trabajo de grado | Comunidad académica y graduandos |

## Sustentación de la propuesta

Presentación en línea sustentada — enlace y grabación conservados por los autores
(no incluidos aquí por no ser código citable del proyecto).

## Referencias bibliográficas

Adams, C., Cain, P., Pinkas, D., & Zuccherato, R. (2001). *Internet X.509 public key
infrastructure time-stamp protocol (TSP)* (RFC 3161). RFC Editor.
https://www.rfc-editor.org/rfc/rfc3161

Azizi, Y., Azizi, M., & Elboukhari, M. (2022). Log data integrity solution based on
blockchain technology and IPFS. *International Journal of Interactive Mobile
Technologies (IJIM)*, 16(15), 4–15. https://doi.org/10.3991/ijim.v16i15.31713

Congreso de la República de Colombia. (2012). *Ley 1581 de 2012*. Por la cual se dictan
disposiciones generales para la protección de datos personales.
https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html

Departamento Nacional de Planeación. (2020). *Documento CONPES 3995: Política nacional
de confianza y seguridad digital*.
https://colaboracion.dnp.gov.co/CDT/Conpes/Econ%C3%B3micos/3995.pdf

Gómez, L., & Ramírez, J. (2019). Implementación de ISO 27001 en organizaciones
colombianas: Retos y oportunidades. *Revista Ingeniería y Competitividad*, 21(2), 45–60.
https://revistas.univalle.edu.co/index.php/ingenieria_y_competitividad

Hyperledger Fabric. (2023). *Hyperledger Fabric documentation* (Release 2.2).
https://hyperledger-fabric.readthedocs.io/en/release-2.2/

International Organization for Standardization. (2022a). *ISO/IEC 27001:2022
Information security management systems — Requirements*.
https://www.iso.org/standard/82875.html

International Organization for Standardization. (2022b). *ISO/IEC 27002:2022
Information security, cybersecurity and privacy protection — Information security
controls*. https://www.iso.org/standard/75652.html

International Organization for Standardization. (2024). *ISO/IEC 18004:2024 Information
technology — Automatic identification and data capture techniques — QR Code bar code
symbology specification*. https://www.iso.org/standard/83389.html

Krombholz, K., Frühwirt, P., Kieseberg, P., Leithner, M., Mulazzani, M., Huber, M., &
Weippl, E. (2013). QR code security: A survey of attacks and challenges for usable
security. In *Lecture Notes in Computer Science*.
https://publications.sba-research.org/publications/llncs.pdf

Laurie, B., Langley, A., & Kasper, E. (2013). *Certificate transparency* (RFC 6962).
RFC Editor. https://www.rfc-editor.org/rfc/rfc6962

Merkle, R. C. (1987). A digital signature based on a conventional encryption function.
In *Advances in Cryptology — CRYPTO '87* (Lecture Notes in Computer Science, Vol. 293,
pp. 369–378). Springer. https://link.springer.com/chapter/10.1007/3-540-48184-2_32

Ministerio de Tecnologías de la Información y las Comunicaciones. (2022). *Modelo de
Seguridad y Privacidad de la Información (MSPI)*.
https://gobiernodigital.mintic.gov.co/portal/Seguridad-y-Privacidad/Modelo-de-Seguridad-y-Privacidad-de-la-Informacion/

Nakamoto, S. (2008). *Bitcoin: A peer-to-peer electronic cash system*.
https://bitcoin.org/bitcoin.pdf

National Institute of Standards and Technology. (2006). *Guide to computer security log
management* (Special Publication 800-92). U.S. Department of Commerce.
https://csrc.nist.gov/publications/detail/sp/800-92/final

National Institute of Standards and Technology. (2017). *Digital identity guidelines*
(SP 800-63-3). U.S. Department of Commerce.
https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63-3.pdf

National Institute of Standards and Technology. (2023). *Digital identity guidelines*
(SP 800-63B). U.S. Department of Commerce. https://pages.nist.gov/800-63-3/sp800-63b.html

National Institute of Standards and Technology. (2024). *The NIST Cybersecurity
Framework (CSF) 2.0*. U.S. Department of Commerce.
https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf

OpenTimestamps. (s. f.). *OpenTimestamps: Provable blockchain timestamps*.
https://opentimestamps.org/

OWASP. (2024). *QRLjacking*. https://owasp.org/www-community/attacks/Qrljacking

Presidencia de la República de Colombia. (2015). *Decreto 1078 de 2015*. Decreto Único
Reglamentario del Sector TIC.
https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=77888

Schneier, B. (2020). *Click here to kill everybody: Security and survival in a
hyper-connected world*. W. W. Norton & Company.
https://wwnorton.com/books/9780393357454

Vega, P., & Martínez, D. (2021). Aplicaciones de blockchain en la trazabilidad de
registros digitales en Colombia. *Revista Facultad de Ingeniería*, 30(58), 89–102.
https://revistas.udea.edu.co/index.php/ingenieria

Yasa, K. A., et al. (2021). Secure electronic document authentication using QR codes and
RSA digital signatures. SciTePress.
https://www.scitepress.org/Papers/2021/109656/109656.pdf

Zhang, X., Zhang, X., Zhao, B., Nan, Y., Liu, Z., Chen, J., Zhou, H., & Yang, M. (2025).
Demystifying the (In)Security of QR code-based login in real-world deployments.
*Proceedings of the 34th USENIX Security Symposium*.
https://www.usenix.org/system/files/usenixsecurity25-zhang-xin.pdf
