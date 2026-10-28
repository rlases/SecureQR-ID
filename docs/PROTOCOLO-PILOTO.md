# Protocolo de la medición de campo del piloto

Protocolo de la medición de campo del objetivo 3 en el CCAV Pitalito (ADR-0019, punto 8;
issue #157). Complementa la batería de laboratorio de `evaluation/` (ADR-0019, puntos 1
a 7): la batería mide qué detecta el sistema con miles de intentos repetibles, y este
protocolo mide qué pasa con personas reales en el punto de control.

Se sigue tal cual. Cualquier desvío (un día sin observador, un participante que cambia de
teléfono a mitad de la prueba) se anota en el registro de desvíos (§9) y se declara en el
documento de grado, sin corregir los datos a mano.

---

## 1. Diseño

Cuasi-experimental con medición **pretest/postest** sobre los mismos participantes, como
en la propuesta de grado:

| | Pretest | Postest |
|---|---|---|
| Sistema | Esquema tradicional: `mi-app-qr` en la etiqueta `baseline-o3` (QR del carné leído como texto, sin firma ni nonce) | SecureQR-ID: QR del portal del titular validado por `verifier-service` en el punto de control |
| Duración | 1 semana de registros | 2 semanas de registros; la primera semana es de adaptación y no se mide el tiempo |
| Qué se mide | Tiempo de registro e intentos controlados (§5, §6) | Lo mismo, más la integridad de la bitácora (§7) y la aceptación (§8) |

El pretest va primero porque `baseline-o3` no requiere alta. El orden fijo puede
introducir un efecto de aprendizaje: se declara como limitación, y la semana de
adaptación del postest busca que no favorezca al sistema nuevo solo por la novedad.

**Hipótesis (propuesta de grado):**

- **H1:** SecureQR-ID reduce al menos un **30 %** los intentos de suplantación que
  tienen éxito frente al esquema tradicional.
- **H2:** SecureQR-ID reduce al menos un **40 %** el tiempo promedio de registro.

## 2. Participantes

- **Muestra:** 75 personas, muestreo no probabilístico por conveniencia, entre
  estudiantes, docentes y administrativos del CCAV Pitalito.
- **Inclusión:** mayores de 18 años, con carné institucional con QR (para el pretest) y
  un teléfono con navegador y cámara (para el postest).
- **Exclusión:** menores de edad, y quien no firme el consentimiento (§3).
- **Retiro:** cualquiera puede retirarse en cualquier momento, sin dar razones y sin
  ninguna consecuencia académica o laboral. Sus datos de medición se excluyen del
  análisis, y el retiro se anota en el registro de desvíos.

Cada participante recibe un **código de estudio** (`P01` a `P75`). Las planillas de
medición y los intentos usan solo ese código, nunca el nombre ni el documento. La tabla
código → persona la guarda Jhunier en su gestor de contraseñas, fuera del servidor y del
repositorio, y se destruye al cierre del piloto (§10).

## 3. Consentimiento y datos personales

Hay **dos documentos distintos**, y los dos se firman antes del pretest:

1. **Consentimiento informado de participación en el estudio.** Explica el objetivo, qué
   se mide (tiempos, intentos, encuesta), que la participación es voluntaria y
   revocable, que no hay riesgo ni beneficio directo, y quiénes son los investigadores
   y cómo contactarlos. Incluye el consentimiento específico para los intentos
   controlados (§6) de quien acepte hacerlos.
2. **Autorización de tratamiento de datos (Ley 1581 de 2012).** Es la que acepta el
   titular en el portal al registrarse (ADR-0016, punto 2). El consentimiento de
   participación no la reemplaza.

**Conservación.** Al cierre del piloto se anonimizan los datos personales de
`mi-app-qr`, incluido el texto libre del historial de cambios (#147), y se destruyen
los respaldos (ADR-0016, punto 10; ADR-0018, punto 6). La bitácora encadenada no se
borra, pero solo contiene `cid`: sin la relación `cid` → persona, sus eventos dejan de
poder atribuirse a alguien.

Ningún dato de una persona que no participa en el estudio entra en la medición. El
personal del CCAV que use el sistema fuera del estudio no se cuenta.

## 4. Roles

| Rol | Quién | Qué hace |
|---|---|---|
| Observador | Un autor por jornada (Jhunier o Duverney) | Cronometra los registros y anota los intentos en las planillas |
| Operador del punto de control | Personal del CCAV o un autor | Opera `mi-app-qr` (pretest) o la pantalla de `verifier-web` (postest) como en un día normal |
| Custodio | El de ADR-0016 | Arranca el emisor, firma la lista de revocación y aplica las revocaciones del caso V (§6) |
| Participante | `P01`–`P75` | Registra su asistencia y, si aceptó, hace los intentos que le asigna el observador |

El observador no opera el punto de control: si cronometra y opera a la vez, mide su
propia velocidad.

## 5. Tiempo de registro (H2)

**Definición.** Es el tiempo desde que el participante **presenta** su credencial al
punto de control hasta que la pantalla **muestra el resultado**. Presentar es acercar el
carné al lector (pretest) o mostrar el QR del teléfono a la cámara (postest). El
resultado es el registro guardado en `mi-app-qr` o la decisión pública de `verifier-web`.

- No incluye la fila ni el tiempo de abrir el portal en el teléfono antes de llegar.
  Este último se anota aparte, como dato descriptivo, porque es un costo real del
  sistema nuevo.
- El observador cronometra con un cronómetro de teléfono y anota en la planilla:
  código, fecha, brazo, segundos (con décimas) y si hubo un reintento.
- Un registro con reintento cuenta con su tiempo total, hasta el resultado final.
- **Tamaño:** al menos 3 registros por participante en cada brazo, en días distintos.
  Para el análisis se usa el promedio por participante.
- **Dato del sistema:** en el postest, los milisegundos de validación de
  `verifier-service` (lado servidor) se reportan aparte y no reemplazan el cronómetro.

**Análisis.**

- Estadística descriptiva por brazo: media, mediana, desviación estándar, p95 y
  diagrama de caja.
- **Prueba T pareada** sobre los promedios por participante (pretest frente a postest),
  α = 0,05, tal como pide la propuesta. Antes se prueba la normalidad de las diferencias
  con Shapiro–Wilk. Si no son normales, se reporta además Wilcoxon de rangos con signo,
  y se dice cuál sostiene la conclusión.
- **Reducción** = 1 − (media del postest ÷ media del pretest). H2 se cumple si es
  ≥ 40 % y la prueba es significativa.

## 6. Intentos controlados de suplantación (H1)

**Reglas:**

- Solo los hacen participantes que firmaron el consentimiento específico.
- Siempre con la credencial de **otro participante que también consintió**, nunca de
  terceros.
- Siempre bajo la vista del observador y fuera de horas pico.
- Cada intento queda anotado, aunque falle de forma evidente.

El operador del punto de control **no sabe** cuáles registros son intentos: actúa como en
un día normal. Lo que se mide es el sistema más su operación real, que es lo que el
sistema tradicional ofrece.

**Casos** (identificadores de ADR-0019, punto 3):

| Caso | Pretest (`baseline-o3`) | Postest (SecureQR-ID) |
|---|---|---|
| F | QR impreso con el texto de un carné con nombre y documento inventados | QR impreso con un token SQRID/1 alterado, generado por la batería de `evaluation/` |
| P | Foto del QR del carné de otro participante, presentada después de que él ya se registró | Captura del QR de otro participante presentada **después** de que él lo usó, o pasados sus 60 s |
| V | Carné de un participante marcado como retirado en la planilla (la línea base no tiene revocación) | QR válido de un participante cuya credencial revocó el custodio para el estudio y que luego se reactiva |

- **Tamaño:** 20 intentos por caso y por brazo (60 por brazo), repartidos entre los
  participantes que aceptaron.
- **Planilla de intentos:** código del intento, fecha y hora, brazo, caso, código del
  participante que presenta, código del participante suplantado y resultado
  (**aceptado** o **rechazado**). En el postest se agrega el motivo interno del registro
  de `verifier-service`.

**Qué no se intenta en campo.** La captura del QR presentada **antes** que el titular,
dentro de sus 60 s, se acepta por diseño (THREAT-MODEL, «Captura del QR en la pantalla
del titular»). No forma parte de la tasa y se reporta como riesgo residual, igual que
en la batería. En campo tampoco se hacen los casos R y M: se miden en el laboratorio
(ADR-0019).

**Análisis.**

- **Tasa de éxito de suplantación** por brazo = aceptados ÷ intentos, por caso y global,
  con intervalo de Wilson al 95 %. La tasa de detección es su complemento.
- **Reducción** = 1 − (tasa del postest ÷ tasa del pretest). H1 se cumple si es ≥ 30 %.
- Comparación de las dos proporciones con la **prueba exacta de Fisher** (α = 0,05).
- Si el pretest no tiene ningún éxito, la reducción no se puede calcular. Pasa, por
  ejemplo, si el operador detecta todo a ojo. En ese caso se reportan las dos tasas y se
  declara que la línea base no sirvió para medir H1.

## 7. Integridad verificable de los registros

Al cierre del postest, sobre la bitácora del punto de control:

1. `verify_chain()` sobre la bitácora completa (CLI de `evidence-log`).
2. `anchor verificar` de una muestra de eventos del periodo contra las raíces ancladas
   en Fabric: al menos 30 eventos elegidos al azar, con la semilla anotada.
3. El estado del sellado en OpenTimestamps del último bloque del canal.
4. `GET /api/titulares/integridad` de `mi-app-qr`, para el historial `cid` → titular.

Cada resultado se guarda con su fecha y su salida completa, y va al anexo del documento
de grado junto al artefacto de la batería (#156).

## 8. Aceptación y retroalimentación

Al terminar el postest, cada participante responde una encuesta corta en escala Likert
de 5 puntos. Las preguntas cubren facilidad de uso, rapidez percibida, confianza en el
sistema y disposición a seguir usándolo, más una pregunta abierta.

- **Aceptación** = porcentaje de participantes con promedio ≥ 4. La propuesta pide
  ≥ 85 % para la evaluación final (Fase 5); en el piloto se reporta como línea de
  partida.
- **Entrevistas de retroalimentación:** 5 a 8 participantes y el operador del punto de
  control, con notas y sin grabación. Las respuestas abiertas se resumen por tema, sin
  citas que identifiquen a alguien.

## 9. Registro de desvíos

| Fecha | Qué pasó | Efecto en los datos | Quién lo anota |
|---|---|---|---|

## 10. Cierre

En este orden:

1. Se exportan las planillas de tiempos, intentos y encuestas, solo con códigos.
2. Se ejecuta la integridad (§7) y se guarda su salida.
3. Se anonimiza `mi-app-qr` y se destruyen los respaldos
   (`docs/INSTALACION-CCAV.md`, §11).
4. Se destruye la tabla código → persona.
5. Se anota en `docs/STATE.md` qué se cerró y cuándo.

Los datos que van al documento de grado y al repositorio son solo los agregados y las
planillas con códigos.
