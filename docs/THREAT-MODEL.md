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
| Registro con datos falsos o masivo desde la red del CCAV | Credenciales a nombre de otra persona o inexistente; la identidad es **declarada**, no verificada | El alta solo es posible desde la red del CCAV (presencia física en la sede); un registro activo por documento, con los duplicados en revisión del `admin`; revisión posterior de la bitácora. Riesgo residual que se declara en el documento de grado |
| Robo de la cookie del dispositivo o del teléfono desbloqueado | Quien la tenga obtiene QR válidos del titular | Llave de 256 bits en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; el servidor guarda solo su hash; un dispositivo por titular; el `admin` revoca el vínculo y la emisión se corta de inmediato |
| Fuerza bruta sobre el código de recuperación | Vincular un teléfono ajeno | Al menos 80 bits de entropía, hash con bcrypt, límite de intentos por documento y por IP |
| Suplantación del portal en la red local | Robo de datos del alta o de la llave del dispositivo; el certificado autofirmado acostumbra a aceptar advertencias | Huella SHA-256 del certificado publicada en un cartel en la sede y en el panel, con instrucciones para compararla en el alta. Solución de fondo pendiente: dominio propio con Let's Encrypt por DNS-01 (ADR-0016) |
| Declararse en un estamento privilegiado | Ampliar el horario de ingreso (docente, administrativo, Externo) | Esos estamentos requieren confirmación del `admin`; mientras tanto rige el estamento base. El dominio del correo solo sugiere, porque el correo no se verifica |
| `admin` que cambia ventanas o estamentos para permitir ingresos indebidos | Accesos fuera de horario sin rastro | Cada cambio queda registrado con autor, fecha y valor anterior |
| Consulta indebida `cid` → persona | Reidentificación del historial de asistencia | Solo el permiso `admin`, y cada consulta queda registrada (quién, cuándo, qué `cid`) como exige la Ley 1581 de 2012 |
| Captura del QR en la pantalla del titular | Presentarlo antes que el titular | Token de 60 s con tolerancia de reloj de 30 s y nonce de un solo uso; la página no guarda el token en `localStorage`, historial ni caché |
| Vinculación de apariciones del mismo `cid` desde fuera | Reconstruir el patrón de asistencia de alguien sin saber su nombre | Reseteo trimestral del `cid`, sin revocar el anterior. Dentro de un trimestre la vinculabilidad persiste (riesgo aceptado) |

## Custodia de las claves en el servidor del CCAV (ADR-0014, ADR-0015, ADR-0016)

La clave de emisión es el material más sensible del sistema, y desde ADR-0016 vive en el
mismo equipo servidor que `mi-app-qr/`.

| Amenaza | Riesgo | Control |
|---|---|---|
| Acceso al archivo de la clave de emisión | Emisión de tokens válidos fuera del sistema | PEM cifrado, legible solo por una cuenta propia del sistema operativo; la contraseña la escribe el custodio al arrancar el servicio y la clave queda solo en la memoria del proceso |
| Control del equipo servidor | Pedir tokens al servicio local de emisión | El servicio escucha solo en `127.0.0.1` y exige el secreto compartido de la instalación. Quien controle el equipo podría pedir tokens, pero no llevarse la clave |
| Contraseña en el entorno del proceso | Lectura por la misma cuenta o por el administrador del equipo | En el piloto, la contraseña se escribe en la terminal, no por variable de entorno |
| Custodio no disponible | Sin refirmado diario la lista vence (48 a 72 h) y todos los puntos de control rechazan | Respaldo del PEM de revocación en un medio externo cifrado y su contraseña en el gestor de Jhunier; si pasan 24 horas sin refirmado, Jhunier firma con el respaldo y queda anotado |
| Firmar la lista con la clave equivocada | El verificador deja de arrancar tras un reinicio y la lista vigente termina por vencer | El comando de firma se niega a reemplazar una lista firmada con otra clave, salvo rotación explícita |

## Anclaje real (ADR-0017)

| Amenaza | Riesgo | Control |
|---|---|---|
| La red Fabric la opera el propio proyecto | Quien opera la red podría reescribirla junto con la bitácora | Sellado diario de la última raíz en Bitcoin con OpenTimestamps, que no depende del proyecto ni de la universidad (ADR-0007) |
| Servidores de OpenTimestamps caídos o sin salida a internet | La raíz del día queda sin sellar | Los servidores públicos los mantienen voluntarios: el sello queda pendiente y se reintenta; Fabric sigue siendo el anclaje principal |
| Pérdida del ledger por reiniciar la red como en pruebas | Raíces ancladas que ya no se pueden consultar | La red se crea una sola vez y después solo se detiene y arranca (`unless-stopped`); respaldo semanal cifrado de volúmenes y material criptográfico |
| La raíz entra a Fabric pero el recibo no se registra | Lote anclado dos veces o ciclo trabado | `loteId` determinista; ante «ya registrado» se compara la raíz: si coincide se registra el recibo, si no se detiene y alerta |
| Fabric no responde por horas | Se amplía la ventana de riesgo residual (abajo) | Reintento cada 15 minutos y alerta en el panel tras 2 horas sin anclar |

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

## Ventana de riesgo residual

Entre que un evento se registra localmente y que su raíz de Merkle queda anclada existe
un intervalo en el que un adversario interno con acceso suficiente podría reescribir la
cadena local completa. Acortar el periodo de anclaje reduce la ventana; eliminarla del
todo exigiría anclar por evento, lo que el diseño descarta por latencia (ADR-0003).

**Este intervalo debe medirse y reportarse** en la evaluación del prototipo. Es un
resultado del trabajo, no una debilidad que ocultar.
