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

**Enmienda (ADR-0017).** `fabric-network` dejó de publicar versiones estables y la
documentación de Fabric remite a la Fabric Gateway client API; `anchor/` se conecta con
`@hyperledger/fabric-gateway`, que sigue siendo Node. La decisión de lenguaje para
`anchor/` no cambia. Se suma **Go** solo para el contrato que corre dentro de la red
Fabric, porque el soporte de contratos en Node lleva casi dos años sin versiones. Detalle
en ADR-0017.

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
  ver nota abajo). Resuelta en ADR-0018 (2026-10-26).

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

**Estado:** Aceptada (2026-10-12)

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

**Estado:** Aceptada (2026-10-12)

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

**Estado:** Aceptada (2026-10-12)

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
verifica, como ya ocurre con los tokens. No se resuelve aquí la CLI para firmar listas.

**Operación en el piloto del CCAV Pitalito (acordado 2026-10-12).** Quien administra el
despliegue de `verifier-service/` en el piloto custodia la clave privada de revocación y
vuelve a firmar la lista: será **Duverney**, que estará en el CCAV durante la Fase 4. Una
sola persona guarda la clave, para no tenerla en dos equipos. Parámetros:

- Refirmado **diario**, cambie o no la lista.
- `SQRID_REVOCATION_MAX_AGE_SECONDS` entre **48 y 72 horas** (172800 a 259200 s): con
  refirmado diario, tolera uno o dos días sin conexión o sin refirmar antes de que el
  punto de control empiece a rechazar.
- `SQRID_REVOCATION_REFRESH_SECONDS` = **300** (cinco minutos): una revocación llega al
  punto de control a lo sumo cinco minutos después de instalarse el archivo.

---

## ADR-0016 — Registro de credenciales en `mi-app-qr` y portal del titular

**Estado:** Aceptada (2026-10-24)

**Contexto.** El `cid` es opaco (`docs/SQRID-1.md`): el token no lleva datos personales y
`verifier/` decide sin saber de quién es la credencial. La relación `cid` → persona tiene
que existir en algún lugar, y hoy no existe en ningún módulo: `issuer/` recibe el `cid`
ya hecho (`issue --cid`) y no guarda a quién pertenece. Además, el token dura poco
(ADR-0004), así que el teléfono del titular necesita pedir uno nuevo cada vez que lo va a
presentar, y para eso el servidor tiene que reconocer que quien lo pide es ese titular.
ADR-0008 dice hoy que el estudiante nunca inicia sesión. El `cid` se repite en todos los
tokens de un titular y permite vincular sus apariciones (`THREAT-MODEL.md`, sección
«Vinculabilidad del `cid`»). Por último, el proyecto no debe depender de permisos ni
servicios de la universidad (buzones de correo, proveedor de identidad, directorios): la
solución tiene que funcionar solo con lo que el propio proyecto opera.

**Opciones consideradas para la entrega del QR al teléfono.**

- **(a) Portal del titular con código enviado al correo institucional.** Descartada:
  enviar al buzón institucional exige un buzón de servicio de la universidad o un dominio
  propio con un proveedor de correo externo; ninguna de las dos es independiente de
  terceros.
- **(b) Portal del titular con el teléfono vinculado en el alta.** Elegida: ver la
  decisión.
- **(c) QR generado en un punto de la sede.** Sin teléfono, pero poco práctico y no
  escala a varias entradas por día.
- **(d) Inicio de sesión con la cuenta institucional (OpenID Connect).** Descartada por
  la misma razón que (a): requiere que TI registre la aplicación.
- **(e) Llaves de acceso del teléfono (WebAuthn / *passkeys*).** Descartada por ahora:
  exigen un nombre de dominio real, y el servidor de `mi-app-qr` se usa por IP con un
  certificado autofirmado por instalación (ADR-0008).

**Opciones consideradas para dar de alta al titular.**

- **Alta presencial por un administrador.** Descartada: el alta debe ser autoservicio,
  sin trabajo manual por cada titular.
- **Autorregistro contra un padrón importado del sistema académico.** Descartada:
  depende de una exportación periódica que el proyecto no controla.
- **Autorregistro con datos declarados por el titular.** Elegida.

**Decisión.**

1. **El registro vive en el servidor de `mi-app-qr`**, junto a sus usuarios, en el mismo
   SQLite (ADR-0008). Tablas nuevas: `titulares` (nombre, documento, correo, estamento), `estamentos`, `reglas_horario`, `excepciones_calendario`, `credenciales`
   (`cid`, titular, estado `vigente` / `reemplazada` / `revocada`, periodo de vigencia,
   fechas) y `dispositivos` (hash de la llave del dispositivo vinculado, fechas). Se
   conserva el historial: un `cid` reemplazado nunca se borra, para poder auditar eventos
   antiguos de la bitácora. El vocabulario sigue ADR-0009: en el modelo de datos es
   «titular», no «estudiante».
2. **Alta por autorregistro, sin trabajo manual.** El titular abre el portal del titular
   desde la red del CCAV, escribe su nombre, su documento y su correo, y acepta la
   autorización de tratamiento de datos (Ley 1581 de 2012). El servidor crea su `cid`
   automáticamente.
   - Un registro activo por documento. Si el documento ya existe, el alta se detiene y
     queda para revisión de un `admin`.
   - El nombre, el documento y el correo son **declarados**: el sistema no comprueba que
     pertenezcan a quien se registra.
   - El correo es solo un dato de contacto para que un `admin` pueda comunicarse con el
     titular (finalidad que se informa en la autorización). No se verifica, no se usa para
     iniciar sesión ni para recuperar la credencial, y el sistema no envía mensajes
     automáticos. Tampoco es único: si lo fuera, alguien podría registrar el correo de
     otra persona para impedirle el alta.
3. **Vínculo con el teléfono.** Al terminar el alta, el servidor genera una llave del
   dispositivo de 256 bits con CSPRNG y la entrega al teléfono en una cookie `HttpOnly`,
   `Secure` y `SameSite=Strict`. Guarda solo su hash. Con esa llave el teléfono pide su
   QR sin contraseña ni código.
   - Un dispositivo vinculado por titular: vincular otro desactiva el anterior.
   - El vínculo no depende del `cid`: sobrevive al reseteo trimestral (punto 8), y el
     servidor siempre pide el token con el `cid` vigente del titular. Dura hasta que el
     titular vincula otro teléfono o un `admin` lo revoca (por ejemplo, ante un teléfono
     reportado como perdido). El reseteo protege contra quien observa los QR desde fuera;
     la llave del dispositivo es interna y no viaja en el QR.
   - La sesión del titular es un tipo aparte, sin acceso a ninguna ruta del personal
     (`admin` / `operador`).
   - La página no guarda el token en `localStorage`, en el historial ni en caché, igual
     que el portal de verificación (ADR-0012), y pide uno nuevo antes de que venza.
4. **Código de recuperación.** En el alta, la página muestra una sola vez un código de
   recuperación generado con CSPRNG, que el titular debe guardar. Tiene al menos
   **80 bits** de entropía (por ejemplo, 16 caracteres Base32 en grupos de cuatro), para
   que una filtración de la base de datos no permita recuperarlo por fuerza bruta. El
   servidor guarda solo su hash, con la misma función lenta que ya usa para las
   contraseñas del personal (bcrypt). Con ese código y su documento, el titular vincula un teléfono nuevo (cambio de
   equipo o datos del navegador borrados); al usarlo se genera uno nuevo. Hay límite de
   intentos por documento y por IP. Si el titular pierde el teléfono y el código, lo
   resuelve un `admin` de `mi-app-qr`: es el único caso manual.
5. **Estamento y reglas de horario.** Cada titular pertenece a un estamento (por ejemplo
   estudiante, docente, administrativo, visitante). La lista de estamentos no está fija
   en el código: la crea y la edita un `admin` desde el panel de `mi-app-qr` (ADR-0009).
   Cada estamento tiene una o más ventanas de ingreso (días de la semana, hora de inicio y
   hora de fin, en la hora local de la sede), también editables desde el panel.
   - **La regla se aplica al emitir, no al verificar.** El servidor de `mi-app-qr` solo
     pide un token a `issuer/` si el titular está dentro de una ventana de su estamento;
     fuera de ella, el portal le dice que está fuera de su horario y no hay QR. El
     estamento no viaja en el token, así que `SQRID/1` no cambia, el QR no expone la
     categoría de la persona y `verifier/` sigue sin conocer nombres ni roles. Como el token
     dura poco, uno emitido justo antes del cierre de la ventana solo sirve unos segundos
     después.
   - **Falla cerrado.** Un estamento sin ventanas no recibe tokens.
   - **Festivos y jornadas especiales.** Un `admin` los configura desde el panel como
     excepciones de calendario: una fecha (o un rango de fechas) que cierra el ingreso o
     reemplaza las ventanas normales, para todos los estamentos o solo para algunos. En
     una fecha con excepción, la excepción manda sobre las ventanas semanales. El sistema
     no trae un calendario de festivos precargado: lo que no se configure no existe.
   - **Estamento declarado, con confirmación para los privilegiados.** En el alta, el
     titular elige su estamento de la lista. Un `admin` marca qué estamentos tienen más
     acceso que el estamento base y requieren confirmación: por ejemplo docente,
     administrativo y **Externo** (visitantes), que no tiene restricción de horario.
     Mientras el `admin` no lo confirme, el titular recibe las ventanas del **estamento
     base**. El código no trae ningún estamento predefinido (ADR-0009): en la
     configuración inicial de cada instalación, el `admin` crea la lista y elige cuál es
     la base; en el piloto del CCAV será **«Estudiante»**. Mientras no haya una base
     elegida, el portal no admite altas. El estamento base no requiere confirmación y no
     se puede borrar mientras sea la base. Así, declararse
     docente o externo no amplía el horario por sí solo (si Externo no requiriera
     confirmación, cualquiera podría elegirlo para saltarse los horarios), y el trabajo
     manual se limita a esos casos.
   - **Reglas por dominio del correo.** Un `admin` puede asociar dominios de correo a
     estamentos desde el panel (por ejemplo, el dominio de los estudiantes a «estudiante»
     y el de los docentes a «docente»). En el alta, el estamento se preselecciona según el
     dominio del correo declarado. Como el correo no se verifica, el dominio solo sugiere:
     si apunta a un estamento sin privilegios, se asigna directamente; si apunta a uno que
     requiere confirmación, queda pendiente del `admin` igual que si el titular lo hubiera
     elegido. Si más adelante el correo se verifica, el dominio podría confirmar el
     estamento sin intervención; con correo no verificado, cualquiera podría escribir un
     correo del dominio de docentes para obtener su horario.
   - **Todo cambio queda registrado:** quién cambió el estamento de un titular o las
     ventanas de un estamento, cuándo y qué valor tenía antes.
   - Las reglas son por estamento y por hora, iguales en todos los puntos de control.
     Reglas por punto de control (una puerta sí y otra no) exigirían que el verificador
     conozca el estamento y quedan fuera de esta decisión.
6. **Emisión mediante un servicio local de `issuer/`.** La CLI actual pide la contraseña
   de la clave en cada llamada (`SQRID_PRIVATE_KEY_PASSWORD`); si `mi-app-qr` la invocara
   por cada token, tendría que guardar la contraseña. Por eso `issuer/` se ejecuta como un
   servicio local de larga duración:
   - Corre en el mismo equipo servidor del CCAV que `mi-app-qr`, con una cuenta propia
     del sistema operativo, la única que puede leer el archivo PEM cifrado.
   - Lo arranca el custodio, que escribe la contraseña una sola vez; la clave queda en la
     memoria de ese proceso y nunca sale de `issuer/`.
   - Escucha solo dentro del equipo (`127.0.0.1` o un canal local equivalente), nunca en
     la red, y solo atiende solicitudes de `mi-app-qr` autenticadas con un secreto
     compartido de la instalación. Ese secreto permite pedir tokens, no leer la clave.
   - `mi-app-qr` le envía el `cid` vigente del titular y recibe el token ya firmado; nunca
     conoce la contraseña ni importa código de `issuer/`. Hay límite de tokens por
     dispositivo.
   - **Custodia:** Duverney, que estará en el CCAV durante el piloto, custodia la
     contraseña y vuelve a escribirla si el servidor se reinicia. Jhunier guarda una copia
     de respaldo en un gestor de contraseñas. La clave de emisión y la clave de
     revocación (ADR-0014) son distintas y tienen contraseñas distintas.
   - **Respaldo de la clave de revocación.** Duverney también custodia la clave de
     revocación y vuelve a firmar la lista a diario (ADR-0015). Si no pudiera hacerlo
     dentro de `SQRID_REVOCATION_MAX_AGE_SECONDS` (48 a 72 horas), todos los puntos de
     control empezarían a rechazar. Por eso hay respaldo: una copia del PEM cifrado en un
     medio externo que no es un equipo de trabajo, y su contraseña en el gestor de
     contraseñas de Jhunier. Si pasan 24 horas sin refirmado y el custodio no está
     disponible, Jhunier firma la lista con el respaldo, y ese uso queda anotado en
     `docs/STATE.md`. Esto amplía la regla de ADR-0015 de un solo custodio: el respaldo
     no vive en un segundo equipo en uso.
   - **Vigencia del token:** `SQRID_TOKEN_TTL_SECONDS` = 60, con una tolerancia de reloj
     de 30 segundos en el verificador (ADR-0011 admite hasta 60). Un QR sirve como
     máximo 90 segundos, y como el nonce es de un solo uso, una captura de pantalla solo
     sirve si se presenta antes que el titular. La página del titular pide un token nuevo
     unos 15 segundos antes del vencimiento.
7. **Consulta `cid` → persona.** Solo el permiso `admin` puede traducir un `cid` a una
   persona, y cada consulta queda registrada (quién, cuándo, qué `cid`), como exige la
   Ley 1581 de 2012. `verifier/`, `verifier-service/` y el portal público siguen sin
   conocer nombres: el punto de control solo muestra «aceptada» o «rechazada»
   (ADR-0012). Es el `admin`, al revisar la bitácora y los informes, quien ve el nombre
   asociado a cada `cid`. No se recoge foto del titular: la revisión ocurre después del
   paso, sin la persona presente, así que una foto no aportaría control y sí más datos
   personales.
8. **Reseteo trimestral del `cid`.** Cada trimestre se crea un `cid` nuevo por titular y
   el anterior pasa a `reemplazada`. No se revoca: sus tokens vencen solos y el emisor deja
   de firmar con él. La revocación queda para credenciales comprometidas. El titular no
   tiene que hacer nada: su teléfono sigue vinculado y recibe tokens con el `cid` nuevo.
   El reseteo solo alcanza a titulares con una credencial `vigente`: un titular cuya
   credencial está `revocada` queda suspendido y no recibe `cid` nuevo, porque si no, la
   rotación le devolvería una credencial válida que no está en la lista de revocados.
   Solo un `admin` puede reactivarlo, con una credencial nueva y registrando el cambio.
9. **Revocación.** Hay dos niveles:
   - **Inmediato, en `mi-app-qr`.** Si un `admin` revoca una credencial o corta el
     vínculo de un teléfono, el servidor deja de emitir tokens para ella en ese momento.
     Solo queda en circulación el último token, que vence en segundos.
   - **Lista firmada, para el verificador.** `mi-app-qr` exporta cada día un archivo, sin
     firmar, con los `cid` revocados; el custodio de la clave de revocación lo firma en su
     rutina diaria de refirmado (ADR-0015) y el archivo firmado llega al punto de control
     por el mecanismo de ADR-0015. Para casos urgentes, el panel ofrece «exportar ahora»
     y el custodio firma en el momento. Falta construir el comando para firmar listas: hoy
     `revocation/` solo tiene la función `sign_revocation_list`.
10. **Conservación de los datos.** El registro de consultas `cid` → persona se conserva
    lo mismo que los registros de asistencia a los que se refiere. En el piloto, al
    cierre del proyecto se eliminan o anonimizan los datos personales de titulares,
    registros y consultas. En un uso institucional posterior, el plazo lo configura el
    `admin` y se informa en la autorización de tratamiento. La bitácora encadenada
    (`evidence-log/`) no se borra nunca, pero solo contiene `cid`: al eliminar la relación
    `cid` → persona, sus eventos dejan de poder atribuirse a alguien.
11. **Línea base del objetivo 3.** Antes de implementar esta decisión se etiqueta la
   versión actual de `mi-app-qr` (por ejemplo `baseline-o3`). El pretest se hace contra
   esa etiqueta, que sigue siendo la aplicación sin controles.

**Consecuencias.**

- **No depende de la universidad.** No hacen falta buzones, dominios, proveedores de
  correo ni de identidad. Lo único que se usa de la institución es lo que ADR-0008 ya
  supone: el equipo servidor corre en la red del CCAV.
- **Cambia ADR-0008.** Su frase «el estudiante nunca inicia sesión» pasa a decir: el
  titular no tiene contraseña ni cuenta en la universidad dentro del sistema; se
  autorregistra en el portal del titular, que vincula su teléfono, solo para obtener su
  QR y sin acceso a nada más.
- **`mi-app-qr` entra al flujo de SecureQR-ID** como registro de credenciales y portal
  del titular. Hay que actualizar `CLAUDE.md` y la sección «Relación con el prototipo
  existente» de `ARCHITECTURE.md`. La separación de código se mantiene: Node y Python se
  comunican por límite de proceso.
- **La identidad del titular es declarada, no verificada.** Nadie comprueba que el
  nombre, el documento y el correo sean de quien se registra, ni que pertenezca a la institución.
  Lo acotan: el portal solo es accesible desde la red del CCAV (ADR-0008), así que el
  alta exige estar físicamente en la sede; la regla de un registro por documento; y la
  revisión del `admin` sobre la bitácora. Debe declararse en el modelo de amenazas y en
  el documento de grado.
- **El teléfono prestado sigue fuera de alcance.** Como nadie compara a la persona con su
  registro en el momento del paso, la cesión voluntaria no se detecta (ver
  `THREAT-MODEL.md`, «Fuera del alcance»). La revisión del `admin` en la bitácora es
  posterior: sirve para auditar quién figura como ingresado, no para impedir el préstamo.
- **El servidor del CCAV custodia la clave de emisión.** Es el material más sensible del
  sistema: su protección (PEM cifrado, cuenta propia del sistema operativo, clave solo en
  memoria del servicio, acceso físico al equipo) entra al modelo de amenazas. Hay que
  distinguir dos casos. Quien compromete solo la cuenta de `mi-app-qr` puede pedir tokens
  al servicio local, pero no leer la clave. Quien obtiene control total del equipo
  (administrador del sistema) puede leer la memoria del proceso de `issuer/`: eso se trata
  como **compromiso de la clave de emisión**, con generación de una clave nueva (nuevo
  `kid`), retiro de la anterior de los verificadores y reemisión, no solo con cerrar el
  acceso.
- **`issuer/` gana una interfaz local nueva.** Hoy no expone ninguna API; el servicio
  local y su autenticación con `mi-app-qr` son trabajo nuevo, con sus pruebas.
- **Superficie de ataque nueva**, que debe sumarse a `THREAT-MODEL.md`:
  - registro masivo con datos falsos desde la red del CCAV;
  - robo de la cookie del dispositivo o del teléfono desbloqueado, que equivale a robar
    la credencial hasta que un `admin` revoque el vínculo;
  - fuerza bruta sobre el código de recuperación;
  - suplantación del portal (*phishing*) dentro de la red local, que el certificado
    autofirmado facilita (ver la consecuencia siguiente);
  - declararse en un estamento privilegiado para ampliar el horario, mitigado por la
    confirmación del `admin`;
  - un `admin` que cambia ventanas o estamentos para permitir ingresos indebidos,
    mitigado por el registro de cada cambio.
- **Certificado autofirmado en los teléfonos de los titulares.** El servidor usa el
  certificado autofirmado por instalación de ADR-0008. En el personal del CCAV eso es
  manejable, pero en cientos de teléfonos personales, donde no se puede instalar una
  raíz de confianza, todos verán la advertencia del navegador y aprenderán a aceptarla,
  lo que facilita suplantar el portal en la red local. Mitigación mínima para el piloto:
  la huella SHA-256 del certificado se publica en un cartel en la sede y en el panel de
  `mi-app-qr`, y la página de alta explica cómo compararla con la que muestra el
  navegador. Para que esa huella no cambie, el servidor del piloto usa una IP fija
  (reserva de DHCP o dirección estática): ADR-0008 regenera el certificado cuando cambian
  las IP del equipo. Si aun así se regenera, el panel muestra la huella nueva con su
  fecha, el custodio reemplaza el cartel ese mismo día y la página de alta indica la
  fecha de la huella vigente. Una solución de fondo queda pendiente (ver «Pendiente de
  decidir»).
- **Los datos los aporta el titular**, así que la autorización de tratamiento se recoge
  en el propio formulario de alta, y el titular debe poder corregirlos (con registro del
  cambio, como en ADR-0008).
- **El titular necesita estar en la red del CCAV** para registrarse y para pedir su QR,
  porque el servidor no se expone a internet (ADR-0008). Es coherente con generar el QR
  en la entrada, pero hay que comprobarlo en el piloto.

**Pendiente de decidir.**

- Cómo dar al portal del titular un certificado en el que los teléfonos confíen sin
  advertencia. La opción candidata, sin depender de la universidad: un dominio propio
  del proyecto con un certificado de Let's Encrypt obtenido por el reto DNS-01, cuyo
  registro apunte a la IP local del servidor del CCAV. Tiene costo (el dominio) y hay que
  comprobar que la red del CCAV resuelva ese nombre hacia una IP privada. Si se adopta,
  también habilitaría las llaves de acceso del teléfono (opción e). Mientras no se
  decida, rige la mitigación de la huella publicada.

**Enmienda (2026-10-24) — Resolución de las altas en revisión (issue #109).** La
decisión 2 detiene el alta cuando el documento ya existe, pero ningún punto dice cómo la
resuelve el `admin`; sin eso, el alta queda bloqueada para siempre. Ese bloqueo tiene
dos causas distintas y cada una exige una salida:

- **Alguien usó el documento de otra persona.** El alta en revisión es la impostora, o
  la impostora ya es el registro `activo` y la persona real quedó en revisión.
- **La misma persona se registró de nuevo**, por ejemplo porque cambió de teléfono sin
  guardar su código de recuperación.

**Decisión.** Solo un `admin` resuelve (la ruta usa `requireAdmin`; un `operador` no).
La página «Titulares» ofrece dos acciones sobre un alta en `en_revision`:

1. **Rechazar.** El alta pasa a `anonimizado` de inmediato: se borran nombre, documento y
   correo, y no se crea un estado nuevo. Esos datos no tienen finalidad una vez
   rechazada el alta (Ley 1581 de 2012) y el alta nunca tuvo credencial, vínculo ni
   código, así que no hay nada que revocar.
2. **Reemplazar** el registro anterior por el nuevo. En una sola transacción:
   - El titular anterior pasa al estado final **`reemplazado`**, que sale de
     `titulares_documento_unico` (el índice solo cubre `activo` y `suspendido`) y
     conserva sus datos hasta el cierre del piloto, cuando rige la anonimización de
     ADR-0016. Es el único estado nuevo; se añade a la restricción de `titulares.estado`.
   - Su credencial vigente pasa a `reemplazada` o `revocada` **según el motivo que elige
     el `admin`**: «misma persona» → `reemplazada`; «el registro anterior era indebido»
     → `revocada`, que entra en la lista de revocación y mata los tokens ya emitidos en
     cuanto los puntos de control la reciban. El `cid` anterior nunca se borra: sigue
     resolviendo en la consulta auditada (#86) y su historial en `asignaciones_cid`
     verifica.
   - Su dispositivo vinculado pasa a `revocado`, en ambos motivos.
   - El titular nuevo pasa a `activo` y recibe credencial vigente, con su entrada `alta`
     en `asignaciones_cid`, y un código de recuperación nuevo.
   - Si el documento ya no tiene registro anterior vigente (por ejemplo, ya se
     anonimizó), no hay nada que reemplazar: el `admin` solo **aprueba** el alta, con los
     mismos efectos sobre el titular nuevo.

**Entrega del código al titular nuevo.** El alta que quedó en revisión no le mostró
ningún código. Al reemplazar, el servidor genera uno nuevo (CSPRNG, 80 bits o más,
guardado como hash bcrypt, igual que el de la decisión 4) y lo muestra **una sola vez al
`admin`**, que se lo entrega al titular **en persona, después de verificar su identidad**
(la decisión 2 declara que el sistema no la comprueba; esta es la comprobación). El
titular lo usa en el flujo de recuperación que ya existe (documento + código): eso
vincula su teléfono y genera un código propio, con lo cual el que conoció el `admin` deja
de servir. Hay límite de intentos por documento y por IP, como en la decisión 4. No se
añade correo, enlace ni ningún canal nuevo: el correo sigue siendo solo un dato de
contacto y el caso entra en el único caso manual que ya reconoce la decisión 4.

**Auditoría.** Cada decisión (rechazar, reemplazar o aprobar) se registra en
`cambios_configuracion` con el `admin`, la fecha y un motivo de una lista cerrada
(`documento_de_otra_persona`, `misma_persona`, `registro_anterior_indebido`,
`sin_registro_anterior`). La nota libre es opcional, corta, y la interfaz avisa que no
debe contener datos personales: el texto libre no se puede depurar después (límite
conocido de `cambios_configuracion`, ver #108).

**Consecuencias.**

- **Riesgo residual declarado.** La calidad de la resolución depende de la verificación
  presencial del `admin`: un `admin` descuidado o malintencionado puede reemplazar un
  registro legítimo. Queda registrado en `cambios_configuracion`, pero el sistema no lo
  impide. Debe sumarse a `THREAT-MODEL.md`. El `admin` conoce el código de entrega hasta
  que el titular lo usa: ese intervalo es la única ventana en que alguien distinto del
  titular podría vincular el teléfono, por lo que se recomienda entregarlo y usarlo en
  el mismo acto.
- **Suplantación por registro previo (*document squatting*).** Quien se registra primero
  con el documento ajeno obtiene un registro `activo`. La persona real queda en
  revisión y el `admin` lo resuelve con «reemplazar» y motivo `registro_anterior_indebido`.
  Sin esta salida, el documento quedaría ocupado indefinidamente.
- **Código provisional de entrega, con vigencia de 72 horas** (propuesto; queda acordado
  cuando los dos autores aprueben este PR). El plazo afecta **solo** al código
  provisional que el `admin` ve al resolver, y no cambia la decisión 4: el código de
  recuperación propio del titular no caduca por tiempo.
  - Corre desde el momento en que el servidor lo genera.
  - Vencido, el canje se rechaza con la misma respuesta genérica que un código
    incorrecto, y el `admin` puede **regenerarlo**, lo que invalida el anterior.
  - Al canjearlo, el titular recibe su código propio y el provisional deja de existir:
    pierde su carácter provisional y su fecha de vencimiento.
- **Implementación.** Va sobre el PR #106 y sus anteriores (#102, #104). Requisitos:
  - **Canje atómico.** Reutilizar el consumo condicional y atómico del hash y la reserva
    de cuota de intentos de #104: dos canjes simultáneos del mismo código producen un
    solo éxito. La respuesta que contiene el código lleva `Cache-Control: no-store` y el
    código no se escribe en registros ni en el almacenamiento persistente del cliente.
  - **Resolver una sola vez.** Dentro de la transacción solo se resuelve un alta que siga
    en `en_revision`; una decisión repetida, o una aprobación sobre un estado ya
    resuelto, falla sin crear otra credencial ni otro código.
  - **Reconstruir `titulares` sin perder nada.** Para ampliar la restricción de estados
    se conservan el `id` y la `ref` de cada fila, todas las claves foráneas y todos los
    triggers, incluido `titulares_referencia_fija` (#105). Se prueba la migración sobre
    una base existente, `foreign_key_check`, el rollback de un reemplazo fallido y,
    después, la cadena `asignaciones_cid` y la atribución de la consulta auditada.
  - **Anonimización.** Las pruebas de #108 cubren también a los titulares `reemplazado`
    (al cierre del piloto) y a los rechazados (de inmediato), y conservan la limpieza de
    motivos y de `cid` inválidos.
  - Pruebas de las tres salidas (rechazar, reemplazar, aprobar) con auditoría.

**Enmienda (2026-10-25) — Autenticación del historial `cid` → titular (hallazgo P1 de
#102).** `THREAT-MODEL.md` («Vinculabilidad del `cid`») exige que el historial
`asignaciones_cid` sea a prueba de manipulación y dejó el mecanismo para la
implementación. La primera versión lo encadenaba con SHA-256 sin clave, y eso no basta:
quien tiene acceso de escritura al archivo de la base puede quitar los disparadores,
cambiar el `titular_ref` de una fila y **recalcular** ese eslabón y todos los siguientes
con la misma función pública. `verifyAsignaciones` vuelve a dar verdadero y un evento
intacto de la bitácora queda atribuido a otra persona.

**Decisión.** Cada eslabón se autentica con **HMAC-SHA256** (`node:crypto`, ninguna
primitiva propia) en lugar de SHA-256. La clave tiene 32 bytes aleatorios y **vive fuera
de la base**:

- En la app de escritorio, Electron la genera una sola vez junto a los demás secretos
  del servidor (`server-secrets.json`, fuera de `server-data/`) y la pasa como variable
  de entorno `ASIGNACIONES_KEY` (hexadecimal).
- Fuera de Electron se define en `.env`.
- El servidor no arranca sin ella o con un valor de menos de 32 bytes: falla cerrado,
  igual que con `SESSION_SECRET`.

El formato de la tabla no cambia: la columna `hash` guarda la etiqueta HMAC y el resto
de la cadena sigue igual (orden, génesis, `hash_anterior`).

**Opciones consideradas.**

- *Registrar cada asignación en `evidence-log/` y anclarla.* Es la sugerencia original
  de `THREAT-MODEL.md` y da una garantía externa real. Pero obliga a construir hoy un
  puente de proceso entre `mi-app-qr` (Node) y `evidence-log/` (Python), que todavía no
  existe, y mezcla con la bitácora de pasos eventos de otra naturaleza.
- *HMAC con clave fuera de la base* (elegida). Cierra el escenario del hallazgo
  (acceso al archivo, a una copia o a un respaldo de la base) con un cambio local y sin
  dependencias nuevas.

**Consecuencias.**

- **Riesgo residual declarado.** Quien controla el equipo servidor completo (la base
  **y** la clave) todavía puede reescribir el historial. Cerrarlo exige un compromiso
  externo: publicar periódicamente la cabeza (`headAsignaciones`) en la bitácora
  anclada. Queda como trabajo posterior y debe sumarse a `THREAT-MODEL.md`.
- **Custodia de la clave.** Si se pierde, el historial existente ya no se puede
  verificar (sí se puede leer). Va en el mismo respaldo custodiado que los demás
  secretos del servidor, **nunca** en el mismo respaldo que la base.
- **Sin migración de datos.** Ninguna instalación tiene todavía asignaciones: la cadena
  #102–#108 no se ha fusionado.
- **Implementación** en #115, con pruebas que recalculan la cadena completa después de
  manipularla (con SHA-256 sin clave y con una clave distinta) y comprueban que la
  verificación falla.

**Enmienda (2026-10-25, segunda) — Compromiso externo de la cabeza de `asignaciones_cid`
(issue #119).** La enmienda anterior dejó un riesgo residual: quien controla el servidor
completo (base **y** clave HMAC) puede reescribir el historial `cid` → titular. Para
cerrarlo hace falta un compromiso fuera de su alcance, y el sistema ya tiene uno: la
bitácora anclada en Fabric (ADR-0017).

**Decisión.**

- `mi-app-qr` escribe cada 15 minutos, con reemplazo atómico, la **cabeza** de la cadena
  en `ASIGNACIONES_CABEZA_PATH`: `{version, fuente: "asignaciones_cid", seq, hash}`. Solo un
  número y la etiqueta HMAC de 256 bits, que no se puede invertir; nunca `cid`, `ref` ni
  datos personales.
- `evidence-log cycle --head-file` registra esa cabeza **antes** de fijar el lote, como un
  evento con la decisión `compromiso_externo` (nunca la de un paso por el punto de
  control) y `credential_id = asignaciones_cid:<seq>:<hash>`. Así entra en la misma raíz de
  Merkle que se ancla en esa corrida, sin cambiar el formato del lote ni el contrato de
  `anchor/`. Una cabeza repetida no se vuelve a registrar; una que **retrocede** o que
  cambia el hash de una `seq` ya comprometida es una **alerta** (código 3), porque eso
  pasa si alguien reescribió o truncó el historial (o si se restauró un respaldo anterior
  de la base de `mi-app-qr`). La alerta **no detiene el anclaje de los pasos** del punto de
  control, que es la garantía principal: el lote se ancla igual y la alerta se informa al
  final de la corrida.
- `evidence-log export-commitments` (o `cycle --commitments-file`) devuelve los
  compromisos y si cada uno ya está anclado. Solo cuenta como anclado si la cadena local
  verifica y la raíz de su lote se recalcula igual a la registrada.
- `mi-app-qr` compara cada hora su historial con los compromisos anclados: la fila de
  cada `seq` comprometida debe existir y tener el mismo hash. Si no, registra una alerta y
  el `admin` la ve en `GET /api/titulares/integridad`.

**Opciones consideradas.** Una tabla aparte en `evidence-log/` para compromisos externos
no se anclaría sin cambiar el lote ni `anchor/`. Anclar la cabeza directamente desde
`mi-app-qr` exigiría que Node hable con Fabric, duplicando `anchor/`. Registrarla como
evento reutiliza todo el camino de anclaje ya probado; el costo es que estos eventos
cuentan en los lotes, y se distinguen por su decisión.

**Consecuencias.**

- Una reescritura o un truncamiento **anterior** al último compromiso anclado se detecta,
  aunque el atacante tenga la clave HMAC.
- Riesgo residual: lo asignado después del último compromiso anclado (hasta unos 15
  minutos más el ciclo de anclaje) solo lo protege el HMAC. La comparación usa la copia
  local de la bitácora, que se confirma contra la raíz anclada en Fabric al consultarla
  (#93).
- Sigue el límite de proceso por archivos (ADR-0005): ni Python importa Node ni al revés.

**Enmienda (2026-10-26) — Texto libre del historial de cambios y certificado del portal.**
Cierra dos puntos que quedaban abiertos. Decisión conjunta: la propone Jhunier y queda
aceptada cuando Duverney apruebe el PR que la trae.

**1. Texto libre en `cambios_configuracion`.** Las notas y los motivos libres que escribe
el `admin` (por ejemplo, la `nota` al resolver un alta en revisión, o el motivo de una
revocación) pueden contener datos personales. Hoy no se anonimizan, porque la tabla es
de solo agregar (límite conocido, #108).

**Decisión.** Se anonimizan con la misma regla que `registros.motivo` y `consultas_cid`
(punto 10):

- al cierre del piloto, y por plazo si el `admin` configuró uno, se eliminan las claves
  de texto libre (`nota`, `motivo` cuando no es de lista cerrada) dentro de
  `valor_anterior` y `valor_nuevo`;
- se conservan `usuario_id`, `entidad`, `entidad_id`, `accion`, `en` y los motivos de
  lista cerrada;
- el disparador de solo agregar se reemplaza por uno que admite **solo** esa limpieza: no
  permite cambiar ninguna otra columna ni agregar contenido.

La interfaz mantiene el aviso de no escribir datos personales, porque hasta el cierre el
texto sigue ahí.

**2. Certificado del portal del titular.** El «pendiente de decidir» de este ADR se
cierra así: **en el piloto se sigue con la huella SHA-256 publicada** en el cartel de la
sede y en la página de alta. Es la mitigación que ya está implementada y no tiene costo.
El dominio propio con Let's Encrypt (DNS-01) se reevalúa después del piloto, con lo que
se observe sobre cuántos titulares comparan la huella.

**Implementación.** El punto 1 va en un issue aparte; por la regla de reparto de
`CLAUDE.md` le toca a Duverney. Incluye pruebas de que el disparador nuevo rechaza
cualquier otra modificación. El punto 2 no requiere código.

---

## ADR-0017 — Conexión de `anchor/` a Hyperledger Fabric y sellado en OpenTimestamps

**Estado:** Aceptada (2026-10-24)

**Contexto.** `anchor/` construye el árbol de Merkle, genera y verifica pruebas de
inclusión y publica la raíz a través de la interfaz `LedgerClient`, pero la única
implementación es `InMemoryLedgerClient`: no hay red Fabric, ni contrato en la red, ni
quien ejecute el ciclo exportar → anclar → registrar. Por eso el anclaje en blockchain
(objetivo específico 2) no está cumplido. Además, `EvidenceLog.mark_batch_anchored`
hace `UPDATE` sobre la tabla de eventos: no rompe la cadena de hashes, pero es una
edición sobre una bitácora que debe ser de solo agregar. Por último, el proyecto no debe
depender de servicios de la universidad (ADR-0016).

**Vigencia de las tecnologías (consultado el 2026-10-13 en Docker Hub, npm, PyPI y el
proxy de módulos de Go).**

| Pieza | Última versión | Fecha |
|---|---|---|
| Nodos de Fabric, línea 3.1 | 3.1.5 | junio de 2026 |
| Nodos de Fabric, línea 2.5 (LTS) | 2.5.16 | junio de 2026 |
| `@hyperledger/fabric-gateway` (cliente Node) | 1.13.0 | octubre de 2026 |
| `fabric-contract-api-go` v2 (contratos en Go) | 2.2.4 | octubre de 2026 |
| `fabric-contract-api` (contratos en Node) | 2.5.8 | diciembre de 2024 |
| `fabric-network` (SDK antiguo) | 2.2.20, sin versión estable posterior | — |
| `opentimestamps-client` (Python, referencia) | 0.7.2 | diciembre de 2024 |
| `opentimestamps` para JavaScript | 0.4.9 | enero de 2021 |

**Decisión.**

1. **Red propia, Fabric 2.5 LTS, en Docker en el servidor del CCAV.** Se usa la
   `test-network` oficial de `fabric-samples` (un *orderer* y dos organizaciones con un
   *peer* cada una), con versiones fijadas en los scripts de `infra/fabric/`, nunca «la
   última». La operan los autores del proyecto: como reconoce ADR-0007, eso no protege
   contra quien opera la red, y para eso existe el sellado en Bitcoin (punto 7). Requiere
   Docker y unos 4 GB de RAM libres.
   - **Persistencia.** La `test-network` está pensada para pruebas: `./network.sh down`
     borra contenedores, volúmenes y material criptográfico, y `up` crea una red nueva con
     el ledger vacío. Para que el ledger dure todo el piloto, `infra/fabric/` tiene
     scripts propios sobre la `test-network`: se crea una sola vez y después solo se
     detienen y arrancan los contenedores existentes, nunca `down`/`up`. Los contenedores
     usan la política de reinicio `unless-stopped`, para volver solos tras un reinicio del
     servidor.
   - **Respaldo.** Se respaldan los volúmenes de los *peers* y del *orderer* y el material
     criptográfico generado (que `.gitignore` excluye y nunca entra al repositorio), con
     la red detenida, en un medio externo cifrado que guarda el custodio. Se respalda al
     crear la red y una vez por semana.
   - Una prueba de #82 comprueba que el ledger sobrevive a un reinicio de la red.
2. **Contrato en Go** (`fabric-contract-api-go` v2), con dos operaciones:
   `registrarRaiz(loteId, raiz, cantidad, primerEvento, ultimoEvento)`, que rechaza un
   `loteId` ya registrado para que nadie pueda sobrescribir un lote, y
   `consultarRaiz(loteId)`. El `loteId` es **determinista**: se forma con el
   `verifier_id` de la instalación (ADR-0013) y el primer y el último número de secuencia
   del lote en su bitácora (por ejemplo `ccav-portal-1:seq-000101-000600`). Así el mismo
   rango nunca se ancla dos veces con identificadores distintos, y dos instalaciones,
   cuyas bitácoras empiezan cada una en 1, no chocan en la misma red. Para que un
   reintento produzca el mismo `loteId`, el rango se fija antes de publicar (punto 5). Junto con la raíz,
   el contrato guarda el identificador de la transacción y su marca de tiempo
   (`GetTxID`, `GetTxTimestamp`), y `consultarRaiz` los devuelve; el número de bloque se
   recupera con la consulta del sistema `qscc` (`GetBlockByTxID`). Solo guarda hashes,
   identificadores de instalación y números de evento, nunca datos personales. Vive en `anchor/chaincode/` con sus propias pruebas (`go test`).
3. **Cliente en `anchor/` con la Fabric Gateway API.** `FabricLedgerClient` implementa
   `LedgerClient` con `@hyperledger/fabric-gateway`. `publishRoot` pasa a devolver un
   **recibo** (identificador de transacción y número de bloque). `InMemoryLedgerClient`
   se conserva para las pruebas unitarias. Un comando `anclar` lee el lote exportado,
   construye el árbol, publica la raíz y escribe el recibo en un archivo.
4. **Ciclo programado cada 15 minutos, con lotes de máximo 500 eventos.** Una tarea del
   sistema (cron o Programador de tareas) ejecuta: `evidence-log` fija y exporta el lote →
   `anchor` lo ancla y escribe el recibo → `evidence-log` registra el recibo. Python y
   Node se comunican por archivos, sin importarse (ADR-0005). Un disparador por cantidad
   de eventos exigiría un proceso vigilando todo el tiempo; el tope de 500 por lote
   cumple el mismo fin.
5. **Lotes fijados y recibos, en dos tablas de solo agregar.**
   - **`lotes`.** Antes de exportar, `evidence-log` registra el lote que va a publicar
     (`loteId`, primer y último evento, raíz y fecha). Mientras ese lote no tenga recibo,
     cada corrida vuelve a exportar **exactamente ese rango**, aunque hayan llegado
     eventos nuevos; solo cuando el recibo queda registrado se fija el lote siguiente,
     que empieza en el evento posterior. Sin esto, si la raíz entra a Fabric y el recibo
     se pierde, la siguiente corrida armaría un lote más grande con otro `loteId`, se
     anclaría un rango solapado y la raíz anterior quedaría huérfana, sin recibo.
   - **`anclajes`.** Guarda lote, raíz, primer y último evento, transacción, bloque y
     fecha. Reemplaza el `UPDATE` de `mark_batch_anchored`: un evento está anclado si cae
     dentro del rango de algún anclaje registrado. Un recibo solo se acepta para el lote
     fijado pendiente.

   Así la bitácora no tiene ninguna operación de edición: fijar un lote y registrar su
   recibo son dos inserciones.
6. **Falla de la red.** Si Fabric no responde, el lote no se registra como anclado y se
   reintenta en la siguiente corrida. Puede pasar también que la raíz entre a Fabric y el
   recibo no alcance a registrarse en `anclajes` (corte de energía, error al escribir el
   archivo). Como el `loteId` es determinista, la siguiente corrida recibe «ya
   registrado»; entonces consulta la raíz con `consultarRaiz` y la compara con la del lote
   local:
   - si coinciden, reconstruye el recibo original (transacción y marca de tiempo desde
     `consultarRaiz`, bloque desde `qscc`), lo registra y sigue: la operación es
     idempotente y el recibo es el de la transacción que realmente ancló el lote, no el
     del reintento rechazado;
   - si no coinciden, no registra nada, se detiene y alerta, porque significa que el lote
     local cambió después de anclarse.

   En ninguno de estos casos la validación en el punto de control se entera (ADR-0003).
   - **Alerta de 2 horas.** Al terminar cada corrida, el ciclo escribe un archivo de
     estado en JSON (eventos pendientes, el más antiguo, último anclaje, `stale`) con
     reemplazo atómico, en una ruta configurada. El servidor de `mi-app-qr` solo lee ese
     archivo; no abre el SQLite de `evidence-log/` ni importa su código (ADR-0005). El
     panel muestra la alerta si `stale` es verdadero **o** si el archivo tiene más de
     2 horas, lo que también detecta que la tarea programada dejó de correr.
7. **Sellado diario en OpenTimestamps** (ADR-0007) con el cliente oficial en Python
   (`ots stamp`, luego `ots upgrade` y `ots verify`), no con la librería de JavaScript,
   que está abandonada. Se sella el **hash del último bloque** del canal de Fabric
   (consulta `GetChainInfo` de `qscc`), no la última raíz: cada bloque compromete a todos
   los anteriores, así el sello cubre los lotes de todas las instalaciones de ese día y no
   solo los de una. Solo envía un hash, sin cuenta ni pago, a varios servidores públicos a
   la vez; necesita salida a internet. Si no la hay o los servidores fallan, el sello queda
   pendiente y Fabric sigue siendo el anclaje principal. La confirmación en Bitcoin tarda
   horas.
   - **Verificación.** Crear el sello y completarlo (`ots stamp`, `ots upgrade`) no
     necesita un nodo de Bitcoin, pero verificarlo de forma independiente (`ots verify`)
     sí, según la documentación del cliente. No se instala un nodo en el servidor del CCAV:
     la verificación se hace periódicamente, y para la evidencia del documento de grado,
     desde un equipo con un nodo de Bitcoin Core podado, dejando constancia del resultado.
     El comprobante `.ots` permite que cualquiera lo verifique después con sus propios
     medios.
8. **Estrategia de pruebas.**
   - Objetivo 2, demostrar que funciona: pruebas unitarias con el doble en memoria;
     pruebas del contrato con `go test` en cada PR; y una prueba de integración que
     levanta la red en Docker, ancla un lote real, lee la raíz desde la red y verifica una
     prueba de inclusión contra ella. Esta última corre en un flujo de CI aparte, manual y
     nocturno, porque tarda varios minutos. Su ejecución exitosa se anexa al documento de
     grado como evidencia.
   - Objetivo 3, medir: detección de eventos alterados después del anclaje (se espera el
     100 %), tiempo desde el registro hasta el anclaje y comportamiento con la red caída.

**Consecuencias.**

- El repositorio suma Go, solo para el contrato. `CLAUDE.md` debe listar sus comandos y
  `.github/workflows/ci.yml` un trabajo nuevo.
- `evidence-log/` cambia su contrato de anclaje (`anclajes` en lugar de `UPDATE`); sus
  pruebas actuales sobre `mark_batch_anchored` se reescriben.
- El servidor del CCAV necesita Docker y recursos para la red; hay que confirmarlo con
  el equipo real antes del piloto. Si el equipo es Windows, hay que verificar que la
  licencia de Docker Desktop permita usarlo en un equipo de la universidad; la
  alternativa sin esa licencia es Docker Engine dentro de WSL2 o un equipo con Linux.
- `ARCHITECTURE.md` y `THREAT-MODEL.md` se actualizan: la red la opera el propio
  proyecto, y los servidores de OpenTimestamps los mantienen voluntarios.
- **Riesgos residuales que se declaran** en `THREAT-MODEL.md` y en el documento de grado:
  - *Ventana sin sello externo.* Entre un sellado diario y su confirmación en Bitcoin
    pasan un día o más; en ese lapso, quien opera la red podría reconstruir el ledger
    sin que nadie de fuera lo detecte. Fabric aporta registro inmutable frente a
    terceros, no frente a sus propios operadores.
  - *Sin descentralización real.* La `test-network` tiene un solo *orderer* y dos
    organizaciones operadas por las mismas personas. El documento de grado no debe
    presentarla como red descentralizada; la garantía externa la da el sello en
    Bitcoin.
- El documento de grado podrá decir que el anclaje está cumplido solo cuando la prueba de
  integración pase contra la red real.

**Enmienda (2026-10-26) — Frecuencia de la prueba de integración (punto 8).** La prueba
contra la red Fabric real pasa de nocturna a **semanal** (lunes) y sigue disponible a
mano. En los PR solo corre si cambia algo que toca la red real:

- `infra/fabric/`;
- el contrato (`anchor/chaincode/`);
- el cliente de Fabric y sus dependencias (`anchor/src/` y el `package.json` de `anchor/`);
- los comandos del ciclo y lo que importan (`evidence-log/src/` y su `pyproject.toml`).

**Por qué.** El repositorio es privado y sus minutos de Actions son limitados (3000 al
mes). En octubre de 2026 se agotaron y el CI quedó detenido varios días. En el mismo
cambio, `ci.yml` corre cada suite solo cuando cambia su módulo o algo de lo que depende.

**Consecuencia.** Una regresión que solo se vea contra la red real puede tardar hasta
una semana en aparecer, si entra por un archivo que no dispara el flujo. Lo mitigan:

- las pruebas unitarias con el doble en memoria, que siguen corriendo en cada PR;
- que el flujo sigue corriendo en los PR que tocan la red, el contrato o el cliente de Fabric;
- la ejecución manual antes de anexar la evidencia al documento de grado.

---

## ADR-0018 — Cifrado en reposo y respaldo diario cifrado de las bases del servidor del CCAV

**Estado:** Aceptada (2026-10-26, aprobada por Jhunier en #146)

**Contexto.** En el servidor del CCAV hay tres almacenes con datos sensibles, todos en
claro en el disco:

- la base de `mi-app-qr` (`userData/server-data/app.db`), con nombres, documentos y
  correos de los titulares y el historial `cid` → titular (ADR-0016);
- la bitácora de `verifier-service` (`evidence.sqlite3`), con el `cid` de cada validación
  aceptada (ADR-0013);
- los volúmenes y el material criptográfico de la red Fabric (ADR-0017).

ADR-0008 dejó pendiente la «estrategia de respaldo del almacenamiento» y nunca se cerró.
`docs/INSTALACION-CCAV.md` respalda la red Fabric y las claves, pero no las dos bases: si
falla el disco se pierden el registro de credenciales y los eventos que aún no se
anclaron, y quien se lleve el equipo o el disco lee todo sin necesitar ninguna cuenta.

**Alternativas consideradas.**

- **Cifrar la base desde la aplicación (SQLCipher).** Exige cambiar `better-sqlite3` por
  una variante con SQLCipher en `mi-app-qr` y otra en Python, y deja abierta la pregunta
  de dónde vive la clave de un servidor que arranca solo: en el mismo disco no protege
  nada, y pedirla a mano a cada arranque es lo mismo que el cifrado de disco, solo que
  para un archivo en vez de todo. Además dejaría fuera la bitácora, los volúmenes de
  Fabric y los archivos de anclaje.
- **Cifrado de disco completo.** Cubre los tres almacenes, los temporales y el *swap*, sin
  tocar código. No protege con el equipo encendido y desbloqueado: contra eso siguen
  valiendo las cuentas separadas (ADR-0016) y el HMAC del historial (#119).
- **Respaldo con cifrado simétrico (contraseña).** Cron no puede pedir una contraseña, y
  dejarla en el servidor equivale a no cifrar frente a quien se lleve el equipo.
- **Respaldo con cifrado de clave pública.** El servidor solo tiene la clave pública:
  puede cifrar todos los días sin que nada en él sirva para descifrar.

**Decisión.**

1. **Cifrado de disco completo** del servidor del CCAV, configurado al instalar el sistema
   operativo y antes de crear cualquier dato: LUKS2 en Linux, BitLocker en Windows. Se
   desbloquea con **frase de paso** que escribe el custodio al encender el equipo, no con
   TPM sin PIN: con el desbloqueo automático, quien se lleve el equipo entero lo arranca
   con el disco abierto. El custodio ya debe estar presente tras cada reinicio para
   arrancar el emisor (ADR-0016, punto 6), así que no agrega una dependencia nueva. La
   frase de paso y la clave de recuperación van al gestor de Jhunier, como las demás
   contraseñas (ADR-0016).
2. **Respaldo diario cifrado** con `infra/respaldo/respaldar-datos.sh`, desde cron con la
   cuenta `secureqr`:
   - copia en caliente las dos bases con la API de respaldo de SQLite (consistente
     aunque la app esté escribiendo) y comprueba cada copia con `PRAGMA integrity_check`
     antes de cifrarla;
   - agrega los JSON de la carpeta de anclaje (cabeza, compromisos, estado) y un
     `SHA256SUMS`;
   - cifra el paquete con **`age`** (formato abierto, X25519 y ChaCha20-Poly1305; no se
     implementa nada propio) hacia una o más claves públicas. La identidad privada la
     genera y guarda el custodio fuera del servidor, cifrada con su propia frase de paso,
     con copia en el medio externo de claves; la frase, en el gestor de Jhunier;
   - deja el respaldo en `/var/backups/secureqr-id` (en el disco cifrado) y conserva 14
     días. **Una vez por semana**, el custodio copia los respaldos al medio externo,
     junto con el de Fabric (ADR-0017), que ya va en un medio cifrado.
3. **Nunca en el mismo respaldo que las claves.** El script no toca `server-secrets.json`
   (`ASIGNACIONES_KEY`), ni el PEM de emisión, ni el secreto compartido. Las dos copias
   viajan en medios distintos (ADR-0016, #119).
4. **Restaurar es un paso manual.** `infra/respaldo/restaurar-datos.sh` descifra en una
   carpeta nueva y comprueba sumas e integridad; reemplazar las bases en uso se hace con
   `mi-app-qr` y `verifier-service` detenidos. Restaurar `app.db` hace retroceder la
   cabeza de asignaciones: el ciclo de anclaje devuelve el código 3 y lo anota, como ya
   prevé ADR-0016. Restaurar la bitácora a un punto anterior a un lote anclado deja un
   rango anclado sin sus eventos locales: se anota en `docs/STATE.md` y no se vuelve a
   anclar ese rango.
5. **Prueba.** `infra/respaldo/probar-respaldo.sh` corre en CI (`respaldo-test`): cifra,
   comprueba que no queda texto en claro, que una clave ajena no descifra, que una
   escritura sin confirmar no entra en la copia, que `server-secrets.json` nunca entra y
   que la conservación solo borra respaldos viejos.
6. **Los respaldos no sobreviven a la anonimización (ADR-0016, punto 10).** Cada
   respaldo guarda `app.db` con nombres, documentos y correos, y las copias del medio
   externo no tienen límite de tiempo. Sin una regla, quedarían datos que la
   autorización de tratamiento dice que se eliminan (Ley 1581 de 2012). Para eso se usa
   **borrado criptográfico**: como todo respaldo está cifrado hacia la identidad de
   `age`, destruirla vuelve ilegibles todas las copias de una vez, sin tener que
   localizarlas una por una.
   - **Al cierre del piloto**, primero se comprueba que la anonimización de las bases en
     uso terminó. Después, el custodio destruye la identidad privada de `age` (el
     archivo y su copia en el medio de claves) y su frase de paso del gestor de Jhunier,
     y borra los respaldos del servidor. Queda anotado en el registro de ejecución de la
     guía: fecha, quién y qué se destruyó. Lo mismo vale para una base dañada que se haya
     guardado aparte al restaurar.
   - **Si el `admin` configura un plazo de conservación**, los respaldos del medio
     externo no se guardan más tiempo que ese plazo. Si eso no es práctico, la identidad
     de `age` se rota en cada periodo y se destruye la del periodo vencido. Así una copia
     vieja no conserva lo que la base ya anonimizó.
   - **Restaurar un respaldo anterior a una anonimización** obliga a correr de nuevo la
     anonimización antes de reabrir el servicio.

**Consecuencias.**

- Cierra el pendiente de respaldo de ADR-0008.
- Destruir la identidad de `age` es irreversible: después del cierre no se puede
  restaurar ningún respaldo, ni siquiera para una auditoría. Se acepta, porque es lo
  que exige la autorización de tratamiento. La bitácora no se pierde, porque su
  integridad la prueban las raíces ancladas en Fabric y el sello en Bitcoin, no los
  respaldos.
- El servidor del CCAV necesita `age` (paquete de Debian y Ubuntu).
- Un reinicio sin el custodio deja el servidor detenido en la pantalla de desbloqueo,
  no solo sin emisor. Se acepta: en el piloto, sin custodio tampoco hay QR.
- Riesgo residual: con el equipo encendido, el cifrado de disco no protege. Y se pueden
  perder hasta 24 horas de altas y eventos entre un respaldo y el siguiente; los eventos
  anclados en ese lapso siguen comprobables en Fabric, aunque la copia local se pierda.
