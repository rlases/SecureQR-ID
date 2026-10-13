# Decisiones de arquitectura (ADR)

Cada decisión de diseño se registra aquí **antes** de implementarse. Una decisión
superada no se borra: se marca como reemplazada y se conserva, porque su contexto explica
por qué el sistema es como es.

Estados: `Aceptada` · `Propuesta` · `Abierta` · `Reemplazada por ADR-XXXX`

---

## ADR-0001 — Firma ECDSA en lugar de RSA

**Estado:** Aceptada

**Contexto.** El payload de un código QR tiene una capacidad limitada. Una firma RSA de
2048 bits ocupa 256 bytes; una firma ECDSA sobre P-256 ronda los 64 bytes con un nivel de
seguridad equivalente. Más bytes en el payload significan un QR más denso, menos legible
por cámaras modestas y más frágil ante desgaste físico del carné.

**Decisión.** Se usa ECDSA para la firma de credenciales.

**Consecuencias.** El código QR se mantiene legible en impresión sobre carné plástico.
A cambio, ECDSA es más sensible a una generación defectuosa de aleatoriedad: un nonce
de firma reutilizado revela la clave privada. Esto obliga a usar exclusivamente
implementaciones establecidas.

---

## ADR-0002 — La blockchain almacena solo raíces de Merkle

**Estado:** Aceptada

**Contexto.** Anclar cada evento de acceso individualmente es inviable por latencia y
costo, y anclar datos personales es irreversible e incompatible con la Ley 1581 de 2012.

**Decisión.** Solo se publica la raíz de Merkle de un lote de eventos. Ningún dato
personal ni identificador reidentificable llega a la cadena.

**Consecuencias.** La verificación de un evento puntual requiere la prueba de inclusión,
que la institución debe conservar y poder entregar. La blockchain sola no permite
reconstruir el historial, y eso es deliberado: es una notaría, no un almacén.

---

## ADR-0003 — Bitácora local encadenada, no transacción por evento

**Estado:** Aceptada

**Contexto.** Inspirado en la separación entre registro de alta frecuencia y comprobación
criptográfica que propone WedgeBlock (Singh et al., 2023).

**Decisión.** Los eventos se encadenan por hash localmente; el anclaje externo es
asíncrono y periódico.

**Consecuencias.** El paso por el punto de control no depende de la red blockchain. Si la
red falla, el sistema sigue operando y los eventos se anclan después. La ventana entre
el registro y el anclaje es un intervalo de riesgo residual que debe documentarse y
acotarse.

---

## ADR-0004 — Tokens efímeros con nonce, no QR estático

**Estado:** Aceptada

**Contexto.** Un QR estático es reutilizable: quien lo captura puede replicarlo
indefinidamente. Es el vector documentado como QRLjacking por OWASP y confirmado en
despliegues reales por Zhang et al. (2025).

**Decisión.** Todo token lleva marca temporal, expiración corta y nonce de un solo uso.
Un nonce ya visto invalida la presentación aunque la firma sea correcta.

**Consecuencias.** Exige que el verificador mantenga estado de nonces vistos y que el
portador pueda regenerar su token, lo que implica una app o pantalla. Un carné impreso
con QR fijo no es compatible con este modelo — decisión con impacto operativo real
sobre el piloto en la UNAD.

---

## ADR-0005 — Stack de implementación

**Estado:** Aceptada

**Contexto.** El SDK de Hyperledger Fabric para Python no tiene mantenimiento activo;
el oficial y mantenido es el de Node.js (`fabric-network`). Python, por su parte, ofrece
mejor ergonomía para la parte criptográfica y para el análisis estadístico de la fase de
evaluación.

**Opciones consideradas.** (a) Todo en Node.js. (b) Todo en Python, con un puente mínimo
a Fabric. (c) Repositorio políglota: Python para `issuer`/`verifier`/`evidence-log`, Node
para `anchor`.

**Decisión.** Opción (c) — repositorio políglota:

- **Python** para `issuer/`, `verifier/`, `evidence-log/` — mejor ergonomía para
  criptografía (librerías como `cryptography`) y para el análisis estadístico de la fase
  de evaluación, que también es Python.
- **Node.js/TypeScript** para `anchor/` — el SDK oficial y mantenido de Hyperledger
  Fabric (`fabric-network`) es Node; usar el SDK de Python sin mantenimiento activo para
  la pieza que más depende de Fabric sería la peor combinación posible. Consistente,
  además, con `mi-app-qr/server` y `mi-app-qr/client`, que ya son Node/TypeScript.

**Consecuencias.**

- Dos toolchains en el mismo repositorio: `pyproject.toml`/`requirements.txt` (o
  equivalente) para los módulos Python, `package.json` para `anchor/` — igual que ya
  conviven `mi-app-qr/server`, `client` y `shared` como paquetes Node independientes.
- El puente entre `evidence-log/` (Python) y `anchor/` (Node) es un límite de proceso
  real, no una llamada de función — probablemente `evidence-log/` expone los lotes de
  eventos a anclar en un formato serializado simple (JSON/archivo) que `anchor/` consume,
  sin que ninguno de los dos importe código del otro directamente. Definir el contrato
  exacto es trabajo de quien implemente `evidence-log/`/`anchor/`, no de este ADR.
- `issuer/`, `verifier/`, `evidence-log/` deben seguir las mismas convenciones de calidad
  que ya rigen para el resto del repositorio (TDD, PR + revisión cruzada, sin datos
  reales en pruebas) — el framework de pruebas de Python (pytest, recomendado) y su job
  correspondiente en `.github/workflows/ci.yml` quedan pendientes de agregar cuando
  arranque la implementación real (ver `CONTRIBUTING.md`).

**Actualizado en consecuencia:** `CLAUDE.md` (sección "Comandos" y "Trampas conocidas").

---

## ADR-0006 — Forma canónica: CCAV Pitalito

**Estado:** Aceptada

**Contexto.** Los documentos fuente del proyecto alternan entre "CCAV Pitalito" y
"CEAD Pitalito" para la misma sede, lo que un jurado detecta como inconsistencia.

**Decisión.** La forma canónica en código, documentación y publicaciones es
**UNAD CCAV Pitalito**. Verificar contra la denominación oficial vigente de la UNAD antes
de la entrega final.

---

## ADR-0007 — Red blockchain y su gobernanza

**Estado:** Aceptada

**Contexto.** Se planteó Hyperledger Fabric por ser permisionada, con control de
participantes y gobernanza definida. Pero una red permisionada operada por la misma
institución que podría querer alterar los registros ofrece una garantía debilitada:
si la UNAD controla todos los nodos, el anclaje no protege contra la UNAD — la
evidencia se reduce a "confía en nosotros", justo lo que este diseño existe para evitar.

**Opciones consideradas.**

- **(a) Pares independientes reales en la red Fabric.** Exige que otra institución
  (otra sede, una universidad aliada, un ente regulador) opere un nodo de verdad. Para
  el alcance de este trabajo de grado, en el CCAV Pitalito, no existe hoy esa relación
  institucional — cualquier "par independiente" sería simulado, y un par simulado no
  resuelve nada: sigue siendo la UNAD confiando en la UNAD, solo que con más pasos.
  Queda descartada para esta fase, no porque sea mala idea, sino porque no es real
  todavía.
- **(b) Reemplazar Fabric por anclaje directo en una cadena pública.** Elimina el
  problema de gobernanza de raíz, pero descarta el diseño ya cerrado en ADR-0002/0003
  (bitácora local encadenada + anclaje asíncrono de raíces de Merkle) y reabre ADR-0005
  (que fijó Node.js específicamente porque el SDK de Fabric es el mantenido). Cambiar de
  arquitectura para resolver un problema que tiene una solución más barata (ver (c)) no
  se justifica.
- **(c) Anclaje híbrido: Fabric interno + sellado periódico en cadena pública.** Se
  conserva `anchor/` tal como ya está diseñado — Fabric sigue dando la propiedad rápida,
  local y consultable de "esto se registró en tal momento, en tal orden", operada por la
  institución. Periódicamente, la raíz vigente de la ledger de Fabric se sella además
  mediante **OpenTimestamps** — un protocolo abierto que ancla hashes arbitrarios en la
  cadena de Bitcoin, sin costo (agrupa las solicitudes de muchos usuarios en una sola
  transacción periódica) y sin infraestructura propia que mantener.

**Decisión.** Opción (c). Dos niveles de anclaje, no uno:

1. **Nivel operativo — Hyperledger Fabric**, como ya establecen ADR-0002, ADR-0003 y
   ADR-0005. Sin cambios sobre lo ya diseñado.
2. **Nivel de no repudio externo — OpenTimestamps sobre Bitcoin.** `anchor/` sella
   periódicamente (p. ej. una vez al día) la raíz vigente de la ledger de Fabric. El
   resultado es un comprobante (`.ots`) verificable por cualquiera, indefinidamente, sin
   depender de que la UNAD coopere ni de que sus servidores sigan existiendo — la
   seguridad de esa capa la da Bitcoin, no la institución.

Esto es lo que responde la objeción real: la UNAD puede alterar su propia Fabric, pero
no puede alterar retroactivamente lo que ya quedó sellado en una cadena pública que no
controla. La garantía deja de ser "confía en nosotros" y pasa a ser "verifícalo tú
mismo, con herramientas públicas".

**Consecuencias.**

- `anchor/` gana una dependencia nueva (una librería de cliente OpenTimestamps —
  `opentimestamps-client` en Python es la implementación de referencia, o el paquete de
  Node equivalente si conviene mantener `anchor/` en un solo lenguaje) y un job
  periódico adicional, separado del anclaje en Fabric.
- Los comprobantes `.ots` son datos públicos por diseño (son hashes, nunca información
  personal — mismo principio que ya rige el resto del anclaje) y deben conservarse junto
  a la raíz que sellan para poder exhibir la prueba de no repudio ante el jurado o ante
  una auditoría externa.
- La confirmación en Bitcoin no es inmediata (puede tardar hasta varias horas) — el
  nivel operativo (Fabric) sigue siendo la fuente de verdad para la validación en el
  punto de control; el sellado público es una capa de refuerzo asíncrona, no bloquea
  nada del flujo de `verifier/`.
- Camino de evolución, no parte de esta decisión: si la UNAD suma en el futuro
  instituciones aliadas reales como pares de Fabric, la opción (a) vuelve a ser viable
  como defensa adicional — no compite con el sellado público, lo refuerza.
- Issue #9 (`anchor/`) queda desbloqueado por este ADR, aunque sigue bloqueado en la
  práctica por `evidence-log/` (issue #7), que todavía no existe.

---

## ADR-0008 — `mi-app-qr` pasa de app monopuesto a servidor en red con usuarios

**Estado:** Propuesta

**Contexto.** Hoy `mi-app-qr/` es una aplicación de escritorio de un solo puesto: los
registros viven en el `localStorage` del equipo donde corre. Eso implica que solo una
persona registra, que los datos no se comparten, y que no hay forma de saber quién hizo
qué. El requerimiento nuevo es que, al ejecutarse, la aplicación levante un servidor
accesible por su IP en la red institucional, con inicio de sesión, para que varias
personas del CCAV puedan registrar, consultar, corregir y generar informes desde sus
propios equipos.

**Decisión.** `mi-app-qr/` evoluciona a cliente-servidor: el proceso de escritorio actúa
como servidor en la red local y sirve una interfaz web a los demás puestos. Los usuarios
que inician sesión son **exclusivamente personal institucional** (vigilancia,
administrativos, docentes), con roles diferenciados. El estudiante nunca inicia sesión:
solo presenta su credencial QR.

**Consecuencias — y no son menores:**

- **`localStorage` deja de servir.** Se necesita almacenamiento persistente compartido y
  con control de concurrencia. Es un cambio de fondo, no un ajuste.
- **Aparece gestión de identidades donde antes no había ninguna.** Contraseñas
  (con hashing mediante librería establecida, nunca propia — ver `SECURITY.md`),
  sesiones, cierre de sesión, bloqueo de cuentas. Todo eso es superficie de ataque nueva.
- **Los datos personales dejan de vivir en un solo equipo y pasan a viajar por la red.**
  Bajo la Ley 1581 de 2012 esto exige control de acceso por rol y trazabilidad de quién
  consultó o modificó qué. El modelo de amenazas se actualiza en consecuencia
  (ver `THREAT-MODEL.md`).
- **Tensión real con el invariante append-only de `evidence-log/`.** La app actual
  permite *editar* registros (`EditRecordModal`). Si el servidor conserva esa operación
  tal cual, y más adelante los eventos alimentan la bitácora encadenada, se rompe la
  invariante central del modelo. La salida es que una "corrección" se registre como
  **evento correctivo nuevo**, con autor y motivo, en lugar de sobrescribir el anterior.
  Conviene adoptar esa forma desde ya, aunque `evidence-log/` no exista todavía: migrar
  después datos ya sobrescritos es imposible.
- **Condiciona ADR-0005.** Si el servidor nace dentro del proceso Electron, el stack de
  esta parte queda de hecho en Node.js. Debe resolverse junto con ADR-0005, no aparte.

**Transporte, cerrado (issue #51).** HTTP plano en la LAN institucional exponía las
credenciales del personal a cualquiera que escuchara la red WiFi. Mecanismo elegido:
**certificado autofirmado por instalación**, generado por el propio proceso Electron
(`mi-app-qr/src/lib/tls.js`, vía la librería `selfsigned`) en el primer arranque y
persistido en `userData/tls/`, sin autoridad certificadora externa — el equipo que actúa
como servidor es también quien lo emite. Se descartaron las otras dos opciones
planteadas: una CA interna es infraestructura desproporcionada para un único servidor
por CCAV, y un certificado de una CA pública exige un dominio público que este
despliegue LAN no tiene.

Detalle de la implementación:

- El certificado cubre `localhost`, `127.0.0.1` y las IP LAN de la máquina en el
  momento de generarlo (`subjectAltName`), y se regenera automáticamente si esas IP
  cambian (red con DHCP) — nunca cambia solo por caducar, la validez es de 10 años para
  no forzar una redistribución frecuente a los equipos del CCAV.
- `mi-app-qr/server` sirve por HTTPS cuando recibe `TLS_CERT_PATH`/`TLS_KEY_PATH` por
  variable de entorno (así los pasa `main.js`) y sigue sirviendo por HTTP plano sin
  ellas — el caso de `npm run dev` fuera de Electron. La cookie de sesión se marca
  `secure` exactamente cuando el transporte es HTTPS (`express-session` la omite sobre
  HTTP si `secure: true`, así que forzarla siempre habría roto el login en dev).
- La ventana de Electron confía explícitamente en ese certificado exacto vía
  `session.setCertificateVerifyProc` (comparando el PEM completo, no el hostname) —
  nunca se desactiva la verificación TLS de forma general
  (`ignore-certificate-errors`), solo se acepta esa huella puntual.
- **Distribución a los demás equipos del CCAV:** cada navegador que acceda por IP verá
  la advertencia de certificado no confiable propia de un autofirmado — aceptado a
  propósito ("incómodo mientras lo mínimo defendible", texto original de esta decisión).
  El certificado vive en `userData/tls/cert.pem` del equipo servidor; instalarlo como
  raíz de confianza en cada equipo cliente del CCAV, si se decide hacerlo, es tarea
  operativa de TI, no un problema de código.
- **No reutiliza el mismo certificado que `verifier-web/` (ADR-0012).** Son necesidades
  independientes: `verifier-web/` exige HTTPS bajo el mismo origen en un despliegue
  potencialmente distinto (no necesariamente la misma LAN ni el mismo ADR-0008), así
  que comparte el patrón (autofirmado, sin CA externa) pero no el archivo de
  certificado ni el mecanismo de generación.

**Pendiente de decidir.**

- Qué se audita y por cuánto tiempo se conserva.
- Descubrimiento del servidor por los demás puestos: IP fija, nombre en la red o
  configuración manual.
- Estrategia de respaldo del almacenamiento (el motor en sí ya se resolvió de facto,
  ver nota abajo).

(El catálogo de roles, que estaba pendiente aquí, se resolvió en ADR-0009. El motor de
almacenamiento también quedó resuelto de facto: SQLite embebido vía `better-sqlite3`, ya
implementado en `mi-app-qr/server` desde la fundación del servidor — nunca se volvió a
esta sección para cerrarlo formalmente hasta ahora. Sin estrategia de respaldo definida
todavía, eso sigue abierto.)

**Aclaración de foco (2026-08-20).** El texto original de esta decisión mezclaba dos
cosas distintas bajo "registrar, consultar, corregir y generar informes": el propósito
**principal** del cliente multiusuario y una capacidad secundaria. Quedando explícito:

- **Foco principal:** gestión, verificación y extracción de datos — consultar registros,
  generar informes, administrar usuarios (`Dashboard`, `Informes`, `Usuarios`). Es un
  módulo de administración y ajustes, no una terminal de registro.
- **Capacidad secundaria, no el objetivo:** el personal con sesión (incluidos docentes)
  también puede registrar una entrada/salida directamente desde el cliente
  (`RegistrosPage`), sin depender de escanear un QR en el punto físico de control. Es una
  funcionalidad valiosa —da más flexibilidad a un docente, por ejemplo— pero no es la
  razón de ser del servidor.

Esto no cambia nada ya construido (`RegistrosPage` sigue sin restricción de rol, cualquier
personal con sesión puede usarla — eso ya estaba bien) ni el trabajo en curso
(`UsuariosPage`, que encaja exactamente con el foco principal). Sí orienta la prioridad de
lo que sigue: `Dashboard` e `Informes` — el foco real del producto — van antes que
cualquier ampliación de `RegistrosPage`.

**Aplicación en el cliente (2026-09-26, issue #48).** Se descarta el
`EditRecordModal` migrado del prototipo: se elimina del cliente web y se conserva
`CorregirRegistroModal` como única vía de corrección, con motivo y permiso admin.
El aviso de salida olvidada se adapta al modelo actual: presenta el último evento
vigente de entrada, permite confirmación de otra entrada o revisión administrativa
mediante la corrección ya existente. Revisar no crea otra entrada automáticamente.
No se interpreta una entrada como si tuviera un campo de salida editable; tampoco
se agrega una salida retrospectiva ficticia. La creación sigue disponible para todo
personal autenticado, como ya establece este ADR; el aviso no introduce permisos
nuevos ni sustituye controles del servidor.

---

## ADR-0009 — Modelo de roles genérico: permiso fijo + cargo en texto libre

**Estado:** Aceptada

**Contexto.** ADR-0008 dejó pendiente el catálogo de roles. La primera implementación
(`shared/src/types.ts`) fijó un `UserRole` con tres valores hardcodeados —
`'vigilancia' | 'administrativo' | 'docente'` — tomados literalmente del texto de
ADR-0008, sin que nadie los ratificara como decisión de producto. El problema no es solo
que "docente" no aplique fuera de un entorno educativo: es que **el proyecto debe poder
usarse en instituciones distintas a la UNAD**, y ningún catálogo cerrado de puestos de
trabajo generaliza a "cualquier institución" — la vigilancia de un CCAV no es lo mismo
que la recepción de una clínica ni la portería de una empresa, y una nueva institución no
debería requerir tocar el enum de TypeScript para dar de alta su propio vocabulario.

**Decisión.** Separar dos cosas que el diseño anterior mezclaba en un solo campo:

1. **Nivel de permiso** (`role`): fijo, universal, no depende de ninguna institución.
   Dos valores: `admin` (gestiona usuarios, ve todo) y `operador` (registra y consulta,
   no administra usuarios). Esto es lo único que la lógica de autorización del servidor
   puede depender — y precisamente por eso debe quedar chico y estable.
2. **Cargo** (`cargo`): texto libre, puramente descriptivo, sin efecto en autorización.
   Cada institución escribe el suyo al crear un usuario — "vigilancia", "docente",
   "recepción", lo que corresponda. Mismo principio que ya regía para `registros.rol`
   (nunca fue un enum) — aquí se extiende a `users`.

**Consecuencias.** El esquema de `users` gana una columna `cargo TEXT` nullable (no
rompe usuarios existentes, que quedan sin cargo asignado). El seed de administrador pasa
de `role: 'administrativo'` a `role: 'admin'`. Cualquier lógica de autorización futura
(quién puede ver Informes, quién puede administrar Usuarios) se escribe contra `role`
(`admin`/`operador`), nunca contra `cargo`.

**Principio general, no solo para roles — aplica hacia adelante en todo el proyecto:**
no hardcodear vocabulario específico de una institución en el modelo de datos ni en la
lógica del sistema. Lo que varía entre instituciones (nombres de puestos, terminología)
es configuración o texto libre; lo que no varía (niveles de permiso, invariantes de
seguridad) es lo único que se fija en el código. Esto no cambia lo ya documentado sobre
la UNAD y el piloto en CCAV Pitalito como caso de uso concreto de este trabajo de
grado (ver ADR-0006) — es sobre el diseño del software, no sobre a quién se le presenta
el proyecto.

---

## ADR-0010 — Esquema criptográfico y codificación canónica de `SQRID/1`

**Estado:** Aceptada

**Contexto.** ADR-0001 eligió ECDSA por su menor tamaño frente a RSA, pero dejó abiertas
la curva, la función hash, la representación de la firma y la serialización exacta. Sin
esas decisiones, `issuer/` y `verifier/` podrían firmar bytes distintos para el mismo
contenido. Además, una firma DER tiene longitud variable y una representación ECDSA con
`s` alto admite otra firma válida para el mismo mensaje, propiedades inconvenientes para
un token que debe ser compacto y canónico.

**Decisión.** La versión `SQRID/1` usa las reglas siguientes:

- Firma ECDSA con la curva NIST P-256 (`secp256r1`) y SHA-256, exclusivamente mediante
  una biblioteca criptográfica mantenida (`cryptography` en Python).
- Los campos firmados son el mapa formado por `v`, `kid`, `cid`, `iat`, `exp` y `n`.
  Se serializa como CBOR determinista conforme a RFC 8949. La firma nunca depende del
  orden de inserción de un diccionario ni de espacios o formato textual.
- El mapa final contiene exactamente esos seis campos y `sig`; no admite campos
  adicionales sin firmar. Un campo desconocido requiere una nueva versión del formato.
- La firma se transporta como `r || s` de ancho fijo: 32 bytes para cada entero, según
  la representación IEEE P1363. El emisor normaliza `s` al intervalo inferior de la
  curva (*low-S*), por lo que `sig` siempre ocupa 64 bytes y tiene una sola forma
  canónica. El mapa completo, ahora con `sig`, vuelve a codificarse como CBOR
  determinista.
- El token que se coloca en el QR es la codificación Base64url sin relleno del mapa CBOR
  completo. La versión sigue dentro del campo firmado `v`; no se añade un prefijo
  textual duplicado.
- `iat` y `exp` son enteros de segundos Unix en UTC. La duración se suministra mediante
  configuración externa y debe ser un entero positivo; no existe una vigencia por
  defecto en el código. La tolerancia de reloj del verificador se decidirá al
  implementar ese módulo y no cambia esta representación.
- `cid` es un identificador opaco de 128 bits generado con CSPRNG y representado en
  Base64url sin relleno. `n` contiene 128 bits nuevos de CSPRNG por cada token.
- `kid` son los primeros 128 bits de SHA-256 sobre la clave pública codificada como DER
  SubjectPublicKeyInfo, representados en Base64url sin relleno. Así el identificador se
  deriva de la clave utilizada y no puede configurarse por error con un valor ajeno.
- Para el prototipo, la clave privada se almacena fuera del repositorio como PKCS#8 PEM
  cifrado. La ruta y la contraseña se reciben por configuración; el módulo no devuelve
  la clave privada, no la registra y no sobrescribe un archivo de clave existente.

**Consecuencias.** El formato adquiere dependencias explícitas de `cryptography` y de
una implementación de CBOR determinista. `verifier/` deberá reconstruir exactamente el
mapa sin `sig`, exigir P-256/SHA-256, rechazar firmas que no midan 64 bytes o tengan `s`
alto, y luego convertir `r || s` al formato que requiera su biblioteca. La
serialización del contenido es determinista, aunque dos emisiones deliberadamente no
producen el mismo token porque el nonce del token y el nonce interno de ECDSA cambian.
Los 128 bits usados en `cid`, `kid` y `n` mantienen el payload acotado y ofrecen un
espacio suficiente para evitar colisiones en la escala del prototipo; la legibilidad
física del QR deberá medirse en la fase de evaluación.

---

## ADR-0011 — Política de tiempo, replay y revocación del verificador

**Estado:** Aceptada

**Contexto.** ADR-0010 fija los bytes y la firma de `SQRID/1`, pero deja al verificador
tres decisiones de seguridad que no pueden depender de valores implícitos: cuánto
desfase de reloj tolerar, cómo recordar nonces entre procesos y qué hacer cuando no se
puede consultar la revocación. Una implementación permisiva en cualquiera de esos
puntos aceptaría tokens fuera de vigencia, permitiría reutilizarlos tras reiniciar el
proceso o convertiría una caída del servicio de revocación en una autorización.

**Decisión.** El verificador aplica las reglas siguientes:

- El orden de validación es obligatorio: **firma, vigencia, nonce no visto y
  revocación**. Cualquier fallo detiene la cadena y produce el mismo rechazo público.
- La tolerancia de reloj (`clock_skew_seconds`) es configuración externa obligatoria,
  entera, sin valor por defecto y limitada al intervalo de 0 a 60 segundos. Un token
  solo está vigente si `iat <= now + skew`, `now < exp + skew` y `exp > iat`.
- El último tiempo observado se conserva en el mismo almacenamiento persistente. Si
  `now + skew` queda por debajo de ese máximo, el reloj se considera inconsistente y
  la verificación falla cerrada. El máximo solo avanza; reiniciar el proceso no borra
  esta protección.
- Los nonces aceptados se guardan en SQLite fuera del repositorio, con clave primaria
  `(kid, nonce)` y vigencia mínima hasta `exp + skew`. El modo en memoria no es válido
  para producción. Las filas solo se purgan cuando el token ya no puede ser aceptado.
- La consulta de existencia ocurre en la etapa de nonce, antes de revocación. Después
  de superar revocación, el nonce se consume con una inserción atómica y única; así,
  ante verificaciones concurrentes, solo una puede aceptar el token. Un rechazo por
  revocación o por indisponibilidad no consume el nonce.
- La revocación se consulta mediante una interfaz inyectada y obligatoria. No existe
  implementación permisiva ni lista vacía por defecto. Una excepción, una respuesta
  inválida o la indisponibilidad del servicio se interpretan como rechazo.
- Las claves públicas de confianza se resuelven desde un directorio externo mediante
  archivos `<kid>.pem`. Cada clave debe ser P-256 y su `kid` se vuelve a derivar de su
  DER SubjectPublicKeyInfo; la comparación se hace en tiempo constante. Una clave
  desconocida, mal formada o cuyo identificador no coincida causa rechazo.
- Todos los rechazos exponen el mismo resultado genérico y no revelan qué etapa falló.
  Los registros internos solo incluyen códigos estables de motivo; nunca incluyen el
  token, `cid`, `kid`, nonce, firma, material de clave ni mensajes de excepción.

**Consecuencias.** El verificador necesita configuración explícita para el desfase de
reloj, un directorio de claves, una base SQLite persistente y una implementación real
de revocación antes de poder aceptar tokens. La disponibilidad se sacrifica de forma
deliberada cuando cualquiera de esas dependencias no es confiable. La inserción atómica
final resuelve carreras sin alterar el orden lógico exigido: el nonce se consulta antes
de revocación y se confirma inmediatamente después. El módulo se limita a decidir si
el token es aceptable; no firma, no ancla y no registra el evento de acceso aceptado.

---

## ADR-0012 — Frontera web y privacidad del portal de verificación

**Estado:** Aceptada

**Contexto.** El motor de `verifier/` decide de forma local y fail-closed, pero un punto
de control necesita capturar el QR y presentar el resultado a una persona operadora. Si
la interfaz web decodifica campos, conserva tokens o replica reglas criptográficas, se
crea una segunda implementación menos confiable y una nueva fuente de exposición. A la
vez, integrar el portal en `mi-app-qr/` borraría la separación entre el prototipo QR
convencional usado como línea base y el modelo SecureQR-ID que se quiere evaluar.

**Decisión.** El portal sigue estas reglas:

- `verifier-web/` es una aplicación React + TypeScript independiente. No importa código
  de dominio de `mi-app-qr/` ni modifica su comportamiento.
- El navegador solo captura el texto completo del QR y lo envía por `POST` a
  `/api/verify`. No decodifica CBOR, no inspecciona campos y no ejecuta ninguna regla de
  firma, tiempo, replay o revocación.
- El adaptador HTTP se construye mediante una factory que recibe una instancia de
  `Verifier` ya configurada. No crea claves, almacenamiento, reloj o revocación por
  defecto. Una excepción inesperada también devuelve el rechazo público genérico.
- El cuerpo admite exclusivamente un token textual de hasta 4096 caracteres. La
  respuesta pública contiene solo `accepted` y el mensaje genérico correspondiente;
  `cid`, `kid`, nonce, firma y códigos internos nunca llegan al navegador.
- Los fotogramas de cámara se procesan localmente mediante una biblioteca QR mantenida.
  No se transmiten, capturan ni persisten. Después de detectar un token, la cámara se
  detiene mientras se verifica para impedir solicitudes duplicadas.
- El historial de la sesión conserva en memoria únicamente hora y decisión
  aceptar/rechazar, con un máximo acotado. No usa `localStorage`, IndexedDB, cookies ni
  analítica, y desaparece al recargar.
- Fuera de `localhost`, portal y API se sirven bajo el mismo origen con HTTPS. HTTP plano
  en una LAN expondría el token capturado y además no ofrece el contexto seguro que las
  APIs de cámara requieren.
- La interfaz nunca diferencia públicamente firma inválida, expiración, replay,
  revocación o dependencia caída. Sí puede distinguir un fallo de transporte cuando la
  API no responde, porque todavía no existe una decisión criptográfica que ocultar.
- La experiencia cumple contraste WCAG AA, navegación por teclado, foco visible,
  anuncios de estado y `prefers-reduced-motion`. El movimiento comunica transición de
  estados y no es requisito para entender el resultado.

**Consecuencias.** Aparece un paquete frontend y una dependencia HTTP opcional en
`verifier/`, además de pruebas separadas para contrato, interacción y accesibilidad. El
portal puede evolucionar visualmente sin alterar la ruta criptográfica. Un despliegue
real necesita terminación TLS y una implementación de revocación disponible; el portal
no convierte la ausencia de esas piezas en un modo demostración permisivo. Registrar el
evento aceptado sigue perteneciendo a `evidence-log/` y queda fuera de esta interfaz.

---

## ADR-0013 — Registro de la validación aceptada en la bitácora encadenada

**Estado:** Propuesta

**Contexto.** `evidence-log/` (PR #43) y `verifier/` (PR #29) existían por separado: el
verificador decidía aceptar o rechazar sin que nada quedara encadenado, así que la capa
de consolidación local (pasos 8-9 del Algoritmo 1) no ocurría en ningún flujo real
(issue #45). Conectarlos obliga a decidir quién compone las dos piezas, qué se registra,
dónde vive la bitácora y qué pasa si escribir en ella falla. Además, la implementación
de `EvidenceLog` leía el último hash y luego insertaba sin transacción explícita: dos
validaciones concurrentes podían encadenar sobre el mismo predecesor (bifurcando la
cadena) y la conexión SQLite no podía usarse desde los hilos del servidor ASGI.

**Decisión.**

- `Verifier` no cambia ni conoce la bitácora. `secureqr_verifier.evidence` define el
  contrato `AcceptedEventRecorder` (la firma de `EvidenceLog.append_event`) y el
  envoltorio `RecordingVerifier`, que registra después de que `Verifier` ya decidió. El
  paquete `secureqr_verifier` no importa `evidence-log/`; la aplicación que despliega el
  punto de control construye `EvidenceLog` y lo inyecta. `evidence-log/` se instala en
  `verifier/` solo como dependencia de prueba, igual que `issuer/`.
- Solo se registran validaciones **aceptadas**, con `decision = "aceptado"`, el
  `credential_id` opaco que devolvió `Verifier`, el `verifier_id` de la instalación y la
  marca temporal del registro. Los rechazos no se registran: `REJECTED_RESULT` no lleva
  `credential_id` (ADR-0011) y registrarlos exigiría rediseñar `VerificationResult`, lo
  cual requeriría un ADR propio.
- `verifier_id` es configuración obligatoria por instalación (texto imprimible, sin
  espacios en los extremos, hasta 128 caracteres), sin valor por defecto.
- Hay **una bitácora por instalación de verificador**, en un archivo SQLite persistente
  fuera del repositorio y separado del almacén de nonces (p. ej.
  `/var/lib/secureqr-id/evidence.sqlite3` junto a `replay.sqlite3`): los nonces se
  purgan al vencer y la bitácora es append-only, así que sus ciclos de vida no se
  mezclan. `:memory:` solo es válido en pruebas.
- **Falla cerrado.** Si el registro no puede completarse (excepción, `credential_id`
  inválido, reloj no finito), la validación se rechaza con el resultado público genérico
  y solo se registra el código interno `evidence_log_unavailable` (o
  `credential_id_invalid`), sin token, `cid` ni texto de la excepción. Una aceptación
  sin evento rompería la capa de consolidación local.
- `EvidenceLog.append_event` lee el último hash e inserta dentro de una transacción
  `BEGIN IMMEDIATE`, protegida además por un candado en memoria; la conexión admite uso
  desde varios hilos. Varias instancias o procesos sobre el mismo archivo producen una
  cadena lineal.

**Consecuencias.** La capa de consolidación local ya ocurre en cada aceptación servida
por el adaptador HTTP cuando se le entrega un `RecordingVerifier`. Como `Verifier`
consume el nonce antes de que se registre el evento, una caída de la bitácora “quema” el
token presentado: el titular debe generar uno nuevo. Se acepta ese costo antes que
aceptar sin evidencia o reabrir el nonce. Queda el caso inverso: el evento puede quedar
registrado y la respuesta HTTP no llegar al portal; la bitácora refleja lo que el
verificador decidió, no lo que vio la persona operadora. El repositorio todavía no tiene
un punto de entrada de producción que construya el `Verifier` real; cuando exista (issue
#46 conecta allí `RevocationList`), debe envolverlo con `RecordingVerifier` y una
`EvidenceLog` persistente según esta decisión.

---

## ADR-0014 — Arranque de producción del verificador y clave de revocación dedicada

**Estado:** Propuesta

**Contexto.** `revocation/` (PR #44) firma y verifica listas, y su `is_revoked` coincide
con la interfaz `RevocationChecker` de `verifier/`, pero ningún código construía el
`Verifier` real: solo existían dobles de prueba (issue #46). Conectarlo exige decidir
dónde se compone el servicio, con qué clave se firma la lista y qué ocurre al arrancar
si la lista no es confiable. Además, `RevocationList.from_signed_bytes` aceptaba
firmas *high-S* de cualquier longitud, no ligaba el `kid` declarado a la clave usada y
convertía `cids = "abc"` en las revocaciones `"a"`, `"b"` y `"c"`.

**Decisión.**

- **Paquete de composición `verifier-service/`.** Es la capa de aplicación: construye
  `DirectoryKeyResolver`, `SqliteReplayStore`, `RevocationList`, `Verifier`,
  `EvidenceLog` y `RecordingVerifier` (ADR-0013), y entrega el resultado a
  `secureqr_verifier.web.create_app`. No contiene reglas de validación. Así ni
  `verifier/` importa `revocation/` o `evidence-log/`, ni el frontend `verifier-web/`
  arranca procesos Python. Se expone una fábrica para `uvicorn --factory`.
- **Configuración explícita por entorno**, todas obligatorias y sin valor por defecto:
  `SQRID_VERIFIER_ID`, `SQRID_TRUSTED_KEYS_DIR`, `SQRID_REVOCATION_KEYS_DIR`,
  `SQRID_REVOCATION_LIST_PATH`, `SQRID_REPLAY_DB_PATH`, `SQRID_EVIDENCE_DB_PATH` y
  `SQRID_CLOCK_SKEW_SECONDS`.
- **Clave de revocación distinta de la de emisión.** La clave privada del emisor no sale
  de `issuer/`, así que firmar listas con ella obligaría a `issuer/` a conocer el
  formato de revocación. Con una clave dedicada, comprometer o rotar una no afecta a la
  otra. Su `kid` se deriva igual que en `issuer/` (SHA-256 del SPKI DER, 16 bytes,
  base64url) y su clave pública vive en un directorio de confianza propio. El servicio
  rechaza arrancar si ambos directorios son el mismo o si la clave que firma la lista
  también está entre las de emisión: si no, una clave de revocación podría firmar
  tokens aceptables.
- **La lista se verifica como un token.** P-256/SHA-256, firma compacta de 64 bytes,
  *low-S*, sobre con exactamente `v`, `kid`, `iat`, `cids` y `sig`, `cids` como lista
  de textos no vacíos sin duplicados, y `kid` firmado igual al de la clave elegida.
- **Falla cerrado también al arrancar.** Si falta una variable, la lista no existe, no
  verifica o la firma una clave no autorizada, si la bitácora es `:memory:` o comparte
  archivo con los nonces, o si la bitácora existente no supera `verify_chain()`, el
  proceso termina con `StartupError` y no atiende ninguna verificación. El mensaje
  nombra la variable o la etapa, sin contenido de claves, listas ni credenciales.

**Consecuencias.** Existe un punto de arranque real con las tres capas sincrónicas
conectadas. La lista se carga una vez: aplicar una nueva exige reemplazar el archivo y
reiniciar, hasta que el issue #47 resuelva la distribución y recarga con conectividad
intermitente; tampoco hay todavía una política de antigüedad máxima sobre `iat`, que
pertenece a esa misma decisión. Una bitácora alterada deja el punto de control fuera de
servicio hasta que alguien la investigue: se prefiere eso a seguir encadenando sobre
una cadena rota. No existe aún una CLI para generar la clave de revocación ni firmar la
lista; hoy se hace desde Python.

---

## ADR-0015 — Distribución y frescura de la lista de revocación

**Estado:** Propuesta

**Contexto.** ADR-0014 carga la lista firmada una sola vez al arrancar. Un punto de
control del CCAV Pitalito puede perder la conexión con el lugar donde se publica la
lista durante horas, y la validación debe seguir siendo local y sincrónica
(`ARCHITECTURE.md`, capa 1). Hay que decidir cómo llega una lista nueva, cómo se aplica
sin reiniciar y qué hacer cuando la lista en disco es demasiado vieja (issue #47). Usar
indefinidamente una lista vieja acepta credenciales revocadas después; rechazar con
cada corte de red deja el punto de control inútil.

**Decisión.**

- **Pull con caché local, no push.** No existe un servicio central que pueda empujar
  la lista, y un push exige que el verificador acepte conexiones entrantes. El punto de
  control tira de la lista: el comando `python -m secureqr_verifier_service.sync`,
  lanzado por el sistema (cron o un temporizador de systemd), descarga la lista por
  HTTPS desde `SQRID_REVOCATION_URL`, la **verifica antes de tocar el disco** y la
  instala con reemplazo atómico (`os.replace`) en `SQRID_REVOCATION_LIST_PATH`. Si la
  red falla, el archivo anterior queda intacto. El transporte es solo un medio: la
  confianza viene de la firma, así que copiar el archivo a mano o por USB también sirve.
- **Recarga en caliente sin bloquear la validación.** `RevocationListCache` mantiene la
  lista vigente en memoria y, como máximo una vez cada
  `SQRID_REVOCATION_REFRESH_SECONDS`, revisa si el archivo cambió (tamaño y fecha de
  modificación) antes de leerlo. Es una lectura de disco local, sin red. Una lista
  nueva inválida se ignora y se conserva la vigente.
- **Antirretroceso.** Una lista solo reemplaza a la vigente si su `iat` firmado es
  posterior. Así nadie puede reinstalar una lista vieja, válidamente firmada, que no
  incluía revocaciones recientes. El comando de sincronización aplica la misma regla
  contra el archivo en disco. Una lista con `iat` en el futuro, más allá de la
  tolerancia de reloj, se rechaza: si no, fijaría el antirretroceso y bloquearía las
  listas legítimas siguientes.
- **Falla cerrado por lista vencida.** Si `now - iat` supera
  `SQRID_REVOCATION_MAX_AGE_SECONDS`, `is_revoked` lanza `RevocationError` y el
  `Verifier` rechaza con el código interno `revocation_unavailable` (ADR-0011). El
  umbral es configuración obligatoria, entre 60 segundos y 30 días, y debe superar
  holgadamente la cadencia de publicación más el corte de red que se quiera tolerar.
  En cuanto llega una lista fresca, la siguiente verificación vuelve a aceptar, sin
  reiniciar.
- **Arranque.** Una lista ausente o inválida sigue impidiendo el arranque (ADR-0014).
  Una lista válida pero vencida **no** lo impide: el servicio arranca y rechaza todo
  hasta que llegue una fresca, para recuperarse solo cuando vuelva la red sin depender
  de que alguien lo reinicie.

**Consecuencias.** La ventana de riesgo por revocación queda acotada y es configurable:
una credencial revocada puede aceptarse como mucho hasta que el punto de control
recibe la lista que la incluye, y nunca más allá de la antigüedad máxima. Quien publica
la lista debe volver a firmarla periódicamente aunque no cambie, para renovar su
`iat`; sin eso, todos los puntos de control empiezan a rechazar al vencerse el umbral.
Esto exige además relojes razonablemente sincronizados entre quien firma y quien
verifica, como ya ocurre con los tokens. No se resuelve aquí quién opera el servidor de
publicación ni la CLI para firmar listas.

---

## ADR-0016 — Registro de credenciales en `mi-app-qr` y portal del titular

**Estado:** Propuesta

**Contexto.** El `cid` es opaco (`docs/SQRID-1.md`): el token no lleva datos personales y
`verifier/` decide sin saber de quién es la credencial. La relación `cid` → persona tiene
que existir en algún lugar, y hoy no existe en ningún módulo: `issuer/` recibe el `cid`
ya hecho (`issue --cid`) y no guarda a quién pertenece. Además, el token dura poco
(ADR-0004), así que el teléfono del titular necesita pedir uno nuevo cada vez que lo va a
presentar, y para eso el servidor tiene que saber que quien lo pide es ese titular.
ADR-0008 dice hoy que el estudiante nunca inicia sesión. Por último, el `cid` se repite en
todos los tokens de un titular y permite vincular sus apariciones (`THREAT-MODEL.md`,
sección «Vinculabilidad del `cid`»).

**Opciones consideradas para la entrega del QR al teléfono.**

- **(a) Portal ligero para el titular, con código al correo institucional.** El titular
  escribe su correo, recibe un código de un solo uso y la página genera el QR al momento.
  Cambia ADR-0008 y suma superficie de ataque.
- **(b) Teléfono vinculado una sola vez.** Se registra el dispositivo con un código y
  luego pide tokens sin contraseña. Exige guardar un secreto en el dispositivo y
  gestionar su pérdida; es más complejo de construir y de explicar.
- **(c) QR generado en un punto de la sede.** Sin teléfono, pero poco práctico y no
  escala a varias entradas por día.
- **(d) Inicio de sesión con la cuenta institucional (OpenID Connect).** El titular entra
  con la misma cuenta de su correo universitario, sin código por correo, y hereda la
  autenticación de la universidad. Exige que TI registre la aplicación en el proveedor de
  identidad de la institución y que el servidor tenga salida a internet. Se deja como
  evolución si TI lo habilita, no como requisito del piloto.

**Opciones consideradas para dar de alta al titular.**

- **Alta presencial por un administrador**, con código de activación entregado en
  persona. Descartada: el alta debe ser autoservicio, sin trabajo manual por cada titular.
- **Autorregistro contra un padrón importado del sistema académico.** Descartada:
  depende de que la institución exporte y actualice periódicamente ese padrón, algo que
  no controla el proyecto.
- **Autorregistro con datos declarados por el titular.** Elegida: ver la decisión.

**Decisión.** Opción (a), con estas piezas:

1. **El registro vive en el servidor de `mi-app-qr`**, junto a sus usuarios, en el mismo
   SQLite (ADR-0008). Dos tablas nuevas: `titulares` (nombre, documento, correo
   institucional, y si el titular ya se activó) y `credenciales` (`cid`, titular, estado `vigente` / `reemplazada` /
   `revocada`, periodo de vigencia, quién la creó y cuándo). Se conserva el historial:
   un `cid` reemplazado nunca se borra, para poder auditar eventos antiguos de la
   bitácora. El vocabulario sigue ADR-0009: en el modelo de datos es «titular», no
   «estudiante», y el dominio del correo institucional es configuración.
2. **Alta por autorregistro, sin trabajo manual.** El titular entra al portal y escribe
   su correo universitario, su nombre y su documento, y acepta la autorización de
   tratamiento de datos (Ley 1581 de 2012). Solo se admiten correos del dominio
   institucional configurado. Si el código que recibe en ese correo es correcto, el
   servidor activa el registro y le crea su `cid` automáticamente. Reglas:
   - un registro activo por correo y uno por documento; si el documento ya está
     registrado con otro correo, el alta se detiene y queda para revisión de un `admin`
     (es el único caso que requiere intervención humana);
   - el nombre y el documento son **declarados**: lo único que el sistema comprueba es que
     quien se registra controla esa cuenta de correo institucional.
3. **Portal del titular** en el mismo servidor y con el mismo HTTPS (ADR-0008):
   - Inicio de sesión sin contraseña, igual para el alta y para cada sesión nueva: el
     titular escribe su correo institucional y recibe un código de un solo uso generado
     con CSPRNG. El servidor guarda solo su
     hash, el código vence a los 10 minutos, sirve una sola vez y admite como máximo
     5 intentos. Hay límite de solicitudes por correo y por IP.
   - La respuesta es la misma esté o no registrado el correo, para no revelar quién
     tiene credencial.
   - La sesión del titular es un tipo aparte, sin acceso a ninguna ruta del personal
     (`admin` / `operador`). Dura hasta el siguiente reseteo del `cid` o hasta que un
     `admin` la cierre (por ejemplo, ante un teléfono reportado como perdido), para no
     pedir un código por correo en cada ingreso.
   - La página no guarda el token en `localStorage`, en el historial ni en caché, igual
     que el portal de verificación (ADR-0012), y pide uno nuevo antes de que venza.
4. **Emisión.** Con la sesión del titular, el servidor busca su `cid` vigente y le pide
   el token a `issuer/` a través de un límite de proceso:
   `secureqr-issuer issue --cid=<cid>`, con signo igual porque un `cid` puede empezar con
   `-` (PR #66). `mi-app-qr` nunca lee la clave privada ni importa código de `issuer/`;
   recibe el token ya firmado. Hay límite de tokens por sesión.
5. **Consulta `cid` → persona.** Solo el permiso `admin` puede traducir un `cid` a una
   persona, y cada consulta queda registrada (quién, cuándo, qué `cid`), como exige la
   Ley 1581 de 2012. `verifier/`, `verifier-service/` y el portal público siguen sin
   conocer nombres. El vigilante, en el punto de control, solo ve «aceptada» o
   «rechazada». Es el `admin`, al revisar la bitácora y los informes, quien ve el nombre
   asociado a cada `cid`, y cada una de esas consultas queda registrada. No se recoge foto
   del titular: la revisión ocurre después del paso, sin la persona presente, así que una
   foto no aportaría control y sí más datos personales.
6. **Reseteo trimestral del `cid`.** Cada trimestre se crea un `cid` nuevo por titular y
   el anterior pasa a `reemplazada`. No se revoca: sus tokens vencen solos y el emisor deja
   de firmar con él. La revocación queda para credenciales comprometidas.
7. **Revocación.** Un `admin` marca una credencial como `revocada` en `mi-app-qr`, y esa
   lista alimenta la lista firmada de `revocation/` que se distribuye según ADR-0015.
8. **Línea base del objetivo 3.** Antes de implementar esta decisión se etiqueta la
   versión actual de `mi-app-qr` (por ejemplo `baseline-o3`). El pretest se hace contra
   esa etiqueta, que sigue siendo la aplicación sin controles.

**Consecuencias.**

- **Cambia ADR-0008.** Su frase «el estudiante nunca inicia sesión» pasa a decir: el
  titular no tiene contraseña; se autorregistra y abre sesión en el portal del titular
  con un código a su correo institucional, solo para obtener su QR y sin acceso a nada
  más.
- **`mi-app-qr` entra al flujo de SecureQR-ID** como registro de credenciales y portal
  del titular. Hay que actualizar `CLAUDE.md` y la sección «Relación con el prototipo
  existente» de `ARCHITECTURE.md`. La separación de código se mantiene: Node y Python se
  comunican por límite de proceso.
- **La clave privada vive en el equipo que corre `issuer/`.** Si es el mismo servidor de
  `mi-app-qr`, ese equipo pasa a custodiar el material más sensible del sistema. Su
  protección (PEM cifrado, contraseña por entorno, acceso al equipo) entra al modelo de
  amenazas.
- **Superficie de ataque nueva**, que debe sumarse a `THREAT-MODEL.md`:
  - un correo institucional comprometido equivale a una credencial comprometida;
  - fuerza bruta sobre el código y enumeración de correos;
  - suplantación del portal (*phishing*) para robar códigos;
  - robo de la sesión en el teléfono, que dura hasta el siguiente reseteo del `cid`
    (mitigado porque un `admin` puede cerrarla).
- **La identidad del titular es declarada, no verificada.** La garantía real es «quien
  presenta este QR controla esta cuenta de correo institucional», no «es la persona
  cuyo nombre aparece en el registro». Alguien con una cuenta del dominio (de otra sede,
  un funcionario, una cuenta de servicio) puede registrarse con un nombre que no es el
  suyo. Lo mitiga la regla de un registro por documento. Esto debe declararse en el
  modelo de amenazas y en el documento de grado.
- **El teléfono prestado sigue fuera de alcance.** Como nadie compara a la persona con su
  registro en el momento del paso, la cesión voluntaria no se detecta (ver
  `THREAT-MODEL.md`, «Fuera del alcance»). La revisión del `admin` en la bitácora es
  posterior: sirve para auditar quién figura como ingresado, no para impedir el préstamo.
- **Los datos los aporta el titular**, así que la autorización de tratamiento se recoge
  en el propio formulario de alta, y el titular debe poder corregirlos (con registro del
  cambio, como en ADR-0008).
- **Dependencia crítica: envío de correo.** Sin correo no hay alta ni inicio de sesión.
  El servidor necesita salida a un servidor de correo de la institución, y hoy escucha
  solo en la red local (ADR-0008). Hay que confirmar con TI del CCAV qué servidor de
  correo se puede usar desde ahí antes de aceptar esta ADR.
- **El titular necesita estar en la red del CCAV** para abrir el portal, porque el
  servidor no se expone a internet (ADR-0008). Es coherente con generar el QR en la
  entrada, pero hay que comprobarlo en el piloto.

**Pendiente de decidir.**

- En qué equipo corre `issuer/` y quién custodia la contraseña de la clave.
- Cómo pasa la lista de revocados de `mi-app-qr` a quien firma la lista de `revocation/`:
  exportación diaria o conexión directa.
- Vigencia del token (`SQRID_TOKEN_TTL_SECONDS`).
- Cuánto tiempo se conserva el registro de consultas `cid` → persona.
- Si se cierra el alta a una sede (por ejemplo, exigiendo indicar el CCAV) o queda
  abierta a todo el dominio.
