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
| Escucha de la red institucional | Captura de contraseñas y datos personales en tránsito por WiFi | HTTPS con certificado autofirmado por instalación (ADR-0008, issue #51) |
| Secuestro de sesión | Suplantación de un usuario ya autenticado | Cookies de sesión con expiración, invalidación al cerrar sesión, marcadas `secure` bajo HTTPS |
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
  anterior) y con un compromiso verificable de cada asignación `cid` → titular, por
  ejemplo registrándola en la bitácora encadenada con el identificador interno opaco del
  titular, nunca con datos personales. El mecanismo concreto queda pendiente para la
  implementación de ADR-0016 (#79 y #88).

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
