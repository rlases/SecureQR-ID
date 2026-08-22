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
| Abuso de privilegios | Alteración interna de la evidencia | Anclaje de raíces de Merkle en blockchain | `anchor` |
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
| Escucha de la red institucional | Captura de contraseñas y datos personales en tránsito por WiFi | Transporte cifrado — decisión pendiente en ADR-0008 |
| Secuestro de sesión | Suplantación de un usuario ya autenticado | Cookies de sesión con expiración, invalidación al cerrar sesión |
| Escalada entre roles | Un usuario de registro accede a informes o edita registros ajenos | Autorización por rol verificada en el servidor, nunca solo en la interfaz |
| Edición silenciosa de registros | Un administrativo corrige un registro sin dejar rastro | Corrección como evento nuevo con autor y motivo, nunca sobrescritura (ver ADR-0008) |
| Exposición del servidor fuera de la LAN | Acceso desde internet a datos personales | Escucha restringida a la red institucional; nunca exponer el puerto a internet |

## Fuera del alcance

Nombrarlo explícitamente es más honesto que dejarlo implícito, y anticipa la pregunta
en la sustentación.

**Cesión voluntaria.** Si el titular entrega su credencial a otra persona, el sistema la
acepta. Es un token válido presentado dentro de su ventana de vigencia. Mitigarlo exige
un segundo factor o biometría, fuera de esta fase.

**Omisión en el registro.** El modelo garantiza que un evento registrado no pudo
alterarse después. No garantiza que todo evento ocurrido se haya registrado. Un operador
que simplemente no escanea deja un hueco que la criptografía no cierra.

**Compromiso de la clave privada del emisor.** Si se filtra, el atacante emite
credenciales válidas indistinguibles de las legítimas. La mitigación es de custodia y
rotación (`kid` en el formato del token), no criptográfica.

**Ataque físico al punto de control.** Manipulación del hardware lector o del torniquete.

**Gobernanza de la red permisionada.** Si todos los nodos los opera la misma institución
cuyos registros se quieren proteger, el anclaje ofrece una garantía debilitada. Es una
limitación real del diseño, no un detalle de implementación. Ver ADR-0007.

## Ventana de riesgo residual

Entre que un evento se registra localmente y que su raíz de Merkle queda anclada existe
un intervalo en el que un adversario interno con acceso suficiente podría reescribir la
cadena local completa. Acortar el periodo de anclaje reduce la ventana; eliminarla del
todo exigiría anclar por evento, lo que el diseño descarta por latencia (ADR-0003).

**Este intervalo debe medirse y reportarse** en la evaluación del prototipo. Es un
resultado del trabajo, no una debilidad que ocultar.
