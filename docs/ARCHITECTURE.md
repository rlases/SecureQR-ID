# Arquitectura

> Estado: **implementación parcial**. `issuer/` y `verifier/` materializan la capa de
> validación y `evidence-log/` la de consolidación local, conectadas mediante
> `RecordingVerifier` (ADR-0013) y arrancadas juntas desde `verifier-service/`
> (ADR-0014). El anclaje real en Fabric y el sellado en OpenTimestamps están decididos
> en ADR-0017 y en implementación (issues #82 y #91 a #94); el registro de credenciales
> y el portal del titular, en ADR-0016.

## Principio rector

Un código QR **nunca es evidencia de identidad**. Es el transporte de un reclamo
criptográfico que solo tiene valor si una validación externa lo confirma en el instante
exacto de su presentación.

De ahí se derivan las tres capas del sistema, y la razón de que estén separadas.

## Las tres capas

### 1. Validación puntual (sincrónica, milisegundos)

Ocurre en el punto de control cuando alguien presenta su credencial. Debe ser local y
ultraligera: en un campus pasan cientos de personas por hora y ninguna espera a que una
transacción blockchain confirme.

Participan `issuer/` (emite el token; desde ADR-0016 corre como servicio local en el
servidor del CCAV), el portal del titular en `mi-app-qr/` (pide a `issuer/` un token
nuevo para el teléfono del titular), `verifier-web/` (captura y presenta) y `verifier/`
(en línea, decide).

### 2. Consolidación local (sincrónica, ligera)

Cada validación aceptada produce un evento que se encadena por hash al anterior. La
cadena vive en la infraestructura de la institución. Detecta cualquier modificación
posterior, incluso hecha por un administrador con privilegios.

Participa `evidence-log/`.

### 3. Anclaje histórico (asíncrono, periódico)

Un proceso en segundo plano agrupa los eventos recientes, construye un árbol de Merkle
y publica **solo la raíz** en una blockchain permisionada. Eso convierte la bitácora
local en algo verificable desde fuera de la institución.

Concretamente (ADR-0017): cada 15 minutos una tarea programada hace tres cosas.
`evidence-log/` **fija** un lote de hasta 500 eventos (lo registra en la tabla `lotes`,
de solo agregar, con su `loteId`, rango, raíz y fecha) y lo exporta; `anchor/` publica su
raíz en una red Hyperledger Fabric 2.5 propia mediante la Gateway API y un contrato en Go
que no deja sobrescribir un lote; y `evidence-log/` registra el recibo (transacción y
bloque) en la tabla `anclajes`, también de solo agregar, solo si corresponde al lote
fijado pendiente (misma raíz, rango y cantidad).

- **El `loteId` lleva la instalación:** `<verifier_id>:seq-<primero>-<último>`, para que
  dos instalaciones cuyas bitácoras empiezan en 1 no choquen en la misma red.
- **Reintentos seguros.** Mientras un lote fijado no tenga recibo, cada corrida vuelve a
  exportar exactamente ese rango, aunque lleguen eventos nuevos; así el `loteId` no
  cambia y, si la raíz ya había entrado a Fabric, la siguiente corrida recibe «ya
  registrado», consulta la raíz y reconstruye el recibo original. Si la raíz de Fabric no
  coincide con la del lote local, se detiene y alerta.
- **Alerta de 2 horas.** Al terminar cada corrida, el ciclo escribe un archivo de estado
  JSON (eventos pendientes, el más antiguo, último anclaje, `stale`) con reemplazo
  atómico. El servidor de `mi-app-qr/` solo lee ese archivo, sin abrir el SQLite de
  `evidence-log/` ni importar su código (ADR-0005), y alerta si `stale` es verdadero o si
  el archivo tiene más de 2 horas, lo que también detecta que la tarea programada dejó de
  correr.
- **Sellado diario.** Una vez al día se sella en Bitcoin, con OpenTimestamps, el **hash
  del último bloque del canal** de Fabric (consulta `GetChainInfo` de `qscc`), no la
  última raíz anclada: cada bloque compromete a todos los anteriores, así el sello cubre
  los lotes de todas las instalaciones de ese día y no solo los de una. Es lo que protege
  incluso contra quien opera la red Fabric (ADR-0007). Crear y completar el sello no
  necesita un nodo de Bitcoin, pero verificarlo de forma independiente (`ots verify`) sí:
  no se instala un nodo en el servidor del CCAV, y la verificación se hace
  periódicamente desde un equipo con Bitcoin Core podado, dejando constancia del
  resultado; el comprobante `.ots` permite que cualquiera lo verifique con sus medios.

Si Fabric no responde, se reintenta en la siguiente corrida sin afectar la validación.

Participa `anchor/`.

La separación entre la capa 2 y la 3 es el núcleo del aporte. Una arquitectura blockchain
pura —una transacción por cada paso por el torniquete— es inviable por latencia y costo.
Una bitácora puramente local es manipulable por quien la administra. El modelo toma la
inmediatez de la primera y la verificabilidad externa de la segunda.

## Flujo de validación

Corresponde al Algoritmo 1 del artículo. La implementación debe seguir este orden:

1. Decodificar el payload del QR (formato `SQRID/1`, ver `SQRID-1.md`).
2. Extraer identificador de credencial, marca temporal, nonce y firma.
3. **Verificar la firma** con la clave pública del emisor.
4. Comprobar vigencia de la marca temporal y consistencia del reloj.
5. Comprobar que el nonce no se haya visto antes.
6. Consultar la lista de revocación firmada.
7. Si algo falla → rechazar. Falla cerrado, siempre.
8. Calcular el hash del evento a partir de: id de credencial, id del verificador,
   marca temporal y hash del evento anterior.
9. Añadir el evento a la bitácora encadenada local.
10. *(Periódico, cada 15 min)* Fijar el lote de eventos aún no anclados (hasta 500) en
    `lotes`, con su `loteId` por instalación, y calcular su raíz de Merkle. Si ya hay un
    lote fijado sin recibo, se reutiliza el mismo rango.
11. *(Periódico, cada 15 min)* Anclar la raíz en la red Fabric y registrar el recibo en
    `anclajes` solo si coincide con el lote fijado; escribir el archivo de estado para
    el panel (ADR-0017).
12. *(Diario)* Sellar en OpenTimestamps el hash del último bloque del canal de Fabric
    (ADR-0007, ADR-0017).

El orden de los pasos 3–6 no es negociable: verificar la firma antes de procesar
cualquier otro campo evita trabajar sobre un payload no confiable.

## Módulos y fronteras

| Módulo | Responsabilidad | Frontera dura |
|---|---|---|
| `issuer/` | Firma ECDSA de tokens; custodia del par de claves institucional; servicio local de emisión (ADR-0016) | La clave privada no sale de aquí; el servicio solo escucha en `127.0.0.1` |
| `verifier/` | Decide aceptar o rechazar | No firma, no ancla |
| `verifier-web/` | Captura el QR y presenta la decisión | No interpreta el token, no decide, no persiste identificadores |
| `evidence-log/` | Encadena eventos por hash; append-only | No decide, solo registra lo aceptado |
| `anchor/` | Merkle; publicación de la raíz en Fabric (Gateway API, contrato en Go en `anchor/chaincode/`); sellado en OpenTimestamps (ADR-0017) | Solo ve hashes y números de evento, nunca datos personales |
| `revocation/` | Lista firmada de credenciales invalidadas | Su firma se verifica igual que la de un token; clave propia, distinta de la de emisión (ADR-0014) |
| `verifier-service/` | Arranque de producción: compone `verifier/`, `revocation/` y `evidence-log/` | No contiene reglas de validación; si una dependencia no es confiable, no arranca |
| `mi-app-qr/` (servidor) | Registro `cid` → titular, portal del titular y pedido de tokens a `issuer/` (ADR-0016) | Nunca firma ni conoce la contraseña de la clave: pide tokens al servicio local; no importa código de los módulos Python |

`evaluation/` no es un módulo del protocolo sino una **herramienta de evaluación**
(ADR-0019): la batería de ataques reproducible del objetivo 3. No firma, no valida y no
agrega reglas. Arma un despliegue de prueba en una carpeta temporal (claves de prueba,
lista firmada, las dos SQLite y un `verifier-service` real en `127.0.0.1`) y lo ataca
solo por sus interfaces públicas. Usa `issuer/` como librería para fabricar tokens y lee
el motivo de cada rechazo del registro interno del servicio; la respuesta pública sigue
siendo genérica (ADR-0012).

## Decisiones de arquitectura pendientes

Ninguna abierta por ahora. La distribución de la lista de revocación a verificadores
con conectividad intermitente se cerró en ADR-0015 (pull con caché local, recarga en
caliente, antirretroceso y rechazo cuando la lista supera su antigüedad máxima).

El stack se cerró en ADR-0005. La gobernanza de la red blockchain se cerró en ADR-0007:
anclaje híbrido — Hyperledger Fabric para la operación local, más un sellado periódico
del hash del último bloque de la ledger en Bitcoin vía OpenTimestamps para la garantía de no repudio que
no depende de la institución. La tolerancia de reloj, la persistencia y purga de nonces,
la atomicidad ante concurrencia y el comportamiento fail-closed de revocación se
cerraron en ADR-0011.

La frontera navegador/API, el tratamiento opaco del token y la ausencia de persistencia
en el portal se cerraron en ADR-0012.

## Lo que este diseño deliberadamente no resuelve

- No protege contra la entrega voluntaria de la credencial a un tercero. Un token válido
  presentado por quien no es su titular se acepta. Mitigarlo exigiría un segundo factor
  o biometría, fuera del alcance de esta fase.
- No garantiza que un evento se **haya registrado**; garantiza que, si se registró, no
  pudo alterarse después. La omisión deliberada en el momento de la escritura es un
  riesgo distinto y no cubierto.

## Relación con el prototipo existente (`mi-app-qr/`)

`mi-app-qr/` empezó como una aplicación de escritorio (Electron + React) de registro de
asistencia por QR, construida antes de este diseño. Es exactamente el sistema
convencional que el planteamiento del problema describe: decodifica un QR de **texto
plano** (nombre, documento, programa, ciudad y vigencia por expresión regular), sin
firma, sin nonce y sin bitácora encadenada.

**Línea base del objetivo 3.** Esa versión sin controles se conserva con la etiqueta
`baseline-o3` (ADR-0016, punto 11), que crea el issue #78 antes de implementar ADR-0016
en `mi-app-qr/`; mientras la etiqueta no exista, no hay línea base fijada y no debe darse
por conservada. El pretest de la fase de evaluación (Fase 4 de
`ROADMAP.md`) se hace contra esa etiqueta, para medir la reducción de suplantación y el
tiempo de registro del modelo SecureQR-ID frente a un sistema QR convencional real, tal
como plantea el diseño cuasi-experimental de la propuesta de grado.

**Servidor multiusuario (ADR-0008).** El prototipo pasó de monopuesto a
cliente-servidor: al ejecutarse levanta un servidor accesible por su IP en la red
institucional, con inicio de sesión para el personal, roles diferenciados y HTTPS con
certificado por instalación. Las correcciones se registran como eventos nuevos, nunca
como sobrescrituras, para no chocar con la invariante append-only de `evidence-log/`.

**Registro de credenciales y portal del titular (ADR-0016).** Desde esta decisión,
`mi-app-qr/` entra al flujo de SecureQR-ID:

1. Guarda la relación `cid` → titular (tablas `titulares`, `credenciales` con su
   historial y `dispositivos`), que antes no existía en ningún módulo. Solo un `admin`
   puede traducir un `cid` a una persona, y cada consulta queda registrada.
2. Ofrece el portal del titular: autorregistro desde la red del CCAV, teléfono vinculado
   con una llave de dispositivo y código de recuperación. El titular no tiene cuenta ni
   contraseña; el portal solo le sirve para obtener su QR.
3. Aplica las ventanas de horario del estamento **al emitir**: fuera de horario no pide
   token. El estamento no viaja en el token, así que `SQRID/1` no cambia y `verifier/`
   sigue sin conocer nombres ni roles.
4. Pide cada token al servicio local de `issuer/` (`127.0.0.1`, secreto compartido) y
   nunca conoce la contraseña de la clave.
5. Revoca en dos niveles: deja de emitir de inmediato y exporta los `cid` revocados para
   la lista firmada que llega al verificador (ADR-0015).

La separación de código se mantiene: `mi-app-qr/` es Node.js y se comunica con los
módulos Python solo a través de límites de proceso (el servicio local de `issuer/` y
archivos), nunca importando su código.
