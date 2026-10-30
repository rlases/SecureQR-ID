# Resultados de la evaluación controlada del objetivo 3

SecureQR-ID — cierre técnico de la Fase 4, 2026-10-28.

## Alcance y fuentes

Se evaluó el sistema mediante la batería de ADR-0019, con identidades sintéticas,
claves efímeras de prueba y servicios reales aislados. La medición cubre la detección
de credenciales inválidas, el falso rechazo, el tiempo de validación y la detección
de alteraciones de los registros. No participaron personas del CCAV.

La instalación en el CCAV Pitalito y su eventual piloto son una extensión opcional.
Este informe constituye el resultado de laboratorio del objetivo 3; no acredita
despliegue institucional ni mediciones de tiempo de registro con personas.

| Fuente | Identificación |
|---|---|
| Corrida oficial SecureQR-ID | [40635336117](https://github.com/rlases/SecureQR-ID/actions/runs/40635336117), sobre `main` |
| Commit de la corrida oficial | `6ef5cb9df3c0b3ffb31ce5d045352ef732c5bb61` |
| Configuración | Semilla `20261027`, 200 intentos por caso, 1000 controles, Fabric habilitado |
| Token y reloj | Vigencia de 60 s y tolerancia de 30 s |
| Línea base | `baseline-o3`, commit `1b4498af0d2a76ceeadce0a114c40d9d758c7aab` |
| Evaluador tradicional y comparador | `5840c51cba2d4b3a9aeaf2d9bda0b305823f534a`, árbol limpio |
| Evidencia conservada | [Paquete, procedencia y hashes](../evaluation/evidencia/2026-10-28/README.md) |

El artefacto oficial contiene las cinco salidas originales sin modificar. Se verificó
el digest del ZIP de GitHub y se recalculó su resumen desde las filas. El paquete
versionado conserva además los resultados tradicionales y la comparación, con un
manifiesto SHA-256 por archivo. Los entornos registran sus fechas efectivas en UTC.

## Diseño de la prueba

El brazo SecureQR-ID incluye 17 casos: F1–F4 de falsificación, R1–R3 de reemplazo,
P1–P5 de repetición y frescura, V1–V2 de revocación y M1–M3 de manipulación interna.
El catálogo y los motivos esperados se encuentran en [ADR-0019](DECISIONS.md) y en
[`evaluation/README.md`](../evaluation/README.md).

La batería utiliza las interfaces públicas de los servicios. Fabrica tokens de prueba
con `issuer/`; no usa claves institucionales. La semilla fija selecciona las variantes,
pero las claves y los nonces proceden del generador criptográfico: repetir la semilla
no reproduce los mismos bytes.

Cada rechazo malicioso se contrasta con el motivo interno esperado. Un rechazo por
otra causa se considera un error de la batería y no una detección válida. El grupo
de control utiliza tokens legítimos presentados una sola vez dentro de su vigencia.

La línea base ejecuta `parseQrTextData`, la función de lectura que utiliza la pantalla
de registros del prototipo histórico. Se considera aceptación una lectura válida del
texto. No se evalúa la vigilancia de un operador ni un acceso físico a instalaciones.
Se presentan 200 intentos de cada clase F/P/V y 1000 controles: 1600 filas en total.

## Detección y falso rechazo

La tasa de detección es el número de rechazos válidos dividido entre los intentos
maliciosos. En M, «detectado» significa que el mecanismo de integridad señala la
alteración. El falso rechazo se calcula únicamente sobre el grupo de control.

| Clase de SecureQR-ID | Intentos | Detectados | Detección | IC 95 % de Wilson |
|---|---:|---:|---:|---|
| F — falsificación | 800 | 800 | 100 % | 99,52–100 % |
| R — reemplazo | 600 | 600 | 100 % | 99,36–100 % |
| P — repetición y frescura | 1000 | 1000 | 100 % | 99,62–100 % |
| V — revocación | 400 | 400 | 100 % | 99,05–100 % |
| M — manipulación interna | 600 | 600 | 100 % | 99,36–100 % |
| Global del catálogo | 3400 | 3400 | 100 % | 99,89–100 % |

Cada uno de los 17 casos obtuvo 200 detecciones de 200 intentos, con un intervalo
de Wilson del 95 % de 98,12–100 %. No hubo rechazos con un motivo distinto del esperado.

Los 1000 controles fueron aceptados: falso rechazo observado de 0 %, con IC 95 %
de 0–0,38 %. El resultado acota lo observado en este entorno; no demuestra que
el falso rechazo sea exactamente cero en cualquier despliegue.

## Comparación con la línea base

| Clase común | Tradicional: detectados/intentos | SecureQR-ID: detectados/intentos |
|---|---|---|
| F | 0/200; 0 %; IC 95 % 0–1,88 % | 800/800; 100 %; IC 95 % 99,52–100 % |
| P | 0/200; 0 %; IC 95 % 0–1,88 % | 1000/1000; 100 %; IC 95 % 99,62–100 % |
| V | 0/200; 0 %; IC 95 % 0–1,88 % | 400/400; 100 %; IC 95 % 99,05–100 % |
| Falso rechazo | 0/1000; 0 %; IC 95 % 0–0,38 % | 0/1000; 0 %; IC 95 % 0–0,38 % |

El lector tradicional aceptó los 600 intentos maliciosos y los 1000 controles. Esta
función interpreta el texto del carné; carece de los controles de firma, nonce y lista
de revocación que se están probando. El resultado describe esa función histórica.

R y M no tienen equivalente en la línea base y se declaran no aplicables. Los tamaños
por clase son distintos porque SecureQR-ID tiene varios casos por clase. El global
de 3400 intentos de SecureQR-ID no se enfrenta al global tradicional como si ambos
representaran el mismo catálogo o una muestra de ataques reales con igual frecuencia.

## Reducción de suplantación medida en laboratorio

La meta del objetivo de reducir al menos 30 % los intentos de suplantación aceptados
se mide aquí sobre las clases que ambos brazos comparten (F, P y V):

| Brazo | Intentos maliciosos aceptados | Tasa de aceptación | IC 95 % (Wilson) |
|---|---:|---:|---|
| Tradicional | 600/600 | 100 % | 99,36–100 % |
| SecureQR-ID | 0/2200 | 0 % | 0–0,17 % |

La tasa de aceptación de intentos de suplantación baja del 100 % al 0 %, una reducción
del 100 %; aun tomando los extremos desfavorables de ambos intervalos, la reducción
supera el 99 %, por encima de la meta del 30 %. Es una medida de laboratorio sobre el
catálogo definido por el proyecto: no reemplaza la medición con participantes del
piloto opcional ni se extiende a R y M, que no tienen equivalente en la línea base.

## Tiempo de validación

Sobre los 1000 controles del brazo SecureQR-ID, medidos del lado del cliente HTTP:

| Medida | Milisegundos |
|---|---:|
| Media | 3,624393 |
| Mediana | 3,4585 |
| Percentil 95 | 5,031 |

Son tiempos de la solicitud de validación en el entorno de laboratorio descrito por
`entorno.json`. No incluyen abrir el portal, enfocar la cámara, esperar en una fila
ni guardar un registro administrativo de asistencia. Tampoco son comparables con los
milisegundos de una llamada local al parser tradicional, medidos en otro entorno.
No se calcula una reducción del 40 % del tiempo de registro a partir de estas cifras.

## Integridad verificable

- **M1:** edición, borrado de un eslabón intermedio y reordenamiento. Se detectaron
  200/200 intentos al comprobar la bitácora durante el arranque del servicio.
- **M2:** edición o reordenamiento con recálculo de la cadena local después de anclarla.
  Se detectaron 200/200 intentos al comparar con la raíz ya registrada en Fabric.
- **M3:** alteración del `cid`, reasignación o borrado intermedio del historial de
  asignaciones. Se detectaron 200/200 intentos por la comprobación de integridad del
  servidor de `mi-app-qr`. El atacante de este caso no conoce `ASIGNACIONES_KEY`.

Eliminar el último eslabón puede dejar una cadena local coherente. M1 y M3 no prueban
la detección de ese truncamiento final; la comprobación externa contra lo anclado
aporta el control adicional. M2 no prueba una reconstrucción coordinada de Fabric y
de todos sus respaldos. La confirmación del sello en Bitcoin de una instalación real
requiere evidencia propia y no se deduce de que M2 pase.

## Interpretación y limitaciones

Los resultados respaldan que los controles implementados detectan los casos del
catálogo en la configuración probada, y que los controles legítimos no fueron rechazados.
La comparación evidencia la diferencia respecto a la lectura de texto del prototipo.

La tasa del 100 % corresponde a un catálogo definido por el proyecto, no a todos los
ataques posibles. Los intervalos de Wilson describen las proporciones de las filas;
no representan diversidad de instituciones ni corrigen la dependencia entre intentos
que comparten servicio, configuración y preparación del caso. Las repeticiones no
equivalen a 3400 adversarios, instalaciones o personas independientes.

El sistema valida una credencial temporal, no la identidad física de quien la presenta.
Una captura presentada primero y dentro de `exp` más la tolerancia puede aceptarse.
Ese riesgo, la cesión voluntaria, la omisión del escaneo y el compromiso de la clave
privada están fuera de la tasa. La red Fabric del laboratorio tampoco acredita una
gobernanza descentralizada entre instituciones independientes.

No se midieron aceptación de usuarios, rendimiento en una red institucional, consumo
de recursos bajo carga ni las metas de reducción de suplantación y tiempo en campo;
la reducción de suplantación se informa solo como medida en laboratorio.
No se presenta una prueba T ni un valor p de campo sin observaciones de participantes.
Si se realiza la extensión opcional, se aplica [el protocolo del piloto](PROTOCOLO-PILOTO.md).

## Conclusión técnica

La evaluación controlada del objetivo 3 dispone de implementación integrada,
comparación, métricas y evidencia reproducible. Sus resultados son favorables dentro
del catálogo y el entorno ensayados. El cierre técnico no depende de instalar en el
CCAV; la entrega final debe conservar explícitos estos límites.

## Reproducción y anexo

El [README de la evidencia](../evaluation/evidencia/2026-10-28/README.md) explica cómo
descomprimir el paquete y recalcular el informe. El [manual técnico](MANUAL-TECNICO.md)
describe la instalación de la herramienta de evaluación y la ejecución de ambos brazos.
El [registro de entrega](ENTREGA.md) distingue la publicación `v0.3.0` de la validación
del instalador y de los entregables que aún condicionan `v1.0.0`.
