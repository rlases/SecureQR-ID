# Estado del proyecto

> **Este archivo se actualiza al cierre de cada sesión de trabajo.** Es el handoff real
> entre sesiones y entre los dos autores. Si solo mantienes un documento al día, que sea
> este.

**Última actualización:** 2026-10-25
**Fase actual:** Fase 3 de `ROADMAP.md` (desarrollo tecnológico) en curso — la Fase 2
(diseño) ya cumple sus tres criterios de cierre: ADR-0005 aceptada, ADR-0007 aceptada,
`SQRID-1.md` dejó de ser borrador (ADR-0010) y el número de objetivos específicos quedó
unificado en tres (issue #4). Nadie ha puesto el tag `v0.1.0` que `ROADMAP.md` pide al
cerrar cada fase — pendiente, decisión conjunta, no depende de código. De los cinco
módulos de Fase 3 (`issuer/`, `verifier/`, `evidence-log/`, `revocation/`, `anchor/`)
sigue pendiente completar el anclaje real de `anchor/` (issue #9). El resumen
vigente de abajo distingue implementación en ramas, integración y pruebas.

---

## Estado vigente — 2026-10-25

### Cierre de la sesión de Jhunier — 2026-10-25

Lo más reciente; prevalece sobre lo que contradiga de las secciones siguientes.

**Integrado en `main` (PR de Duverney revisados y fusionados por Jhunier):**

- #99 (tabla `anclajes`);
- #98 (docs tras ADR-0016/0017);
- #100 (`FabricLedgerClient`);
- #111 (enmienda de ADR-0016, aceptada con el código provisional de 72 h);
- #116 (sellado en OpenTimestamps; #94 sigue abierto);
- #117.

**Pila de Jhunier (#102–#108 y #115):**

- **`main` propagado** por toda la cadena con merges, sin force-push ni conflictos. Los ocho PR tienen el CI en verde (10/10).
- **#115 sale de borrador.** Se fusiona **justo después de #108**, como último eslabón. Se decidió no repartirlo en los PR de origen.
- **Qué reúne #115:**
  - los P2 de Codex sobre la caché entre sesiones (#103 y #105);
  - el `cid` en `cambios_configuracion` (#106);
  - el NUL en el chequeo SQL del `cid` (#108);
  - **el P1 de #102.** La cadena `asignaciones_cid` pasa a HMAC-SHA256 con `ASIGNACIONES_KEY` fuera de la base. Queda registrado como enmienda de 2026-10-25 a ADR-0016, propuesta hasta que Duverney apruebe #115, y en `THREAT-MODEL.md` con su riesgo residual.
- **Clave nueva:**
  - Electron la genera en `server-secrets.json`;
  - fuera de Electron va en `.env`;
  - el servidor no arranca sin ella.
- **Falla intermitente de `reseteo.test.ts`:** venía de una BD de prueba residual. Corregida con un directorio temporal por prueba. Servidor 189/189 y cliente 102/102.
- **Hilos de Codex** de #102, #103, #105, #106 y #108: respondidos y resueltos.

**#114 (acuerdo de diseño de #55):**

- Jhunier confirmó por escrito las cinco propuestas de Duverney, incluido el criterio de contraste.
- La tabla de `DESIGN-SYSTEM.md` quedó con los enlaces; `main` fue fusionado en la rama.
- La adopción en cada app es trabajo nuevo, y se reparte en partes iguales: tokens `--success`/`--warning`, `.primary-button` sobre `--teal-700`, pesos tipográficos y retirar `darkMode`.

**Revisión de Duverney sobre la pila.**

- Duverney ya aprobó **#102–#108 sobre sus cabezas actuales**. Las aprobaciones de #103, #105, #106 y #108 están condicionadas a fusionar #115 con ellos.
- Sus observaciones no bloqueantes de #103 están corregidas en #115 (ba11759):
  - solo `SQLITE_CONSTRAINT_UNIQUE` se traduce a «ya existe»;
  - `borrarEstamento` registra las excepciones y los dominios que arrastra en cascada.

**Issues nuevos**, salidos de esas observaciones. Son dos piezas, una para cada uno:

- **#119**, comprometer la cabeza de `asignaciones_cid` en la bitácora anclada: Jhunier, porque es su módulo y su enmienda.
- **#120**, límite por IP en el alta del portal: Duverney.

**Quedan anotadas:**

- La zona horaria de `puedeEmitir`/`dentroDeHorario` debe ser la misma `SITE_TIME_ZONE` del reseteo. Duverney la pasa en #85.
- Antes del cierre del piloto hay que decidir si se limpia el texto libre de `cambios_configuracion.motivo` o si se mantiene el aviso en la interfaz.

**Le toca a Duverney:**

1. **Fusionar la pila en orden:** #102 → #103 → … → #108 → #115. Al fusionar cada PR, reorientar el siguiente a `main`. A #115 aún le falta su revisión: atención especial a la enmienda HMAC del ADR-0016.
2. **Volver a aprobar y fusionar #114.** El push que registró el acuerdo descartó su aprobación.
3. #120 y los pendientes propios de abajo: #82, #93, #94, y #85/#109 cuando entre la pila.

**Le toca a Jhunier:**

- Atender lo que salga de la revisión de #115.
- #119.

### Cierre de la sesión de Duverney — 2026-10-24 (tarde, hora de Colombia)

**Integrado hoy en `main`:** #74 (ADR-0013 a 0015), #77 (ADR-0017, aceptada), #112
(`baseline-o3` fijada) y #110 (este handoff), además de #113 (arreglo Unicode de
`verifier_id` en `anchor/`). Todos con squash, CI verde y aprobación cruzada.

**Abiertos y a quién le toca (revisión cruzada: Jhunier revisa los de Duverney):**

| PR | Autor | Estado | Falta |
|---|---|---|---|
| #99 evidence-log: tabla `anclajes` y lotes | Duverney | Aprobado por Jhunier, rama al día | Que Jhunier lo fusione (si se descartó su aprobación por actualizar la rama, volver a aprobar) |
| #98 CLAUDE.md, ARCHITECTURE.md, THREAT-MODEL.md tras ADR-0016/0017 | Duverney | Aprobado, fuera de borrador | Ídem |
| #100 anchor: `FabricLedgerClient` | Duverney | 10/10 chequeos del CI | Que Jhunier levante su solicitud de cambios |
| #111 enmienda de ADR-0016 (altas en revisión, #109) | Duverney | Fuera de borrador, base `main`, conflicto resuelto | Aprobación de Jhunier; con ella queda aceptado el código provisional de 72 h |
| #116 sellado en OpenTimestamps (#94) | Duverney | Apilado sobre #99 (base `modulo/92-tabla-anclajes`) | Reorientar a `main` cuando se fusione #99; revisión de Jhunier |
| #114 acuerdo de diseño (#55) | Jhunier | Revisión de Duverney publicada (COMMENT) con cinco propuestas y hallazgo de contraste | Que Jhunier confirme o discuta cada fila; #55 cierra cuando ambos las registren |
| #115 correcciones sobre #108 (borrador) | Jhunier | Borrador | Distribuir a #103, #105, #106 y #108 (ver sección de cierre de Jhunier) |
| #102–#108 mi-app-qr (ADR-0016) | Jhunier | Borradores o en corrección | Corregir #104, #105, #108; después revisión de Duverney |

**Pendiente propio de Duverney:**
- **#82 y #93 (red Fabric 2.5 en Docker, contrato en Go, CI de integración): hay que hacerlos
  en la máquina de Duverney, con Docker y acceso a módulos de Go.** El entorno en la nube
  donde se trabajó bloquea `proxy.golang.org`.
- **#94:** la parte de Python está en #116. Falta el comando de `anchor/` que consulta
  `GetChainInfo` de `qscc` (depende de #100), la verificación manual de un sello real con
  un nodo de Bitcoin podado y comprobar desde el servidor del CCAV que los calendarios
  públicos responden. #116 no debe cerrar #94 por sí solo.
- **#85 y #109:** bloqueados hasta que se fusionen #79, #83 y #89 (pila de Jhunier) y
  #111 sea aceptado. #109 se implementa conforme a la enmienda de ADR-0016 (rechazar =
  anonimizar; reemplazar = titular `reemplazado`, credencial por motivo, dispositivo
  `revocado`, titular nuevo con código provisional visible una vez, entrega presencial,
  72 h regenerable; auditoría en `cambios_configuracion` con lista cerrada de motivos).
- Revisión cruzada de #102–#108 cuando Jhunier distribuya #115.
- Reparto de trabajo nuevo: partes iguales entre los dos (`CLAUDE.md`); el desbalance
  acumulado solo desempata lo indivisible.

**Para retomar desde Claude Code en la máquina local:**
- Abrir el repositorio con `CLAUDE.md` y leer este archivo; no hace falta nada más.
- `gh` local sí permite GraphQL; en la sesión en la nube estaba bloqueado y se usó REST
  (`gh api repos/rlases/secureqr-id/...`).
- Al actualizar la rama de un PR con `main` GitHub descarta las aprobaciones (regla de
  rama): avisar al revisor antes de hacerlo, o reaprobar enseguida.
- Los squash merges dejan conflictos en ramas apiladas (`DECISIONS.md`, `STATE.md`):
  fusionar `main` en la rama apilada y conservar ambos lados; no se hace force-push.
- Laboratorio local para probar el verificador completo (claves, lista de revocación,
  emisión de QR, portal en :5174): `laboratorio.py` (`preparar`, `iniciar`, `emitir`,
  `revocar`). Contiene claves privadas: **no va a Git**. Con TTL de 120 s el QR vence
  pronto; subir `_TTL_SEGUNDOS` en `laboratorio/entorno.json` para pruebas manuales.
  Conviene reemplazarlo por la CLI de #96 y #97 (revocación firmada y servicio local del
  emisor), ya fusionadas, y documentarlo en `docs/DEPLOY.md` (issue por abrir).
- Instalación: cada módulo Python tiene su propio entorno virtual (ver `CLAUDE.md`);
  `verifier-service` compone los demás para el arranque real.

### Cierre solicitado por el usuario: pendientes para retomar

**No integrar #102–#108 todavía:** las nuevas revisiones automáticas detectaron
hallazgos adicionales. Las correcciones están guardadas en el borrador
[#115](https://github.com/rlases/SecureQR-ID/pull/115), rama
`fix/90-privacidad-sesion-auditoria`, commit
`367c1fd36d788e6ca13516db8117ecec71653b46`, **sobre #108**. Los PR
originales siguen sin esos arreglos: marcarse listos para revisión no equivale a
estar aprobados ni a tener resueltos los nuevos hallazgos.

**Ya guardado y verificado localmente:**
- Caché de consultas/mutaciones eliminada al iniciar/cerrar sesión, con cancelación
  de consultas pendientes; rutas admin protegidas por rol antes de montar su contenido.
  Recorrido real admin → logout → operador → historial probado en estamentos y consultas.
- Revocación/reactivación no guardan cid en el historial público de configuración.
  Las filas antiguas se proyectan sin ese campo, sin editar el almacenamiento append-only.
- El predicado SQL de cid canónico rechaza NUL; cierre y vencimiento limpian el
  sufijo personal del valor mal formado conservando autor, fecha y atribución.
- **Cliente: 102/102 y build correcto. Servidor: build correcto y 27/27 en las
  suites específicas de revocación/anonimización. Suite completa: 185/186.**
  Falló `test/reseteo.test.ts > trimestre local > usa la fecha de la sede, no la UTC`
  con «Ya existe un estamento con ese nombre», desde `crearEstamento` en el fixture.
  No se determinó la causa ni se declara validación global completa.
- Los fallos de acceso/caché, exposición de cid y NUL se reprodujeron antes de los arreglos.

**Orden concreto para retomar (detenido aquí por solicitud del usuario):**
1. Investigar el fallo de reseteo/aislamiento de fixtures y completar la suite del
   servidor; revisar el CI de #115 y de los PR originales tras ready_for_review.
2. Distribuir #115: AuthContext/RequireAuth, wrappers de pruebas y sesión/estamentos
   a #103; guardia y prueba de consultas a #105; proyección del historial,
   revocación/reactivación y guardia de titulares a #106; NUL y sus pruebas a #108.
3. Propagar las bases corregidas por #104–#108 sin force-push, preservando los
   cambios particulares de App.tsx en cada rama y los diff por tarea.
4. Revalidar CI en los heads resultantes y obtener revisión cruzada de Duverney.
   Resolver los hilos originales solo tras comprobar la corrección en esos PR.
   Después, cerrar/integrar el borrador #115 según cómo se hayan distribuido sus cambios.
5. Integrar #77 (ya aprobado), revisar #110/#112/#113/#114 y continuar en orden
   #102 → #108. #55 conserva el acuerdo explícito pendiente y #111 no está aceptado.

**#55 ya tiene redacción actualizada en #114**, solo documentación, con CI completo
correcto ([40145927978](https://github.com/rlases/SecureQR-ID/actions/runs/40145927978)).
Duverney tiene solicitada la revisión explícita. No se cambió la apariencia.

No se reasignaron issues ni se fusionaron PR. Fabric real, instalación Windows,
piloto, #82/#85/#93/#94/#109 y los acuerdos conjuntos conservan sus pendientes.



Este resumen sustituye, para planificar el trabajo siguiente, los pendientes del corte
2026-10-12 que se conservan más abajo como historial. Comprobado contra GitHub al
retomar la sesión interrumpida de Claude. Las verificaciones y correcciones posteriores
quedan recogidas en las secciones fechadas de este resumen.

### Integrado en `main` desde el corte anterior

- PR #74: ADR-0013, ADR-0014 y ADR-0015 ya aceptadas en `main`.
- PR #76: texto de ADR-0016, todavía como **Propuesta** en `main`.
- PR #75: vinculabilidad del `cid` documentada en el modelo de amenazas.
- PR #63, #71 y #72: guía de contenido, accesibilidad y catálogo de componentes.
  #71/#72 ya están fusionados; las referencias antiguas a sus borradores no son
  pendientes actuales. Aplicar los estándares en las pantallas y verificar los
  flujos del piloto sigue siendo trabajo distinto.
- PR #66: corrección del `cid` con guion inicial; PR #101 (issue #80):
  documentación de `--cid=<cid>`.
- PR #96 (issue #81): CLI para crear la clave de revocación y firmar listas.
- PR #97 (issue #83): servicio local de emisión en `127.0.0.1`, autenticado con
  secreto compartido. No equivale a tener conectado el portal del titular (#85).

### Decisiones y línea base

- **PR #77 abierto:** su commit `4ea53a8` propone pasar ADR-0016 y ADR-0017 a
  **Aceptada (2026-10-24)**. Eso aún no está integrado en `main`; no dar las ADR
  por formalmente aceptadas allí. **Duverney aprobó el commit actual el 24-10 a las
  23:29 UTC**; la aceptación conjunta ya está revisada y falta integrarla. La última ejecución de CI de ese commit terminó
  correctamente ([ejecución 40137408598](https://github.com/rlases/SecureQR-ID/actions/runs/40137408598)).
- El ajuste del lote fijo ya está propuesto en #77: registrar el rango en `lotes`
  antes de exportarlo y reutilizarlo hasta obtener recibo, aunque lleguen eventos
  nuevos; incluir `verifier_id` en `loteId`.
- **Issue #78 (Jhunier):** `baseline-o3` ya está fijada en
  `1b4498af0d2a76ceeadce0a114c40d9d758c7aab`, anterior a los cambios de
  ADR-0016 en `mi-app-qr/`. Ver el procedimiento y su ejecución en #112 y la nota
  de verificación de abajo. Falta revisión e integración documental, no crear otra etiqueta.

### Siete PR de `mi-app-qr` guardados, pendientes de revisión

Los siete son de Jhunier (`rlases`), siguen abiertos y **listos para revisión**
(desde el 24-10, tras verificar el CI de sus commits actuales). Se solicitó la revisión
cruzada a `Duverney24`. Están encadenados para que cada diff muestre solo su tarea;
no son siete cambios ya integrados en `main`.

| Orden | Issue | PR | Cambio | Rama base actual |
|---|---|---|---|---|
| 1 | #79 | [#102](https://github.com/rlases/SecureQR-ID/pull/102) | Tablas de titulares, credenciales, dispositivos e historial encadenado | `main` |
| 2 | #89 | [#103](https://github.com/rlases/SecureQR-ID/pull/103) | Estamentos, horarios, excepciones y dominios | `modulo/79-tablas-titulares` |
| 3 | #84 | [#104](https://github.com/rlases/SecureQR-ID/pull/104) | Autorregistro, vínculo del teléfono y recuperación | `modulo/89-estamentos-horarios` |
| 4 | #86 | [#105](https://github.com/rlases/SecureQR-ID/pull/105) | Consulta auditada `cid` → persona | `modulo/84-portal-titular` |
| 5 | #87 | [#106](https://github.com/rlases/SecureQR-ID/pull/106) | Revocación, reactivación, desvinculación y exportación | `modulo/86-consulta-cid` |
| 6 | #88 | [#107](https://github.com/rlases/SecureQR-ID/pull/107) | Reseteo trimestral del `cid` | `modulo/87-revocacion` |
| 7 | #90 | [#108](https://github.com/rlases/SecureQR-ID/pull/108) | Anonimización al cierre y conservación configurable | `modulo/88-reseteo-cid` |

**Verificación disponible, con su alcance:**

- #102 tiene CI completo en verde sobre `fcbe422`
  ([ejecución 40137801080](https://github.com/rlases/SecureQR-ID/actions/runs/40137801080)).
- El flujo ya valida las bases de los PR encadenados. Los commits actuales de
  #102–#108 tienen CI completo en verde; la tabla de verificación de abajo contiene
  los siete commits y sus ejecuciones. Las referencias a ausencia de CI del corte
  de revisión inicial se conservan solo como historia de ese hallazgo.
- La descripción de #108 reporta **172 pruebas del servidor, 97 del cliente y build
  del cliente correcto** sobre la rama final `modulo/90-anonimizacion`
  (`79fb158`). Eran resultados locales reportados por Claude; la revisión técnica de abajo
  detalla la ejecución independiente posterior y su limitación de entorno.
- Límite documentado en #108: los motivos de `cambios_configuracion` se conservan.
  La interfaz pide no escribir datos personales allí, pero no los elimina si se
  introducen. Revisar esa limitación antes de afirmar anonimización completa de
  cualquier dato personal que pudiera haberse escrito en texto libre.
- No se verificaron en esta reanudación el instalador Windows, el piloto en el CCAV
  ni el flujo completo con Fabric real.

**Orden para integrar:** cerrar la aceptación de #77; #78 ya tiene etiqueta fijada. Luego revisión
cruzada de Duverney e integración secuencial #102 → #103 → #104 → #105 → #106 →
#107 → #108. Tras cada squash, actualizar la base y reconciliar la rama siguiente
con `main`, conservando lo ya integrado; ejecutar el CI sobre el resultado real
antes de fusionar. Un CI correcto del primer PR no valida los seis siguientes.

### Issue faltante y trabajo restante

- [#109](https://github.com/rlases/SecureQR-ID/issues/109), **resolver altas en revisión
  por documento repetido**, ya fue creado por Claude antes de la interrupción.
  Está asignado a **Duverney**, con las mismas etiquetas que #84 (`enhancement`,
  `mi-app-qr`) y milestone 2. No crearlo otra vez ni reasignarlo por conveniencia:
  es el issue impar que corresponde a quien tiene menos carga acumulada.
  Falta decidir el rechazo o reemplazo y la entrega del código de recuperación;
  registrar primero una enmienda si se cambia el diseño, y probar ambas salidas
  con auditoría e integridad del historial. Depende de #102, #104 y #106.
- **#85 (Duverney):** conectar el portal con el servicio de emisión y mostrar el QR
  que se renueva. El servicio #97 ya está integrado, pero los siete PR anteriores no
  implementan esa página. Debe consumir `puedeEmitir`, respetar los horarios y
  limitar la emisión por dispositivo.
- **#98 (Duverney, documentación):** actualización `e6fea06` revisada y aprobada
  técnicamente. Mantener el borrador hasta integrar #77; CI completo correcto.
- **#99 (Duverney, bitácora):** correcciones `710b40b` revisadas y aprobadas;
  72 pruebas y CI completo correcto. Falta integrar después de #77.
- **#100 (Duverney, cliente Fabric):** los problemas anteriores están resueltos,
  pero queda el defecto Unicode reproducido en la nueva revisión. El arreglo
  concreto está en #113 (Jhunier), sobre esta rama, para revisión e integración.
- El anclaje real y su evidencia de operación siguen pendientes: red y contrato
  (#82), integración de CI contra Fabric (#93) y sellado OpenTimestamps (#94).
  No declarar terminado #9 por tener pruebas con un cliente en memoria.

### Trabajo propio: diseño documentado y PR listos para revisión — 2026-10-24

**Issue #55:** redacción actualizada en
[#114](https://github.com/rlases/SecureQR-ID/pull/114), commit `852800f`,
sobre main `1b4498a`. Solo cambia `docs/DESIGN-SYSTEM.md`.

Se verificaron 31 archivos del cliente y del verificador. Se corrigieron las
afirmaciones de que verifier-web no usaba React, ForgottenOutModal estaba muerto
y no existían sombras o movimiento. Se documentaron todos los tokens CSS declarados,
radios, tamaños, foco, breakpoints, fuentes y efectos existentes, con sus fuentes.
Se recalcularon 16 equivalentes HSL/hex y se validaron los 19 enlaces relativos.

La propuesta previa de Vidrio elevado/GSAP se conserva como pendiente. Se retiró
su justificación incorrecta basada en ausencia de React y la estimación de bundle
sin medición. Inter está declarada sin un mecanismo de carga localizado. El
documento incorpora un registro explícito de acuerdos por paleta, estados,
tipografía, modo oscuro y efectos. **#55 sigue abierto y el documento sigue siendo
borrador de estándar** hasta que Jhunier y Duverney acuerden su contenido. No se
modificó la apariencia ni se instalaron dependencias.

**#102–#108 ya no son borradores de PR.** Se verificaron los siete heads y sus CI
correctos, se marcaron listos para revisión y se solicitó a `Duverney24` la
revisión cruzada. Esa transición no cambia código ni equivale a aprobación.
El evento ready_for_review puede crear nuevas ejecuciones de CI sobre los mismos
commits; consultar su resultado antes de integrar. Se conserva la dependencia de
#77, ya aprobado por Duverney, y el orden de integración de la tabla.

### Nueva revisión y compatibilidad del anclaje — 2026-10-24

Se revisaron las actualizaciones de Duverney contra sus commits exactos y se
publicaron las nuevas revisiones:

| PR | Commit revisado | Resultado |
|---|---|---|
| #98 | `e6fea06` | Aprobado el contenido documental; integrar después de #77 |
| #99 | `710b40b` | Aprobado el lado Python: lote fijo, identidad de instalación, raíz y estado resueltos |
| #100 | `7431958` | Cambios solicitados por incompatibilidad Unicode; arreglo disponible en #113 |

**Verificación independiente:** `evidence-log/` 72/72, `verifier/` y
`verifier-service/` 131/131 en conjunto; `anchor/` 53/53 y build correcto
antes del arreglo. La prueba conjunta Python → Node → Python exportó el rango
1–3, cerró/reabrió la bitácora, agregó 4–5 y reexportó el mismo 1–3. La
recuperación del recibo en el ledger en memoria fue idéntica; registrar dos veces
es idempotente, una raíz ajena se rechaza, dos instalaciones no colisionan y
queda pendiente 4–5. No se usó una red Fabric real.

**Defecto y corrección #113:** Python admite hasta 128 puntos de código en
`verifier_id`, pero Node contaba unidades UTF-16: 65 caracteres astrales válidos
se rechazaban y bloqueaban indefinidamente el lote fijado. Node también aceptaba
separadores interiores Zs que Python considera no imprimibles. El PR
[#113](https://github.com/rlases/SecureQR-ID/pull/113), commit `1b1f704`, cuenta
puntos de código y rechaza C/Z salvo el espacio ASCII interior. Añade nueve
regresiones: **62/62 pruebas y build correctos**; el mismo lote Unicode exportado
por Python ahora se acepta. Lleva la corrección de CI de bases apiladas ya usada
en #102–#108, conservando los diez jobs. Su base es #100 y requiere revisión
cruzada de Duverney; no se fusionó ni se aprobó el PR propio.

- CI de #98: [40143591260](https://github.com/rlases/SecureQR-ID/actions/runs/40143591260), correcto.
- CI de #99: [40141774932](https://github.com/rlases/SecureQR-ID/actions/runs/40141774932), correcto.
- CI de #113: [40145404583](https://github.com/rlases/SecureQR-ID/actions/runs/40145404583), **correcto: los diez jobs**.
- Se compararon además los nueve casos Unicode ejecutando directamente los validadores Python y Node: coinciden en todos.

**#77 ya tiene aprobación vigente de Duverney** sobre `4ea53a8`, con CI
correcto. Falta su integración por el otro autor conforme a CONTRIBUTING; no una
nueva aceptación de diseño. `main` permanece en `1b4498a`.

**Pendientes por responsable, comprobados de nuevo en GitHub (9 y 8 issues):**

| Responsable | Trabajo e integración restantes |
|---|---|
| Jhunier (`rlases`) | #79, #89, #84, #86, #87, #88 y #90 implementados en #102–#108; revisión cruzada e integración secuencial. #78 etiqueta ya fijada, revisar #112 y constancia #110. #55 tiene redacción verificada en #114 y requiere acuerdo explícito de tokens. Corrección adicional #113 lista para revisar. |
| Duverney (`Duverney24`) | #95 y #92 aprobados técnicamente en #98/#99, integrar tras #77; #91 integrar/revisar el arreglo #113 y actualizar #100; implementar/completar #82, #85, #93, #94 y #109. Revisar los PR de Jhunier y realizar la integración de #77. |
| Ambos | Acuerdo pendiente sobre #111 (72 horas sigue siendo propuesta), tokens de #55, instalación Windows/piloto y evidencia de Fabric real. |

Las asignaciones no cambiaron. Las aprobaciones antiguas de #110 quedaron
obsoletas con sus actualizaciones; el handoff actualizado necesita revisión.

### Cierre administrativo de la guía de contenido — 2026-10-24

Se cerró #56 como completado tras verificar que el PR #63 está integrado y que
la guía actual declara el acuerdo explícito de Duverney. Ya no es un pendiente de
Jhunier. El inventario resultante es de **9 issues abiertos de rlases y 8 de
Duverney24**; los recuentos de diez incluidos en la revisión inicial son históricos.

### Línea base fijada y CI de la cadena verificado — 2026-10-24

**`baseline-o3` ya existe** y apunta exactamente a
`1b4498af0d2a76ceeadce0a114c40d9d758c7aab`. Es la versión de main anterior al
registro de titulares de ADR-0016: la ruta
`mi-app-qr/server/src/titulares` no existe en ese commit. La referencia remota se
leyó después de crearla para comprobar el destino.

El [PR #112](https://github.com/rlases/SecureQR-ID/pull/112) contiene el procedimiento
idempotente y sus ocho pruebas. El flujo
[40144582787](https://github.com/rlases/SecureQR-ID/actions/runs/40144582787) terminó
correctamente y creó la etiqueta. No sobrescribe una referencia diferente; acepta
etiquetas anotadas, comprueba la pertenencia del commit a main y se detiene ante una
carrera con otro destino. El CI completo del PR también pasó
([40144614643](https://github.com/rlases/SecureQR-ID/actions/runs/40144614643)).
#78 ya no requiere trabajo de creación de etiqueta: queda la revisión e integración
de su procedimiento y de esta constancia documental.

**CI corregido en #102 y propagado hasta #108.** Se retiró el filtro que solo admitía
PR dirigidos a main. Se ejecuta al abrir, actualizar, reabrir o marcar un PR listo,
con permisos de lectura y cancelación de ejecuciones obsoletas de la misma rama/PR.
Se conservaron exactamente los diez trabajos existentes y el evento push de main.
Los siete commits actuales tienen CI completo en verde:

| PR | Commit actual | Ejecución | Resultado |
|---|---|---|---|
| #102 | `1eb3e93` | [40144619493](https://github.com/rlases/SecureQR-ID/actions/runs/40144619493) | Correcto |
| #103 | `bee2420` | [40144621976](https://github.com/rlases/SecureQR-ID/actions/runs/40144621976) | Correcto |
| #104 | `e926816` | [40144624863](https://github.com/rlases/SecureQR-ID/actions/runs/40144624863) | Correcto |
| #105 | `13a18d4` | [40144627778](https://github.com/rlases/SecureQR-ID/actions/runs/40144627778) | Correcto |
| #106 | `a6e6e95` | [40144628713](https://github.com/rlases/SecureQR-ID/actions/runs/40144628713) | Correcto |
| #107 | `8b1ac70` | [40144632168](https://github.com/rlases/SecureQR-ID/actions/runs/40144632168) | Correcto |
| #108 | `8c98c2a` | [40144634248](https://github.com/rlases/SecureQR-ID/actions/runs/40144634248) | Correcto |

En la ejecución final de #108 se comprobó también el log del servidor:
**19 archivos y 183 pruebas aprobadas**. El cliente, el verificador web con E2E y los
módulos Python/anchor completaron sus trabajos. Esto acredita la ejecución de las
suites de CI; no sustituye la integración con una red Fabric real, la instalación
Windows ni el piloto.

**Novedad de Duverney:** abrió #111, enmienda en borrador a ADR-0016 para resolver
#109. Se revisó y se dejó comentario técnico: concretar la vigencia del código
provisional (72 horas sigue siendo propuesta), reutilizar el canje atómico y las
cuotas de #104, rechazar decisiones repetidas, conservar id/ref y claves foráneas
durante la migración y comprobar la anonimización de reemplazados/rechazados.
La vigencia requiere acuerdo de los autores; no se formalizó su aceptación.

**Siguiente paso (actualizado):** revisión cruzada de los PR corregidos, #112 y
#113; integración de #77, ya aprobado por Duverney, y acuerdo de #111.
#98/#99 ya están aprobados técnicamente; #100 espera el arreglo Unicode de #113.
Los frentes de Duverney #82, #85, #93, #94 y #109 conservan su asignación. La creación de la línea
base y la ejecución del CI de los siete PR ya quedaron verificadas.

### Correcciones implementadas — 2026-10-24

Los hallazgos de Jhunier descritos en la revisión inicial de abajo ya tienen
corrección y pruebas de regresión en sus ramas. Siguen pendientes de revisión
cruzada; los issues no se dan por cerrados antes de la integración.

| PR | Commit del arreglo | Corrección |
|---|---|---|
| #104 | `cd4865f` | Consumo condicional y único del código; reserva atómica de cuota por documento e IP antes de bcrypt |
| #105 | `a33ff3f` | Consulta desde la asignación comprometida; detección de incoherencias/cadena rota y auditoría del intento sin datos ni atribución |
| #106 | `7bd8c00` | Hereda las correcciones sin alterar el alcance de revocación |
| #107 | `b9230e0` | Hereda las correcciones sin alterar el alcance del reseteo |
| #108 | `d38b75e` | Limpieza de motivos de correcciones y texto de cid inválido, al cierre y por vencimiento, preservando cid canónicos y metadatos |

Las ramas descendientes incorporan a su base corregida como padre adicional; se
conservó el historial existente y los diff de #105–#108 siguen mostrando su propia
tarea, sin duplicar las correcciones heredadas.

**Verificación final:** compilación del servidor correcta y **183/183 pruebas**
en la rama acumulada #108, incluidas once pruebas nuevas. Se comprobó que los
archivos publicados coinciden, por hash de blob, con los once archivos locales
verificados. Los fixtures de portal, consultas y anonimización usan directorios
temporales propios. La prueba de CLI usa el mismo Node con `--import tsx` y
ejecuta el módulo real sin depender del socket IPC de la CLI de tsx; también pasó.

La anonimización de correcciones conserva un motivo no nulo («Anonimizado») y el
enlace al registro anterior. En consultas solo se puede reemplazar un cid
**no canónico** por `anon-<id de consulta>`; autor, fecha, atribución y cid
canónicos permanecen protegidos. Se mantiene el límite ya documentado de los
motivos de `cambios_configuracion`, que siguen conservados y no deben incluir
datos personales.

**Lo siguiente para Jhunier:** obtener revisión cruzada de estos arreglos,
completar la revisión documental de #78 y acordar #55. Los arreglos de Duverney
ya se revalidaron; #98/#99 están aprobados y #100 requiere #113. La integración conserva sus dependencias (#77 y línea
base); el CI de PR con base distinta de main quedó corregido y verificado más arriba.

**Lo siguiente para Duverney:** integrar #77 (su aprobación ya está vigente),
revisar las ramas corregidas de Jhunier y #112/#113, incorporar #113 a #100 e
integrar #98/#99 tras #77; continuar #82, #85, #93, #94 y #109. El detalle del reparto
permanece más abajo. No se alteraron asignaciones ni se incorporaron cambios
visuales.

### Revisión técnica inicial — 2026-10-24

Se revisaron los once PR de arquitectura, documentación e implementación (#77,
#98–#100 y #102–#108) contra sus commits actuales, además de corregir este handoff.
Se publicaron revisiones en GitHub. No se fusionaron PR ni se modificó código de la
aplicación. Los comentarios publicados desde `rlases` sobre sus propios PR no
sustituyen la revisión cruzada de Duverney.

| PR | Autor | Resultado y siguiente acción |
|---|---|---|
| #77 | Jhunier | Sin hallazgo nuevo de diseño en el diff; Duverney debe revisar la versión actual y formalizar el acuerdo |
| #98 | Duverney | Cambios solicitados: sellar el bloque del canal, incorporar lote fijo/alerta y reconciliar ADR-0015 ya aceptada |
| #99 | Duverney | Siguen los cambios solicitados sobre lote fijo e identidad de instalación; hallazgo adicional: acepta recibos con raíz ajena al lote |
| #100 | Duverney | Sigue el cambio solicitado: aceptar/validar loteId con prefijo de instalación; el formato de ADR-0017 hoy se rechaza |
| #102 | Jhunier | Sin hallazgo nuevo en el diff; pendiente #77, #78, revisión cruzada e integración |
| #103 | Jhunier | Sin hallazgo bloqueante nuevo en el diff; pendiente revisión cruzada y CI al integrar |
| #104 | Jhunier | Corregido en cd4865f; pendiente revisión cruzada |
| #105 | Jhunier | Corregido en a33ff3f; pendiente revisión cruzada |
| #106 | Jhunier | Sin hallazgo bloqueante nuevo en el diff; el consumo efectivo de puedeEmitir sigue en #85 |
| #107 | Jhunier | Sin hallazgo bloqueante nuevo en el diff; pendiente revisión cruzada y CI al integrar |
| #108 | Jhunier | Corregido en d38b75e; pendiente revisión cruzada |

**Reproducciones confirmadas con datos sintéticos, sin servicios del piloto:**

- #104: dos recuperaciones simultáneas con un mismo código devolvieron 200/200 y
  códigos nuevos distintos. Ocho fallos simultáneos para un documento superaron el
  máximo de cinco: ocho 401 y ocho fallos registrados.
- #105: tras retirar el trigger y cambiar la relación de una credencial de Alfa a
  Beta, la consulta devolvió Beta mientras `verifyAsignaciones` seguía siendo
  verdadera. La cadena intacta comprometía a Alfa, pero no se usaba para atribuir.
- #108: el motivo de una corrección conservó nombre, documento y correo tras el
  cierre. Una consulta de `alfa@ejemplo.test` como cid inválido también conservó
  ese texto. Estos campos son adicionales al límite conocido de
  `cambios_configuracion`.
- #99: agregar un evento entre exportación y reintento cambió
  `seq-000001-000001` por `seq-000001-000002`; dos instalaciones produjeron el
  mismo primer identificador. Un recibo con raíz sintética ajena se aceptó y dejó
  cero eventos pendientes.
- #100: el parser rechazó `ccav-portal-1:seq-000001-000001`, formato previsto por
  ADR-0017.

**Pruebas ejecutadas independientemente:**

| Componente | Resultado |
|---|---|
| mi-app-qr/client, rama acumulada #108 | 97/97 y build correcto |
| mi-app-qr/server, rama acumulada #108 | Build correcto; 171/172 pruebas pasan |
| anchor, commit de #100 | 45/45 y build correcto |
| evidence-log, commit de #99 | 43/43 |
| verifier con evidence-log de #99 | 83/83 |
| verifier-service con evidence-log de #99 | 48/48 |

La prueba restante del servidor invoca `npx tsx`, cuyo socket IPC
`/tmp/tsx-*` recibe EPERM en este entorno; no se clasificó como fallo de la
aplicación. La CLI compilada se comprobó aparte con Node 22 y base sintética:
sin confirmación devolvió 1 y con la frase devolvió 0 y anonimizó. No se afirma
172/172 en esta sesión. No se probó la red Fabric real, Windows ni el piloto.

**Pendientes de Jhunier (`rlases`):**

1. Obtener revisión cruzada de las correcciones de #104/#84, #105/#86 y #108/#90,
   ya implementadas, probadas y propagadas por la cadena de ramas.
2. Crear `baseline-o3` (#78) sobre el commit apropiado antes de integrar #102.
3. Cerrar el acuerdo de diseño #55 con Duverney: el archivo de diseño sigue como
   borrador y no autoriza implementar unilateralmente sus propuestas.
4. Cerrar administrativamente #56: la guía actual ya dice que está acordada con
   Duverney y el PR #63 está integrado.
5. Revalidar los arreglos de Duverney en #98–#100 y completar la integración de los
   siete PR tras revisión cruzada y CI.
6. Este handoff (#110) queda como PR de documentación para revisión, sin merge.

**Pendientes de Duverney (`Duverney24`):**

1. Corregir #99/#92 (lote fijo, identidad de instalación, validación de raíz y archivo
   de estado), #100/#91 (formato compartido) y #98/#95 (documentación final).
2. Revisar la aceptación de #77 y los siete PR de Jhunier, incluidos sus arreglos.
3. Desarrollar #82: red Fabric y contrato en Go, con persistencia tras reinicio.
4. Desarrollar #85: cliente del emisor y QR renovable, usando puedeEmitir y límite por
   dispositivo; el servicio local #97 ya existe.
5. Desarrollar #93: integración contra Fabric en CI y evidencia de ejecución real.
6. Desarrollar #94: sellado del bloque del canal, reintentos/comprobantes y verificación
   independiente de OpenTimestamps.
7. Desarrollar #109: resolución auditada de altas duplicadas, con la decisión de
   rechazo/reemplazo y entrega del código definida antes de implementar.
8. Acordar con Jhunier los puntos abiertos de #55.

El inventario abierto comprobado es de **10 issues para rlases y 8 para Duverney24**.
Esto no significa diez y ocho desarrollos sin empezar: incluye siete implementaciones
de Jhunier en PR, tres entregas de Duverney en PR y el cierre administrativo de #56.
Se mantienen las asignaciones actuales; los arreglos corresponden al trabajo ya
asignado, no se creó un lote nuevo.

**Integración y piloto, responsabilidad conjunta:** tras corregir los hallazgos,
aceptar #77, fijar #78 e integrar secuencialmente #102–#108 con CI sobre cada resultado
real. Después comprobar el recorrido portal → emisión → verificación → bitácora →
Fabric → sello y el instalador Windows en el equipo del CCAV. La revisión no acredita
todavía ese recorrido de extremo a extremo.

### Punto exacto de la reanudación

Claude alcanzó a crear #109 y copiar sus etiquetas; dejó sin publicar la actualización
de `docs/STATE.md` (el archivo de `main` y el de la rama final #108 tenían el mismo
blob `64d76e1`, del corte anterior). Esta actualización cierra ese pendiente y deja
separados el trabajo guardado en PR, la evidencia de pruebas y lo que falta revisar.

---

## Corte anterior conservado — 2026-10-12

Se conserva el contenido previo para no perder decisiones ni notas de sesiones.
Sus menciones a pendientes, borradores y reparto reflejan ese corte; para continuar,
usar el estado vigente de arriba.

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
- **`issuer/` implementado en la rama `modulo/5-issuer-ecdsa`:** paquete Python
  independiente para emitir tokens `SQRID/1` con ECDSA P-256/SHA-256, CBOR determinista,
  firmas compactas *low-S*, nonces CSPRNG y claves PKCS#8 cifradas fuera del repositorio.
  ADR-0010 cierra el esquema criptográfico y la codificación. La batería de pytest cubre
  firma, canonicalización, `kid`, unicidad y no exposición de la clave privada; CI tiene
  un job propio. PR #27 fusionado en `main` e issue #5 cerrado.
- **`verifier/` implementado en la rama `modulo/6-verifier-portal`:** paquete Python
  independiente que valida `SQRID/1` en el orden firma → vigencia → nonce → revocación,
  rechaza firmas ECDSA no canónicas y falla cerrado ante claves o dependencias no
  disponibles. ADR-0011 fija un clock skew obligatorio de 0–60 segundos, máximo de
  reloj persistente, replay durable en SQLite y consumo atómico del nonce. La suite usa
  el issuer real y cubre reinicios, concurrencia, revocación y respuestas públicas sin
  datos sensibles; CI tiene un job propio. PR #29 fusionado en `main` e issue #6
  cerrado. Duverney abrió el issue #30 (`verifier-web/`, portal visual de escaneo) como
  seguimiento — hecho, ver más abajo.
- **`mi-app-qr` — corrección de registros (PR #28 fusionado):** un `admin` corrige un
  registro mal capturado insertando una fila nueva que apunta a la que corrige
  (`corrige_registro_id`) con `motivo` obligatorio, nunca sobrescribiendo — consistente
  con la invariante append-only de ADR-0008. `GET /api/registros` solo devuelve la
  punta vigente de cada cadena. Autorización real en `requireAdmin` (servidor); el
  botón "Corregir" en `RegistrosPage` es UX, no seguridad. 48 tests en servidor, 35 en
  cliente, todos en verde.
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
- **`mi-app-qr/server`**: fundación del servidor multiusuario (ADR-0008) — Express +
  TypeScript + SQLite, autenticación con sesión, bloqueo tras intentos fallidos, y
  endpoints de registros protegidos. Probado con Vitest + Supertest.
- **`mi-app-qr/client`**: cliente web walking skeleton — Vite + React + TypeScript,
  Tailwind con el tema claro/índigo aprobado, shadcn/ui, `AuthContext`, `LoginPage`,
  `RequireAuth` + `Sidebar`, `RegistrosPage` (crear y listar con refetch cada 7s).
  Verificado de punta a punta contra el servidor real (login, crear y listar
  registros vía la API, no solo con mocks). Ampliado desde entonces con Dashboard,
  Informes (issue #32, PR #34), la migración de los componentes de dominio del
  prototipo Electron viejo (`EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`,
  `qrParser` — issue #36, PR #39) y el historial de correcciones (issue #38, PR #41
  fusionado): `GET /:id/historial` recorre la cadena vía `corrige_registro_id`, con
  protección real ante ciclos y referencias rotas (probada con casos sintéticos, no solo
  el camino feliz), y un modal de solo lectura accesible a admin y operador — sin
  deshacer ni autocorrección. 62 tests con Vitest + Testing Library.
- **Gestión de usuarios integrada en `main` (PR #25):** endpoints de creación y listado
  restringidos a administradores, `UsuariosPage`, ruta protegida y acceso condicional
  desde el `Sidebar`, con pruebas de servidor y cliente.
- **`verifier-web/` (issue #30, PR #33 fusionado):** portal React/TypeScript aislado de
  `mi-app-qr`, con escaneo por cámara bajo acción explícita, entrada manual protegida,
  estados accesibles y un historial volátil que no conserva tokens. El navegador delega
  toda decisión al adaptador HTTP fail-closed de `verifier/`. ADR-0012 fija la frontera
  navegador/verificador. Vitest y Playwright/axe cubren privacidad, concurrencia, cámara
  y layouts de escritorio, tableta y móvil.
- **Dependencias vulnerables de `mi-app-qr/client` actualizadas (PR #37):** react-router
  6→7, vite 5→8, vitest 2→4 — saltos de versión mayor, verificados uno por uno contra el
  uso real del cliente (solo APIs declarativas de react-router, ninguna de las que
  cambiaron en v7). 0 vulnerabilidades tras la actualización.
- **Migración de componentes de dominio a TypeScript (issue #36→PR #39):**
  `EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`, `qrParser` portados del
  prototipo Electron viejo. La primera versión conservaba el esquema de datos del
  prototipo (`record.Entrada`/`Rol`/`Nombre` en mayúsculas, tipado `any`) en vez del
  tipo `Registro` real — corregido tras revisión. El cableado del issue #48 está
  implementado en la rama `fix/48-integrar-componentes-registros`, pendiente de revisión
  cruzada y merge; ver "En curso" y la nota de sesión 2026-09-26.
- **Electron arranca el servidor real (ADR-0008 cerrado en su forma mínima):**
  `mi-app-qr/server` ahora sirve el build de `mi-app-qr/client` (fallback SPA), y
  `main.js` arranca ese servidor como proceso hijo al abrir la app, genera y
  persiste `SESSION_SECRET` + credenciales de admin en `userData` (primer
  arranque muestra un diálogo con la contraseña generada), y carga
  `http://localhost:4000` en la ventana — reemplazando por completo el dev
  server de Create React App al que apuntaba antes. Verificado de punta a punta
  con `npm run electron-dev`: login, crear/listar registros, y persistencia
  entre reinicios. Bloqueo real encontrado y resuelto durante la verificación:
  `better-sqlite3` está compilado contra la ABI de Node del sistema, no la que
  empaqueta Electron — se arrancó el servidor con un binario `node` real en vez
  de `process.execPath`, documentado en el propio código. **Limitación
  conocida:** el equipo que actúa como servidor necesita Node.js instalado
  mientras no exista un instalador empaquetado (`electron-builder`, fuera de
  alcance — ver "Implementación").
- **Issue #4 cerrado — número de objetivos específicos unificado en tres.** La
  propuesta de grado (`docs/raw/2026-02-propuesta-grado.md`) y la entrega de Etapa 2
  (`docs/raw/2026-03-etapa-2-requerimientos.md`) ya coincidían en tres; el desajuste
  estaba en entregables posteriores del curso (Fase 4, Etapa 5) que reservaban espacio
  para un cuarto, fuera de este repositorio. Se decidió mantener los tres objetivos
  específicos ya redactados y ajustar esos entregables en consecuencia — no al revés.
  Notas de reconciliación en ambos documentos de `docs/raw/` actualizadas de
  "pendiente" a "resuelto".
- **Sistema de licencia/prueba adaptado al modelo cliente-servidor.** Decisión de
  Jhunier: no se elimina, se adapta. Antes era código muerto — un handler IPC
  (`check-license`) que solo el renderer viejo (`src/App.js`, nunca cargado desde que
  `main.js` sirve `localhost:4000`) invocaba. Pasó a ser una función que bloquea el
  arranque del servidor mismo (`app.whenReady().then(loadConfiguration).then(checkLicense).then(startServer)...`):
  si la licencia está vencida o manipulada, el servidor nunca se levanta y nadie en la
  red institucional puede usar la app, en vez de comprobarse por sesión de un renderer
  que ya nadie carga. Se quitó `checkLicense` de `preload.js` (sin consumidor legítimo
  ya). `src/App.js` sigue con su propia referencia a `window.electronAPI.checkLicense`,
  pero como ese archivo entero ya estaba huérfano (no lo carga ninguna ventana), no
  introduce ningún problema nuevo — es limpieza aparte, no parte de esta decisión.
- **Issue #45 — validación aceptada registrada en `evidence-log/` (PR #68 fusionado).**
  `RecordingVerifier` (en `verifier/`, sin importar `evidence-log/`) envuelve al
  `Verifier` y encadena cada aceptación; si la bitácora falla, rechaza (falla cerrado).
  `EvidenceLog.append_event` pasa a ser atómico con `BEGIN IMMEDIATE` y seguro entre
  hilos: antes, dos aceptaciones concurrentes bifurcaban la cadena (bug reproducido
  contra el código anterior durante la revisión cruzada, confirmando que el fix era
  real). ADR-0013 revisado y verificado por Jhunier con los test suites reales.
- **Issue #46 — arranque de producción con `RevocationList` real (PR #69 fusionado).**
  Nuevo paquete `verifier-service/` que compone verifier, revocation y evidence-log
  desde variables `SQRID_*` obligatorias y falla al arrancar si la lista o la bitácora
  no son confiables. La lista se firma con una clave de revocación dedicada, en un
  directorio de confianza propio. `revocation/` ahora verifica la lista con las reglas
  de un token (low-S, 64 bytes, `kid` ligado, `cids` tipados) — los tres defectos
  reportados (firma *high-S*, `cids` como texto iterado carácter por carácter, `kid`
  sin atar a la clave) verificados y confirmados corregidos. ADR-0014 revisado y
  verificado por Jhunier.
- **Issue #47 — distribución y frescura de la lista de revocación (PR #70 fusionado).**
  `RevocationListCache` con recarga en caliente, antirretroceso por `iat` y rechazo
  (falla cerrado) si la lista supera su antigüedad máxima; CLI `python -m
  secureqr_verifier_service.sync` para traerla por HTTPS con reemplazo atómico. ADR-0015
  revisado y verificado por Jhunier. Operación del piloto acordada el 2026-10-12 (ver
  ADR-0015): Duverney custodia la clave de revocación en el CCAV y refirma a diario,
  con antigüedad máxima de 48 a 72 h y revisión cada 300 s.
- **Issue #48 — integración en `RegistrosPage` (PR #65 fusionado).**
  Se descarta y elimina `client/src/components/EditRecordModal.tsx` junto con sus
  pruebas aisladas; la única corrección sigue siendo `CorregirRegistroModal`, con
  motivo obligatorio y autorización `requireAdmin` en el servidor (ADR-0008).
  `ExportCsvModal` descarga todos los registros vigentes o un rol exacto, reutilizando
  el generador CSV de Informes (escape y protección de fórmulas); `null` identifica
  "todos" para no colisionar con un rol libre llamado `all`.
  `qrParser.parseQrTextData` rellena el formulario desde texto pegado o un lector que
  actúe como teclado; el usuario revisa y envía. No se añade cámara, consulta de URLs
  ni validación criptográfica o de vigencia; el parser HTML no se conecta a una red.
  `ForgottenOutModal` advierte si el último evento vigente del documento es entrada
  (orden por timestamp y luego id, incluidas correcciones), también el mismo día.
  Permite cancelar, confirmar otra entrada, o al admin revisar la entrada anterior
  mediante la corrección existente. No crea automáticamente una nueva entrada tras
  corregir, no convierte una entrada en salida y no inventa fechas de salida.
  El formulario permite registrar explícitamente entrada o salida mediante la API
  actual. El aviso usa el listado consultado (polling de 7s): es una ayuda de UX,
  no una garantía transaccional contra entradas concurrentes desde otros equipos.
  La API actual no admite añadir una salida omitida con fecha histórica; esa
  capacidad y su política de autorización quedan fuera de esta integración.
- **Issues #49 y #51 — empaquetado con `electron-builder` y HTTPS en la red del CCAV
  (PR #67 fusionado).** Ver "Cerrados desde el reparto original" en "Pendiente" para el
  detalle técnico.

## En curso

- Reconciliación de la documentación de investigación (traída del material de trabajo
  individual) con el estado real del código en este repositorio.
- **ADR-0008 — `mi-app-qr` pasa a servidor multiusuario en red.** Requerimiento nuevo:
  al ejecutarse, la app debe levantar un servidor accesible por IP en la red
  institucional, con login para personal (no estudiantes), roles diferenciados y
  generación de informes. Registrado como ADR en estado *Propuesta*; quedan pendientes
  el transporte cifrado y la política de auditoría (el motor de almacenamiento y el
  catálogo de roles ya se resolvieron — ver `DECISIONS.md` y ADR-0009 abajo).
  **Aclaración de foco (2026-08-20):** el cliente multiusuario es principalmente un
  módulo de gestión/verificación/extracción de datos (`Dashboard`, `Informes`,
  `Usuarios`) — no una terminal de registro. Que el personal también pueda registrar
  una entrada desde ahí es una capacidad secundaria que suma (útil para docentes), no
  el objetivo. Esto prioriza `Dashboard`/`Informes` por delante de ampliar
  `RegistrosPage`. Ver `DECISIONS.md` y las amenazas nuevas en `THREAT-MODEL.md`.
- **ADR-0009 — Modelo de roles genérico (permiso fijo + cargo en texto libre).**
  El `UserRole` original (`vigilancia`/`administrativo`/`docente`) estaba hardcodeado al
  vocabulario de la UNAD y nunca fue ratificado como decisión de producto. Se corrigió a
  dos niveles de permiso universales (`admin`/`operador`, con `CHECK` en la base de
  datos) más un campo `cargo` en texto libre, puramente descriptivo, sin efecto en
  autorización — así el proyecto puede usarse en instituciones distintas sin tocar
  código. Aplicado ya en `shared/src/types.ts`, el esquema de `users`, el seed de admin,
  y todos los tests afectados (27 en servidor, 20 en cliente, todos en verde). Principio
  general para todo el diseño en adelante: lo que varía por institución es
  configuración/texto libre, no código.
- **ADR-0007 — gobernanza de la red blockchain, cerrada.** Con la UNAD como único
  operador real (sin otra institución candidata a par independiente en esta fase),
  "definir pares independientes" en Fabric habría sido teatro. Se decidió un anclaje
  híbrido: Fabric se mantiene tal como ya estaba diseñado para la operación local, y
  además `anchor/` sella periódicamente la raíz vigente de la ledger con
  **OpenTimestamps** (Bitcoin, gratuito, sin infraestructura propia) — la pieza que
  responde la objeción real, porque la UNAD no puede alterar retroactivamente lo que ya
  quedó sellado fuera de su control. Desbloquea issue #9 (`anchor/`) — `evidence-log/`
  (#7) ya se fusionó (PR #43), así que ya no lo bloquea ni en la práctica.

## Pendiente

### Bloqueantes

Ninguno por ahora — el único bloqueante que había (issue #4, número de objetivos
específicos) se resolvió el 2026-09-23, ver "Hecho" y nota de sesión.

### Diseño / frontend (nueva iniciativa 2026-09-23)

Objetivo: `mi-app-qr/client` y `verifier-web/` los usa personal institucional no
técnico — hace falta que se vean atractivos y consistentes entre sí, no solo
funcionales. Antes de repartir implementación visual, se documentan los estándares
compartidos, repartidos en partes iguales entre los dos autores (a diferencia del
reparto de módulos, aquí ninguno tiene ventaja de experiencia previa sobre el otro):

- Issue #55 — sistema de diseño: tokens visuales unificados (color, tipografía,
  espaciado, iconografía) → `docs/DESIGN-SYSTEM.md`. Asignado a Jhunier.
- Issue #56 — guía de contenido y microcopy en español (tono, mensajes de error/vacío,
  confirmaciones) → `docs/CONTENT-GUIDE.md`. Asignado a Jhunier.
- Issue #57 — catálogo de componentes UI y patrones de interacción → `docs/COMPONENTS.md`.
  Asignado a Duverney. **Patrones acordados con Jhunier el 2026-10-12** (PR #72):
  estructuras de diálogo y de tabla con filtros aceptadas; D1 montar `Toaster`, D2 unificar
  diálogos en `useModalFocus`, D3 desplazar en tablas de consulta y ocultar columnas en
  tablas de trabajo, D4 crear `ui/select.tsx`, D5 unificar banners de error, D6 mantener
  separados los dos frontends. Sin Storybook por ahora. La implementación queda por
  repartir.
- Issue #58 — guía de accesibilidad WCAG AA para todo el frontend → `docs/ACCESSIBILITY.md`.
  Asignado a Duverney. **Estándar acordado con Jhunier el 2026-10-12** (PR #71): WCAG 2.2
  AA, E7 obligatorio, E14 deseable, Playwright + axe en CI para `mi-app-qr/client` y NVDA
  antes del piloto sobre los flujos con hallazgo Alta/Media. Los arreglos de la auditoría
  quedan por repartir; el más serio es `CorregirRegistroModal` sin gestión de foco.

**Ajuste (2026-09-23, mismo día):** el asignado de cada issue redacta y hace el trabajo
de auditar/levantar el contenido, pero las decisiones de estilo en sí (valores de color,
tono, patrones de componente, qué es obligatorio en accesibilidad) no son suyas en
solitario — mismo patrón que un ADR en `docs/DECISIONS.md`: se propone, se discute entre
los dos autores, y solo entonces se cierra como estándar. Individual la ejecución,
conjunta la decisión. Los 4 issues ya se actualizaron con esta aclaración explícita.

Los cuatro son de documentación pura — ningún cambio de código todavía. La
implementación visual que salga de esto (aplicar el sistema de diseño a cada pantalla)
se reparte después, una vez existan los documentos, para que ambos trabajen sobre el
mismo estándar en vez de que cada uno resuelva lo mismo distinto.

### Implementación

Repartición actualizada 2026-09-23, ajustada el mismo día tras confirmar con Jhunier
que su lista de pendientes propia ya está corta (cerró la enorme mayoría de los PR del
repositorio) — ver nota de sesión más abajo. Los siete issues nuevos/reabiertos quedan
con Duverney; Jhunier no toma issue nuevo esta vuelta:

**Duverney** — su terceto original completo (`evidence-log/` y `revocation/` ya
fusionados hoy, PR #43 y #44) más el cierre de los frentes de `mi-app-qr/` que
estaban pendientes:

- Issue #9 — `anchor/`: Merkle + Hyperledger Fabric + sellado OpenTimestamps (ADR-0007).
- Issue #45 — conectar `evidence-log/` real en `verifier/`. Seguimiento directo de
  PR #43. Implementado en `modulo/45-evidence-log-verifier`, ya fusionado (PR #68);
  ver "Hecho".
- Issue #46 — conectar `RevocationList` real como `revocation_checker` al construir el
  `Verifier` de producción. Seguimiento directo de PR #44. Implementado en
  `modulo/46-revocation-produccion`, ya fusionado (PR #69); ver "Hecho".
- Issue #47 — distribución de la lista de revocación a verificadores con conectividad
  intermitente (decisión de arquitectura abierta en `ARCHITECTURE.md` desde el inicio).
  Implementado en `modulo/47-distribucion-revocacion` con ADR-0015 (aceptada), ya
  fusionado (PR #70); ver "Hecho".

**Cerrados desde el reparto original (2026-09-26):**

- **Issue #48 — cablear los componentes migrados en `RegistrosPage`.** Cerrado por
  Duverney, PR #65 (fusionado): integró `ExportCsvModal`, `ForgottenOutModal` y
  `qrParser`; `EditRecordModal` se descartó a favor del flujo de corrección append-only
  ya existente (`CorregirRegistroModal`, ADR-0008), sin introducir una segunda vía de
  edición en sitio.
- **Issue #49 — empaquetado con `electron-builder`.** Resuelto por Jhunier, PR #67
  (fusionado). Excepción puntual al reparto por equidad — ver nota de sesión.
- **Issue #51 — HTTPS en la red del CCAV.** Resuelto por Jhunier, PR #67 (junto con
  #49, mismo PR — ver nota de sesión) — mecanismo documentado en ADR-0008.

**Jhunier** — issue #50 (decisión de producto sobre el sistema de licencia/prueba en
`main.js`), resuelto por él mismo — ver "Hecho" arriba; y ahora también #49/#51 (ver
nota de sesión 2026-09-26). Todas excepciones puntuales al reparto por equidad de
carga, no lo cambian de fondo: Jhunier sigue sin tomar issues de implementación nuevos
por iniciativa propia esta vuelta. Disponible para revisión cruzada (obligatoria por
`CONTRIBUTING.md` en cada PR que abra Duverney) y para las decisiones conjuntas de
abajo.

**Conjunta** (ninguno de los dos decide solo):

- Decisiones de producto sobre correcciones: que un operador corrija sus propios
  registros; deshacer una corrección. Sin issue todavía — quedan fuera de alcance a
  propósito del plan de corrección de registros ya cerrado (PR #28). (El historial
  completo de la cadena ya no está pendiente: PR #41, issue #38.)
- Fase 4/5 de `ROADMAP.md` (batería de ataques, instrumentos de evaluación, piloto,
  manuales, publicación) — trabajo conjunto de investigación, todavía no tiene issues
  de código.
- Confirmar los estándares de #71/#58 (accesibilidad) y #72/#57 (catálogo de
  componentes) — siguen en borrador. Jhunier dejó respuestas a las preguntas abiertas de
  ambos en la nota de sesión 2026-10-12; falta acordarlas con Duverney.
- No existe aún una CLI para generar la clave de revocación ni firmar listas (anotado en
  ADR-0014/15); sin issue todavía.

WebSockets si el polling de 7s de `RegistrosPage` resulta insuficiente — no es
bloqueante todavía, sin issue.

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

## Notas de sesiones recientes

**2026-10-12 — ADR-0013, 0014 y 0015 aceptadas.** Duverney y Jhunier. Jhunier revisó y
fusionó #68-#70 y aceptó los tres ADR sin cambios. Se acordó la operación de la lista de
revocación para el piloto: Duverney estará en el CCAV en la Fase 4, custodia la clave de
revocación y refirma a diario (`MAX_AGE` 48-72 h, `REFRESH` 300 s). Queda pendiente una
CLI para generar la clave de revocación y firmar la lista; hoy se hace desde Python.

**2026-10-12 — Revisión y fusión de #49/#51 (PR #67).** Jhunier, con el acuerdo
explícito de revisarlo él mismo por el tema de HTTPS (no cruzado por Duverney). Verifica
el certificado autofirmado persistente, `setCertificateVerifyProc` pineado a ese PEM
exacto, la cookie `secure` solo bajo HTTPS real, y el empaquetado con `electron-builder`
(`extraResources` para `server/node_modules`, recompilación de `better-sqlite3` contra
la ABI de Electron vía `ELECTRON_RUN_AS_NODE=1`). Verificación de punta a punta ya hecha
antes en la sesión: app empaquetada real arrancada, certificado generado, login con
cookie `Secure`. **No verificado:** instalar el `.exe` de Windows en una máquina limpia
(sin Windows disponible en este entorno) — queda pendiente de quien lo instale en el
CCAV. Al fusionar se aprovechó para poner al día el resto de `STATE.md`: issues #45-48
seguían marcados "pendiente de revisión" en varias secciones pese a estar ya fusionados
(PR #68, #69, #70, #65) — corregido en todas partes, no solo en la sección que tocaba
este PR. GitHub no deja autoaprobar el propio PR; quedó como revisión tipo comentario y
se fusionó directo como dueño del repositorio.

**2026-10-12 — Revisión cruzada y fusión de #45/#46/#47 (PR #68, #69, #70).** Jhunier.
Revisados en orden de dependencia, con los test suites reales corridos tras instalar
cada módulo (no solo confiando en la descripción del PR): en #68 se reprodujo el bug de
bifurcación de cadena contra el código anterior en `main` para confirmar que el fix era
real. Los tres quedaron sin hallazgos y se fusionaron con squash. ADR-0013/14/15
coinciden con lo implementado; recomendado pasarlos de *Propuesta* a *Aceptada*, aún sin
confirmar formalmente en `DECISIONS.md`. Nota técnica: cada squash-merge dejaba a la
siguiente rama marcada como "en conflicto" por git (mismo contenido, reescrito por el
squash) — se resolvió fusionando `main` dentro de las ramas de Duverney y pusheando
directo, verificando en cada caso que ningún lado perdiera contenido y volviendo a
correr los tests. Pendiente de Duverney: confirmar los ADR, las respuestas que dejó
Jhunier a las preguntas de #71/#58 y #72/#57 (siguen en borrador hasta entonces), y
quién opera el servidor de publicación de la lista de revocación y la cadencia de
refirmado (propuesta de Jhunier: diario, `MAX_AGE` 48-72h, `REFRESH` 300s). Pendiente de
Duverney también: revisión cruzada de #66 y #64 (de Jhunier, ninguno con aprobación
todavía) y confirmación del contenido de #63 (guía de contenido, ya verificado y listo
para revisión).

**2026-10-11 — Issue #47: lista de revocación con conectividad intermitente.** Duverney.
ADR-0015 (*Propuesta*) registrado antes de implementar. `RevocationListCache` en
`revocation/` (recarga, antirretroceso, antigüedad máxima con falla cerrada) y comando
de sincronización en `verifier-service/`. Dos variables nuevas obligatorias:
`SQRID_REVOCATION_MAX_AGE_SECONDS` y `SQRID_REVOCATION_REFRESH_SECONDS`. Verificación:
pytest en `revocation/` (53) y `verifier-service/` (48); fallos reales de red y de
esquema comprobados contra `https_fetch`. No se probó una descarga HTTPS exitosa contra
un servidor real. Pendiente: revisión de #68, #69 y este PR; definir quién opera el
servidor de publicación y la cadencia de refirmado; CLI para firmar listas.

**2026-10-11 — Issue #46: verificador real con revocación.** Duverney. Se crea
`verifier-service/` como capa de aplicación (ADR-0014, *Propuesta*): arranca el
`Verifier` con claves, nonces, `RevocationList.from_signed_bytes` y `RecordingVerifier`.
Decisiones: clave de revocación propia (no la del emisor) en directorio separado;
falla cerrado también al arrancar. Endurecimiento de `revocation/`: antes aceptaba
firmas *high-S* de cualquier longitud y convertía `cids = "abc"` en tres revocaciones.
Verificación: pytest en `verifier-service/` (24), `revocation/` (33), `verifier/` (83),
`evidence-log/` (13), `issuer/` (26), y arranque real con `uvicorn` (health, rechazo y
fallo de arranque sin lista). Pendiente: revisión de #68 y de este PR; CLI para firmar
listas; recarga y frescura de la lista (issue #47).

**2026-10-11 — Issue #45: bitácora conectada al verificador.** Duverney. Se compone
`Verifier` + `EvidenceLog` en la capa de aplicación mediante `RecordingVerifier`
(ADR-0013, *Propuesta*). Solo se registran aceptaciones, con `verifier_id` obligatorio
por instalación y una bitácora persistente por verificador, separada del almacén de
nonces. Un fallo al registrar produce el rechazo genérico y quema el nonce (documentado
y probado). Se corrigió una carrera real en `EvidenceLog`: sin transacción explícita,
escrituras concurrentes encadenaban sobre el mismo predecesor; además la conexión no
admitía hilos del servidor ASGI. Verificación local: `pytest` en `verifier/` (83) y
`evidence-log/` (13). CI del job `verifier-test` instala ahora `../evidence-log`.
Pendiente: revisión cruzada, CI del PR y decidir el punto de entrada de producción
(issue #46).

**2026-09-26 — Issue #48: componentes migrados conectados.** Se conserva la decisión
append-only de ADR-0008: se retira el modal de edición directa del cliente web y se
mantiene la corrección con motivo e historial. El prototipo Electron legado bajo
`mi-app-qr/src` no se modifica. Se integra la exportación CSV, la precarga desde QR de
texto y el aviso de posible salida olvidada, adaptando sus textos al modelo de eventos
separados. Un operador conserva la capacidad de crear entradas/salidas y confirmar
otra entrada, pero nunca recibe la acción de corregir. Los modales recién conectados
incluyen foco inicial, contención de Tab, Escape y restauración del foco.
Verificación local: `npm test` y `npm run build` en `mi-app-qr/client`; pruebas de
integración de QR, exportación, aviso, corrección, permisos, reintento y envío pendiente.
No se afirma validación manual en navegador ni E2E contra servidor real. Pendiente:
revisión cruzada y CI del PR antes de fusionar.

**2026-09-23 — Nueva iniciativa de diseño/frontend, repartida en partes iguales.**
Jhunier pidió mejorar el atractivo visual de `mi-app-qr/client` y `verifier-web/` para
el personal institucional que las usa, y que el trabajo quedara parejo entre los dos
autores — a diferencia de los módulos criptográficos, aquí ninguno tiene ventaja de
experiencia previa. Se crearon 4 issues de documentación pura (definir antes de
implementar): #55 y #56 para Jhunier (tokens visuales, contenido/microcopy); #57 y #58
para Duverney (catálogo de componentes, accesibilidad WCAG AA extendida a
`mi-app-qr/client`). Detalle en "Pendiente → Diseño / frontend" arriba. La
implementación visual que salga de estos documentos se repartirá después.

**2026-09-23 — Issue #50 cerrado: licencia/prueba adaptada, no eliminada.** Jhunier
decidió mantener el sistema de licencia/prueba de `main.js`, adaptándolo al modelo
cliente-servidor en vez de borrarlo. Detalle en "Hecho" arriba. Implementado
directamente por Jhunier pese a que el issue había quedado asignado a Duverney en el
reparto por equidad de carga — excepción puntual, no cambia el reparto general.

**2026-09-23 — Issue #4 cerrado: tres objetivos específicos.** Jhunier confirmó la
decisión: el proyecto queda en tres objetivos específicos (los de la propuesta de grado
y la Etapa 2, que ya coincidían entre sí). El desajuste que mantenía el issue abierto no
estaba en este repositorio, sino en entregables posteriores del curso (Fase 4, Etapa 5)
que reservaban espacio para un cuarto objetivo — se ajustan esos entregables, no la
propuesta ya sustentada. Con esto, y con los criterios de `ROADMAP.md` ya cumplidos
(ADR-0005, ADR-0007, `SQRID-1.md` fuera de borrador — ver PR #52), la Fase 2 no tiene
ya ningún bloqueante documentado en este repositorio.

**2026-09-23 — Ajuste del reparto: los 4 issues de `mi-app-qr/` también pasan a
Duverney.** El reparto inicial de esta misma fecha (nota siguiente) le había dejado a
Jhunier 4 issues nuevos (#48-#51) y a Duverney otros 4 (#9, #45-#47), en conteo parejo
pero no en carga real: Jhunier ya venía de cerrar ~29 PR contra 2 de Duverney, así que
"parejo en cantidad de issues nuevos" seguía sin ser equitativo. Se reasignaron #48-#51
a Duverney; Jhunier no toma issue de implementación nuevo esta vuelta. Único costo real:
Duverney tendrá que familiarizarse con `mi-app-qr/client`, que hasta ahora solo tocó
Jhunier — aceptado a cambio de la equidad.

**2026-09-23 — Repartición de pendientes por equidad de carga.** `evidence-log/`
(PR #43) y `revocation/` (PR #44) de Duverney se fusionaron hoy tras revisión cruzada
(se corrigió un hash ambiguo en `evidence-log/` — payload concatenado con `"|"` en vez
de codificación con prefijo de longitud, ver commit `d1a747a` en `main`) y resolución de
un conflicto real en `.github/workflows/ci.yml` entre ambos PR (ambos añadían su job al
mismo punto del archivo; se conservaron los dos). Con eso, el conteo de PR fusionados
del repositorio queda muy desbalanceado (~29 de Jhunier frente a 2 de Duverney, sin
contar los PR de infraestructura/documentación previos al reparto original de
`issuer/verifier` vs. `evidence-log/revocation/anchor`). Se repartieron los pendientes
de implementación en consecuencia — no por afinidad de módulo, sino para nivelar carga
acumulada: Duverney conserva y completa su terceto original (`anchor/` + conectar en
producción lo que ya construyó en `evidence-log/`/`revocation/`, issues #45-#47, más
#9 ya asignado); a Jhunier le tocó el cierre de frentes ya abiertos en `mi-app-qr/`
sin módulo criptográfico nuevo esta vuelta (issues #48-#51). Detalle completo en
"Pendiente → Implementación" arriba.

**2026-08-22 — PR #37, #39, #40, #41: dependencias, migración de componentes,
historial de correcciones.** Codex resolvió issue #36 (dependencias, PR #37, fusionado)
y issue #38 (historial de correcciones, PR #41). Antigravity resolvió issue #36→#39
(migración de componentes). Cada PR se revisó con código en mano, no solo el reporte de
la herramienta: en PR #39 se encontró que los componentes migrados usaban el esquema de
datos del prototipo viejo en vez del tipo `Registro` real (corregido tras pedir el
ajuste); en PR #41 se encontró que la afirmación "accesibilidad validada con Playwright
y axe" era falsa — `mi-app-qr/client` no tiene esa dependencia ni un solo `.spec.ts`
(la accesibilidad del modal nuevo sí es real: trap de foco, Escape, ARIA, con test
propio en Testing Library; se pidió corregir solo la afirmación, no bloqueante).

**Hallazgo operativo importante:** Antigravity trabaja directo sobre este mismo
directorio de trabajo (`C:\Users\rlas\Documents\CODE\RegistroQR`), no en una copia
aislada como Codex (que usa worktrees en `.superpowers/codex-issue-XX/`). Su checkout
de rama chocó con uno propio en curso y terminó filtrando archivos de PR #39 dentro de
la rama de limpieza de `App.jsx` (PR #40) sin que nadie lo pidiera. Se detectó por
`git status` mostrando archivos inesperados, se reconstruyó la rama afectada desde
`main` limpio y se corrigió con `--force-with-lease` (autorizado explícitamente antes de
forzar). **Pendiente:** que Antigravity pase a trabajar en su propia carpeta/clon para
que esto no se repita — mientras tanto, evitar operaciones de git propias justo después
de pedirle una tarea a Antigravity sin verificar primero en qué rama quedó el directorio
compartido.

**2026-08-22 — historial de correcciones (issue #38).** Se creó un worktree aislado
desde `origin/main` y se implementó con TDD el recorrido completo de una cadena de
correcciones. La API conserva el rol del registro como texto libre según ADR-0009 y
aplica la misma autenticación de lectura que el listado; la autorización de escritura
continúa limitada a `admin`. El modal presenta todas las versiones sin acciones de
mutación y cubre carga, orden, acceso de operador, `Escape` y restauración del foco.

**2026-08-22 — Limpieza de repositorio: `App.jsx` suelto.** Se eliminó `App.jsx` en la
raíz del repo. Verificación antes de borrar: sin `package.json`/`index.html` en la raíz
que lo referenciara, sin historial de commits desde el commit inicial del proyecto
(`d904f41`), y contenido claramente anterior y superado por `mi-app-qr/src/App.js`
(331 líneas vs. 527, sin las importaciones de `EditRecordModal`/`ExportCsvModal`/
`ForgottenOutModal`/`qrParser` que sí tiene la versión vigente). Bloqueante cerrado.

**2026-08-21 — `verifier-web/` (issue #30).** Se creó una rama y un worktree aislados
desde `main` para no interferir con el trabajo paralelo sobre `mi-app-qr`. ADR-0012 fija
la frontera navegador/verificador y la política de datos efímeros. Se implementó el
portal responsive, el adaptador FastAPI y suites unitarias/E2E con auditoría de
accesibilidad. El fixture HTTP incluido sirve solo para recorrer estados visuales en
loopback; la operación real exige el `Verifier` configurado y HTTPS bajo el mismo
origen. Después de una primera revisión visual ("no me gustó el diseño"), se rehizo la
capa de presentación sobre los mismos tokens de marca — resultado dominante a pantalla
completa en vez de una card pequeña, token en texto plano, header con más profundidad —
sin tocar la lógica ya probada; los mismos 13 tests Vitest y 9 Playwright/Axe siguen en
verde.

**2026-08-21 — Dashboard e Informes (issue #32, PR #34 fusionado).** Se creó el
worktree aislado `feat/32-dashboard-informes` desde `origin/main`. Con TDD se añadieron
Dashboard, Informes, las rutas explícitas de Registros y navegación responsive. Los
datos se agregan y filtran en el cliente; el CSV exporta únicamente las filas visibles y
protege campos interpretables como fórmulas. No se modificaron servidor, tipos
compartidos, `RegistrosPage` ni `UsuariosPage`.

**2026-08-20/21 — corrección de registros y limpieza de documentación.** Se diseñó
(brainstorming + spec aprobada) y se implementó en 6 tareas TDD, con revisión de dos
etapas por tarea más una revisión final holística, la corrección de registros en
`mi-app-qr` — ver "Hecho" arriba. PR #28 fusionado. Aparte, se cerró formalmente en
`DECISIONS.md` el motor de almacenamiento de ADR-0008 (ya estaba implementado de facto
desde hace varias sesiones, nunca se había vuelto a cerrar el ítem) y se puso al día
`STATE.md` con el cierre de `issuer/`/`verifier/` (issues #5 y #6) y de la gestión de
usuarios (issue #12) — esta rama (`docs/state-cierre-sesion`) tuvo que reconciliarse dos
veces porque `main` avanzó con el trabajo de `issuer/` y luego `verifier/` mientras
seguía abierta; en ambos casos se resolvió reconstruyendo sobre el `main` real en vez de
forzar el contenido viejo encima, para no revertir ADR-0010/ADR-0011 ni las notas de
sesión que esos merges ya habían agregado.

**2026-08-20 — `verifier/` (issue #6).** Se creó la rama aislada
`modulo/6-verifier-portal` desde `main` después del merge del issuer. Antes del código se
registró ADR-0011 para cerrar tolerancia de reloj, persistencia anti-replay y revocación
fail-closed. Se implementó el parser canónico, resolución de claves P-256, verificación
ECDSA *low-S*, estado SQLite y la interfaz obligatoria de revocación. Se añadieron 44
pruebas, incluidas interoperabilidad con `issuer/`, persistencia tras reinicio y carrera
concurrente del mismo token. No se generó ni versionó material criptográfico persistente.

**2026-08-20 — `issuer/` (issue #5).** Se creó un worktree y una rama aislados para no
interferir con el desarrollo paralelo de `mi-app-qr/`. Antes del código se registró
ADR-0010 y se concretó `SQRID/1`: P-256/SHA-256, CBOR determinista, firma P1363 de 64
bytes con `s` bajo, timestamps Unix UTC y transporte Base64url. Se implementó la CLI y
la API de emisión, se añadieron 26 pruebas y el job `issuer-test`. No se generó ni se
versionó material criptográfico persistente; las pruebas crean claves efímeras dentro de
los temporales de pytest.

**2026-08-12 — inicio del repositorio.**

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

