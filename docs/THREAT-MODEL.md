# Modelo de amenazas

## Supuesto de partida

La credencial es un **transportador pasivo y temporal**, no una garantía de identidad.
El atacante puede leer, copiar y reproducir cualquier código QR que vea. El diseño asume
además un adversario interno: alguien con privilegios sobre la base de datos institucional
que quiere alterar registros después de que ocurrieron.

## Amenazas y controles

| Amenaza | Riesgo | Control | Módulo |
|---|---|---|---|
| Clonación de QR | Reutilización no autorizada de una credencial válida | Firma ECDSA + token de corta duración | `issuer`, `verifier` |
| Reemplazo de QR | Presentación de un código falsificado | Verificación con clave pública del emisor | `verifier` |
| Ataque de repetición | Reutilización de una captura previa | Marca temporal + nonce de un solo uso | `verifier` |
| Manipulación de registros | Modificación de accesos o asistencia | Encadenamiento de hashes + pruebas de Merkle | `evidence-log` |
| Abuso de privilegios | Alteración interna de la evidencia | Anclaje de raíces de Merkle en Fabric y sellado diario en Bitcoin (OpenTimestamps) | `anchor` |
| Credencial comprometida | Uso de una identidad revocada | Lista de revocación firmada | `revocation` |

## Amenazas del portal de verificación (ADR-0012)

El portal añade cámara y transporte HTTP a la capa de validación. No cambia la decisión
criptográfica, pero sí puede filtrar o enviar más veces un token si se implementa mal.

| Amenaza | Riesgo | Control |
|---|---|---|
| Captura o persistencia del QR en el navegador | Reutilización o exposición posterior del token | Procesamiento local de fotogramas; sin capturas, analítica, `localStorage` ni token en historial |
| Envíos duplicados por lecturas sucesivas de cámara | El primer intento consume el nonce y produce resultados confusos | Detener el lector al primer resultado y bloquear nuevas solicitudes mientras se verifica |
| Escucha o alteración del tráfico del portal | Robo o sustitución del token antes de validarlo | Mismo origen y HTTPS obligatorio fuera de `localhost` |
| Lógica criptográfica replicada en JavaScript | Divergencia frente al verificador y aceptación incorrecta | El navegador trata el token como texto opaco; solo Python decide |
| Mensajes de rechazo detallados | Oráculo para iterar ataques contra firma, vigencia o revocación | Respuesta y presentación genéricas para todo rechazo criptográfico |
| Permiso de cámara denegado o dispositivo ausente | Bloqueo operativo o presión para desactivar controles | Entrada manual accesible y estados de recuperación sin aceptar localmente |
| Animación o contraste deficientes | Personas con discapacidad no pueden operar el punto de control | WCAG AA, teclado, foco visible, `aria-live` y movimiento reducido |

## Amenazas del servidor multiusuario (ADR-0008)

Al pasar `mi-app-qr/` de aplicación monopuesto a servidor en la red institucional
aparece una superficie de ataque que antes sencillamente no existía: mientras los datos
vivían en el `localStorage` de un solo equipo, no había red que interceptar ni cuentas
que comprometer. Estas amenazas son independientes del modelo criptográfico de la
credencial y se materializan aunque el QR sea perfecto.

| Amenaza | Riesgo | Control |
|---|---|---|
| Credenciales débiles o reutilizadas del personal | Acceso no autorizado a datos personales de estudiantes | Hashing con librería establecida, política de contraseñas, bloqueo tras intentos fallidos |
| Escucha de la red institucional | Captura de contraseñas y datos personales en tránsito por WiFi | HTTPS con certificado autofirmado por instalación (ADR-0008, issue #51) |
| Secuestro de sesión | Suplantación de un usuario ya autenticado | Cookies de sesión con expiración, invalidación al cerrar sesión, marcadas `secure` bajo HTTPS |
| Escalada entre roles | Un usuario de registro accede a informes o edita registros ajenos | Autorización por rol verificada en el servidor, nunca solo en la interfaz |
| Edición silenciosa de registros | Un administrativo corrige un registro sin dejar rastro | Corrección como evento nuevo con autor y motivo, nunca sobrescritura (ver ADR-0008) |
| Exposición del servidor fuera de la LAN | Acceso desde internet a datos personales | Escucha restringida a la red institucional; nunca exponer el puerto a internet |

## Amenazas del registro y el portal del titular (ADR-0016)

`mi-app-qr/` pasa a guardar la relación `cid` → titular y a entregar el QR al teléfono
de cada titular. Eso trae datos personales nuevos y una puerta de entrada para personas
que no son personal del CCAV.

| Amenaza | Riesgo | Control |
|---|---|---|
| Registro con datos falsos o masivo desde la red del CCAV | Credenciales a nombre de otra persona o inexistente; la identidad es **declarada**, no verificada | El alta solo es posible desde la red del CCAV (presencia física en la sede); un registro activo por documento, con los duplicados en revisión del `admin`; límite de altas por IP (`ALTA_MAX_POR_IP`, 10 por hora por defecto, reservado en una transacción `IMMEDIATE` antes de bcrypt, issue #120); revisión posterior de la bitácora. El límite frena el registro masivo desde un equipo, no desde muchos teléfonos distintos, ni de quien cambie de IP dentro de la red. Riesgo residual que se declara en el documento de grado |
| Resolución indebida de un alta en revisión (enmienda de 2026-10-24 a ADR-0016) | Un `admin` descuidado o malintencionado reemplaza un registro legítimo, o alguien distinto del titular usa el código provisional de entrega | Solo `admin`; motivo de lista cerrada y registro en `cambios_configuracion`; el código provisional se muestra una sola vez, se guarda con bcrypt, se canjea de forma atómica con el límite de intentos de la recuperación y vence a las 72 horas; al canjearlo se reemplaza por el código propio del titular. Riesgo residual: el sistema no impide la decisión del `admin`, solo la deja registrada; se recomienda entregar y canjear el código en el mismo acto |
| Robo de la cookie del dispositivo o del teléfono desbloqueado | Quien la tenga obtiene QR válidos del titular | Llave de 256 bits en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; el servidor guarda solo su hash; un dispositivo por titular; el `admin` revoca el vínculo y la emisión se corta de inmediato |
| Fuerza bruta sobre el código de recuperación | Vincular un teléfono ajeno | Al menos 80 bits de entropía, hash con bcrypt, límite de intentos por documento y por IP |
| Suplantación del portal en la red local | Robo de datos del alta o de la llave del dispositivo; el certificado autofirmado acostumbra a aceptar advertencias | Huella SHA-256 del certificado publicada en un cartel en la sede y en el panel, con instrucciones para compararla en el alta; IP fija para que la huella no cambie, y si se regenera, cartel nuevo ese mismo día. Solución de fondo pendiente: dominio propio con Let's Encrypt por DNS-01 (ADR-0016) |
| Declararse en un estamento privilegiado | Ampliar el horario de ingreso (docente, administrativo, Externo) | Esos estamentos requieren confirmación del `admin`; mientras tanto rige el estamento base, que el `admin` elige en la configuración inicial (ningún estamento viene fijo en el código). El dominio del correo solo sugiere, porque el correo no se verifica |
| `admin` que cambia ventanas o estamentos para permitir ingresos indebidos | Accesos fuera de horario sin rastro | Cada cambio queda registrado con autor, fecha y valor anterior |
| Consulta indebida `cid` → persona | Reidentificación del historial de asistencia | Solo el permiso `admin`, y cada consulta queda registrada (quién, cuándo, qué `cid`) como exige la Ley 1581 de 2012. Hasta que exista, la bitácora es un archivo SQLite sin consulta autenticada: quien acceda al archivo lee todos los `cid` sin dejar rastro |
| Alteración del historial `cid` → titular | Atribuir un evento intacto de la bitácora a otra persona, sin que `verify_chain()` lo detecte | Historial de solo agregar y con un compromiso verificable de cada asignación (por ejemplo, en la bitácora encadenada con un identificador opaco del titular); mecanismo concreto en #79 y #88 |
| Reseteo trimestral que reactiva a un revocado | Un titular revocado recibiría un `cid` nuevo que no está en la lista de revocados | El reseteo solo alcanza credenciales `vigentes`; un revocado queda suspendido hasta que un `admin` lo reactive con registro del cambio |
| Captura del QR en la pantalla del titular | Presentarlo antes que el titular | Token de 60 s con tolerancia de reloj de 30 s y nonce de un solo uso; la página no guarda el token en `localStorage`, historial ni caché |
| Vinculación de apariciones del mismo `cid` desde fuera | Reconstruir el patrón de asistencia de alguien sin saber su nombre | Reseteo trimestral del `cid`, sin revocar el anterior. Dentro de un trimestre la vinculabilidad persiste (riesgo aceptado) |

## Custodia de las claves en el servidor del CCAV (ADR-0014, ADR-0015, ADR-0016)

La clave de emisión es el material más sensible del sistema, y desde ADR-0016 vive en el
mismo equipo servidor que `mi-app-qr/`.

| Amenaza | Riesgo | Control |
|---|---|---|
| Acceso al archivo de la clave de emisión | Emisión de tokens válidos fuera del sistema | PEM cifrado, legible solo por una cuenta propia del sistema operativo; la contraseña la escribe el custodio al arrancar el servicio y la clave queda solo en la memoria del proceso |
| Compromiso de la cuenta de `mi-app-qr` | Pedir tokens al servicio local de emisión | El servicio escucha solo en `127.0.0.1` y exige el secreto compartido; con él se piden tokens, pero no se lee la clave |
| Control total del equipo (administrador del sistema) | Leer la clave de la memoria del proceso de `issuer/` | Se trata como **compromiso de la clave de emisión**: clave nueva (nuevo `kid`), retiro de la anterior de los verificadores y reemisión, no solo cerrar el acceso (ADR-0016) |
| Contraseña en el entorno del proceso | Lectura por la misma cuenta o por el administrador del equipo | En el piloto, la contraseña se escribe en la terminal, no por variable de entorno |
| Custodio no disponible | Sin refirmado diario la lista vence (48 a 72 h) y todos los puntos de control rechazan | Respaldo del PEM de revocación en un medio externo cifrado y su contraseña en el gestor de Jhunier; si pasan 24 horas sin refirmado, Jhunier firma con el respaldo y queda anotado |
| Firmar la lista con la clave equivocada | El verificador deja de arrancar tras un reinicio y la lista vigente termina por vencer | El comando de firma se niega a reemplazar una lista firmada con otra clave, salvo rotación explícita |

## Anclaje real (ADR-0017)

| Amenaza | Riesgo | Control |
|---|---|---|
| La red Fabric la opera el propio proyecto | Quien opera la red podría reescribirla junto con la bitácora | Sellado diario del hash del último bloque del canal en Bitcoin con OpenTimestamps, que cubre los lotes de todas las instalaciones y no depende del proyecto ni de la universidad (ADR-0007) |
| Servidores de OpenTimestamps caídos o sin salida a internet | El bloque del día queda sin sellar | Los servidores públicos los mantienen voluntarios: el sello queda pendiente y se reintenta; Fabric sigue siendo el anclaje principal |
| Pérdida del ledger por reiniciar la red como en pruebas | Raíces ancladas que ya no se pueden consultar | La red se crea una sola vez y después solo se detiene y arranca (`unless-stopped`); respaldo semanal cifrado de volúmenes y material criptográfico |
| La raíz entra a Fabric pero el recibo no se registra | Lote anclado dos veces, raíz huérfana en Fabric o ciclo trabado | El lote se fija en `lotes` antes de exportarlo y se reexporta con el mismo rango y `loteId` aunque lleguen eventos nuevos; ante «ya registrado» se compara la raíz: si coincide se registra el recibo original, si no se detiene y alerta |
| Dos instalaciones anclan en la misma red | Conflicto falso de «ya registrado» con raíces distintas | El `loteId` lleva el `verifier_id`: `<verifier_id>:seq-<primero>-<último>` |
| Recibo con una raíz ajena al lote | Eventos que figuran como anclados sin estarlo | `record_anchor` solo acepta el recibo de un lote fijado pendiente y compara raíz, rango y cantidad; si no coinciden, alerta |
| Fabric no responde por horas | Se amplía la ventana de riesgo residual (abajo) | Reintento cada 15 minutos; el ciclo escribe un archivo de estado y el panel alerta si `stale` es verdadero |
| La tarea programada deja de correr | Nadie se entera de que el anclaje está detenido | El panel también alerta si el archivo de estado tiene más de 2 horas |

## Fuera del alcance

Nombrarlo explícitamente es más honesto que dejarlo implícito, y anticipa la pregunta
en la sustentación.

**Cesión voluntaria.** Si el titular entrega su credencial a otra persona, el sistema la
acepta. Es un token válido presentado dentro de su ventana de vigencia. Con el portal
del titular (ADR-0016) esto incluye prestar el teléfono vinculado: nadie compara a la
persona con su registro en el momento del paso, y la revisión del `admin` sobre la
bitácora es posterior. Mitigarlo exige un segundo factor o biometría, fuera de esta
fase; tampoco se recoge foto del titular.

**Omisión en el registro.** El modelo garantiza que un evento registrado no pudo
alterarse después. No garantiza que todo evento ocurrido se haya registrado. Un operador
que simplemente no escanea deja un hueco que la criptografía no cierra.

**Compromiso de la clave privada del emisor.** Si se filtra, el atacante emite
credenciales válidas indistinguibles de las legítimas. La mitigación es de custodia y
rotación (`kid` en el formato del token), no criptográfica; los controles de custodia
están en la sección de arriba.

**Ataque físico al punto de control.** Manipulación del hardware lector o del torniquete.

**Gobernanza de la red permisionada.** Si todos los nodos los opera la misma institución
cuyos registros se quieren proteger, el anclaje ofrece una garantía debilitada. Es una
limitación real del diseño, no un detalle de implementación. En el piloto, además, la
red la operan los propios autores (ADR-0017); por eso el sellado en Bitcoin con
OpenTimestamps es lo que da la garantía externa. Ver ADR-0007.

## Vinculabilidad del `cid`

**Vinculabilidad:** posibilidad de relacionar varias apariciones de un mismo sujeto
aunque no se sepa quién es.

El `cid` es opaco (`docs/SQRID-1.md`): quien decodifica el QR no obtiene un dato
personal. Pero el mismo `cid` se repite en cada token que se emite para un titular. Quien
capture QR de forma repetida (una cámara frente al punto de control, un operador que
fotografía los códigos) puede saber que «la misma persona» pasó el lunes, el martes y el
jueves, y armar su patrón de asistencia, aunque no sepa su nombre. Si en algún momento
asocia una sola aparición con la persona, todo el historial ligado a ese `cid` queda
identificado.

Hay que distinguir dos casos:

- **Dentro del sistema la vinculación es deliberada.** `evidence-log/` registra el `cid`
  de cada validación aceptada (ADR-0013) precisamente para poder auditar. Ese acceso
  todavía **no** está controlado: hoy la bitácora es un archivo SQLite que solo protege
  el acceso al equipo, sin una interfaz de consulta autenticada ni registro de quién la
  lee (ADR-0008 deja pendiente qué se audita). ADR-0016 propone que solo un `admin`
  pueda traducir un `cid` a una persona y que cada consulta quede registrada; hasta que
  eso exista, quien tenga acceso al archivo puede leer todos los `cid` sin dejar rastro.
- **Fuera del sistema es un riesgo residual de privacidad**, que la firma y el nonce no
  cubren: no impiden leer el `cid`, solo impiden reutilizar el token.

**Mitigación propuesta: reseteo trimestral del `cid`** (pendiente de ADR, junto con la
decisión sobre el registro `cid` → persona en el servidor de `mi-app-qr`):

- Cada trimestre, el registro de credenciales le asigna a cada titular un `cid` nuevo,
  generado con CSPRNG, y deja de emitir tokens con el anterior. Así, quien observe desde
  fuera solo puede encadenar apariciones dentro de un mismo trimestre.
- No cambia el formato: `SQRID-1.md` ya define el `cid` como el identificador que se
  genera al crear la credencial, así que un `cid` nuevo es una credencial nueva, no un
  `SQRID/2`.
- No hace falta revocar el `cid` anterior: los tokens ya emitidos con él vencen solos en
  su ventana de vigencia, y el emisor no vuelve a firmar con él. La revocación sigue
  reservada para credenciales comprometidas, de modo que la lista firmada no crece con
  cada reseteo.
- El registro debe conservar la relación histórica (qué `cid` tuvo cada titular y en qué
  periodo) para que las auditorías sobre eventos antiguos de la bitácora sigan siendo
  posibles. Esa historia no solo es sensible: es el único enlace entre un evento de la
  bitácora y su titular, porque la cadena de hashes solo compromete el `cid`. Si alguien
  con acceso a la base de datos cambia una fila del historial, atribuye un evento intacto
  a otra persona sin que `verify_chain()` lo detecte. Por eso el historial debe ser **a
  prueba de manipulación**: de solo agregar (una asignación nueva nunca reescribe la
  anterior) y con un compromiso verificable de cada asignación `cid` → titular, hecho
  con el identificador interno opaco del titular y nunca con datos personales.
- Mecanismo adoptado (enmienda de 2026-10-25 a ADR-0016): `asignaciones_cid` se encadena
  con HMAC-SHA256 y una clave que vive fuera de la base. Quien solo tiene el archivo de
  la base, una copia o un respaldo no puede recalcular la cadena sin que
  `verifyAsignaciones` lo detecte. **Riesgo residual:** quien controla el equipo
  servidor completo (la base y la clave) todavía puede reescribirla.
- Compromiso externo (segunda enmienda de 2026-10-25 a ADR-0016, #119): `mi-app-qr`
  escribe la cabeza de la cadena (seq y etiqueta HMAC) cada 15 minutos; el ciclo de
  `evidence-log/` la registra como evento y la ancla en Fabric con el siguiente lote, y
  `mi-app-qr` compara cada hora su historial con los compromisos anclados. Desde que un
  compromiso queda anclado, reescribir o truncar el historial **anterior** a ese punto se
  detecta aunque se tenga la clave. **Riesgo residual:** lo que se asignó después del
  último compromiso anclado (hasta unos 15 minutos más el ciclo de anclaje) solo lo
  protege el HMAC; y la comparación usa la copia local de la bitácora, que a su vez solo
  se confirma contra Fabric al consultar la raíz anclada (#93).

**Límite que se acepta.** Dentro de un trimestre la vinculabilidad persiste. Eliminarla
del todo exigiría un identificador distinto en cada token, lo que obliga a rediseñar la
revocación y el registro en la bitácora. Esa alternativa se evalúa en la ADR, no se adopta
aquí.

## Ventana de riesgo residual

Entre que un evento se registra localmente y que su raíz de Merkle queda anclada existe
un intervalo en el que un adversario interno con acceso suficiente podría reescribir la
cadena local completa. Acortar el periodo de anclaje reduce la ventana; eliminarla del
todo exigiría anclar por evento, lo que el diseño descarta por latencia (ADR-0003).

**Este intervalo debe medirse y reportarse** en la evaluación del prototipo. Es un
resultado del trabajo, no una debilidad que ocultar.

**Riesgos residuales del anclaje real (ADR-0017), que se declaran también en el
documento de grado:**

- **Ventana sin sello externo.** Entre un sellado diario y su confirmación en Bitcoin
  pasan un día o más. En ese lapso, quien opera la red Fabric podría reconstruir el
  ledger sin que nadie de fuera lo detecte: Fabric aporta registro inmutable frente a
  terceros, no frente a sus propios operadores. El sello cierra esa ventana, pero con
  retraso.
- **Sin descentralización real.** La `test-network` tiene un solo *orderer* y dos
  organizaciones operadas por las mismas personas. No debe presentarse como una red
  descentralizada: la garantía externa la da el sello en Bitcoin.
