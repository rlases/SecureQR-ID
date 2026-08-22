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

**Pendiente de decidir.**

- **Transporte:** HTTP plano en la LAN expone las credenciales del personal a cualquiera
  que escuche la red WiFi institucional. HTTPS con certificado autofirmado es incómodo en
  navegadores pero es lo mínimo defendible. Decidir explícitamente y justificar.
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
