# Manual de usuario de SecureQR-ID

Guía del prototipo de investigación de la Fase 4. Los nombres corresponden al cliente
actual de `mi-app-qr` y al portal `verifier-web`. La instalación del CCAV es opcional;
en cualquier instalación o demostración se utiliza la dirección que entregue el custodio.

## Quién utiliza cada pantalla

| Persona | Uso |
|---|---|
| Titular | Registra o vincula su teléfono y muestra su credencial temporal |
| Operador | Valida credenciales en el verificador; utiliza Registros e Informes si tiene cuenta |
| Administrador | Gestiona usuarios, titulares, estamentos, horarios y consultas de `cid` |
| Custodio técnico | Prepara claves y servicios; atiende alertas y actualiza la lista de revocación |

La cuenta del personal y el vínculo del teléfono son accesos distintos. Un titular
no necesita la contraseña de un operador para abrir su credencial.

## Acceder al sistema

1. Abre la dirección HTTPS indicada para la instalación.
2. Si eres personal, entra en `/login` con el usuario y la contraseña asignados.
3. Si eres titular, abre `/portal`. Desde ahí puedes registrarte o recuperar el vínculo.
4. Comprueba la dirección y la huella del certificado mediante la información publicada
   por el custodio. Ante una huella diferente, consulta antes de introducir datos.

Las credenciales iniciales del administrador las entrega el responsable técnico.
No hay una contraseña universal. Las contraseñas generadas se guardan en un gestor
y se entregan por un canal autorizado. La pantalla Usuarios permite crear cuentas;
esta versión no ofrece una pantalla para cambiar su contraseña.

## Registrar un teléfono y mostrar el QR

1. En `/portal`, elige **Registrarme**.
2. Lee el aviso de tratamiento de datos y completa el formulario de alta.
3. Si el alta se completa, guarda el código de recuperación: se muestra una sola vez.
4. Abre **Mi credencial** en el mismo navegador del teléfono vinculado.
5. Presenta el QR visible al punto de control. Se renueva automáticamente.

No necesitas fotografiar ni guardar el QR. Una captura puede vencer o quedar consumida
después de su primer uso. No compartas el teléfono vinculado ni el código de recuperación.

Un documento ya registrado puede dejar el alta **En revisión**. No repitas el registro:
el administrador debe resolverla. Si tu estamento está pendiente de confirmación,
la pantalla lo indica y se aplica el horario del estamento base. Fuera de horario
o con la credencial suspendida, el portal no entrega un QR nuevo.

## Cambiar de teléfono o recuperar el acceso

1. Abre `/portal/recuperar` en el teléfono nuevo.
2. Introduce tu documento y el código de recuperación vigente.
3. Conserva el código nuevo que se entrega al completar la recuperación.
4. El teléfono anterior deja de estar vinculado.

Si perdiste el código, contacta al administrador. Los intentos incorrectos repetidos
pueden bloquear temporalmente la recuperación. Un código provisional entregado por
el administrador vence a las 72 horas; canjéalo mediante el mismo formulario.

## Validar una credencial

Utiliza la dirección del portal **SecureQR-ID** indicada para el punto de control.
La pantalla administrativa Registros no sustituye esta validación criptográfica.

1. Comprueba que el servicio aparece disponible.
2. Activa la cámara y autoriza su uso en el navegador.
3. Encuadra el QR actual del teléfono. El lector se detiene al obtenerlo.
4. Espera el resultado antes de presentar otra credencial.
5. Inicia la siguiente validación con el control que muestra la pantalla.

Si la cámara no está disponible, utiliza la entrada manual del token. No interpretes
ni modifiques su contenido. La pantalla borra el texto al enviarlo.

| Resultado | Qué hacer |
|---|---|
| Aceptado | La credencial superó los controles de esa presentación; sigue el procedimiento del punto de control |
| Rechazado | No autorices el paso por ese resultado; pide al titular su QR actual y, si persiste, consulta al custodio |
| Servicio no disponible o error de conexión | Comprueba la conexión y avisa al custodio; un fallo técnico no equivale a aceptación |

El rechazo no revela qué control falló. Un QR ya aceptado puede rechazarse al repetirlo:
el uso del nonce es único. Un resultado aceptado verifica el token, no la identidad
física de la persona. El historial visible de esta pantalla es temporal y no contiene
nombres ni tokens; no reemplaza la bitácora técnica.

La decisión de `verifier-web` registra evidencia de validación en su servicio.
No crea automáticamente un registro de asistencia en la pantalla Registros de
`mi-app-qr`: son operaciones distintas del prototipo.

## Registros administrativos e informes

En el menú **Registros** del cliente del personal:

1. Completa nombre, documento y rol; también puedes rellenar el formulario con el texto
   del QR del carné tradicional mediante el control de lectura.
2. Revisa los datos y selecciona **Entrada** o **Salida**.
3. Pulsa **Registrar entrada** o **Registrar salida** y espera la confirmación.
4. Si se advierte que existe una entrada abierta, revisa el registro anterior antes
   de confirmar una entrada nueva o utilizar el flujo de corrección.

Una lectura de texto que rellena el formulario no comprueba la firma SQRID/1.
No la presentes como evidencia de que una credencial segura fue validada.

**Ver historial** permite consultar la trazabilidad de un registro. El control
**Corregir**, cuando tu permiso lo autorice, requiere un motivo y conserva el registro
anterior como parte de la cadena de correcciones. No intentes editar la base de datos.

**Exportar CSV** permite descargar los registros según los controles de la pantalla.
**Informes** presenta los datos y filtros disponibles; revisa los filtros antes de
exportar. Los archivos pueden contener datos personales: consérvalos únicamente en
la ubicación autorizada por la instalación.

## Administración

Estas opciones solo aparecen para una cuenta con permiso de administrador.

- **Usuarios:** indica usuario, cargo y permiso; pulsa **Crear usuario**. Copia la
  contraseña generada en ese momento y entrégala a su destinatario de forma segura.
- **Estamentos:** configura el estamento base, los que requieren confirmación y sus
  horarios. Revisa la zona horaria de la instalación con el custodio.
- **Titulares:** consulta el estado y resuelve altas en revisión. Lee la explicación
  de **Aprobar**, **Rechazar alta** o **Reemplazar registro** antes de confirmar.
  Reemplazar puede levantar una suspensión previa; no equivale a una aprobación inocua.
- **Revocar credencial:** suspende al titular y corta la emisión. El custodio debe
  firmar y distribuir la lista actualizada para bloquear tokens ya emitidos en los
  verificadores, sin esperar a que venzan.
- **Desvincular teléfono:** corta el vínculo de ese dispositivo. **Reactivar titular**
  crea una credencial nueva; no vuelve válida la que fue revocada.
- **Consulta de cid:** requiere un motivo y deja constancia de la consulta. Úsala
  solo para una necesidad autorizada, sin copiar resultados en canales públicos.

No escribas nombres, documentos ni correos en los motivos libres. Los avisos de
integridad o de anclaje se comunican al custodio; no se resuelven eliminando registros.

## Problemas habituales

| Situación | Acción |
|---|---|
| No puedes iniciar sesión | Revisa las credenciales; tras cinco fallos la cuenta puede bloquearse 15 minutos |
| Este teléfono no está vinculado | Regístralo o utiliza el código vigente de recuperación |
| Credencial suspendida | Solicita revisión al administrador; no repitas el alta |
| No se genera el QR | Revisa el estado y horario; el custodio comprobará el servicio de emisión |
| Cámara denegada | Revisa el permiso del navegador o utiliza la entrada manual |
| Alerta de anclaje | Avisa al custodio para revisar la tarea programada y Fabric |
| Alerta de integridad | Conserva el aviso y detén la consulta afectada; el custodio debe investigar |

Al comunicar un incidente indica hora, pantalla y texto del aviso. No adjuntes
contraseñas, códigos de recuperación, claves privadas ni capturas de QR vigentes.

## Terminar la sesión

El personal pulsa **Cerrar sesión**, especialmente en equipos compartidos. El titular
conserva el vínculo de su teléfono en el navegador; borrar sus datos puede requerir
recuperación. La retirada de datos y el cierre de una eventual medición los aplica el
responsable mediante el procedimiento del [manual técnico](MANUAL-TECNICO.md).
