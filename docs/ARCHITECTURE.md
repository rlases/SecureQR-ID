# Arquitectura

> Estado: **implementación parcial**. `issuer/` y `verifier/` ya materializan la capa de
> validación; consolidación local y anclaje siguen pendientes.

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

Participan `issuer/` (offline, emitió el token antes), `verifier-web/` (captura y
presenta) y `verifier/` (en línea, decide).

### 2. Consolidación local (sincrónica, ligera)

Cada validación aceptada produce un evento que se encadena por hash al anterior. La
cadena vive en la infraestructura de la institución. Detecta cualquier modificación
posterior, incluso hecha por un administrador con privilegios.

Participa `evidence-log/`.

### 3. Anclaje histórico (asíncrono, periódico)

Un proceso en segundo plano agrupa los eventos recientes, construye un árbol de Merkle
y publica **solo la raíz** en una blockchain permisionada. Eso convierte la bitácora
local en algo verificable desde fuera de la institución.

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
10. *(Periódico)* Calcular la raíz de Merkle de los eventos recientes.
11. *(Periódico)* Anclar la raíz en la blockchain permisionada.

El orden de los pasos 3–6 no es negociable: verificar la firma antes de procesar
cualquier otro campo evita trabajar sobre un payload no confiable.

## Módulos y fronteras

| Módulo | Responsabilidad | Frontera dura |
|---|---|---|
| `issuer/` | Firma ECDSA de tokens; custodia del par de claves institucional | La clave privada no sale de aquí |
| `verifier/` | Decide aceptar o rechazar | No firma, no ancla |
| `verifier-web/` | Captura el QR y presenta la decisión | No interpreta el token, no decide, no persiste identificadores |
| `evidence-log/` | Encadena eventos por hash; append-only | No decide, solo registra lo aceptado |
| `anchor/` | Merkle + Hyperledger Fabric | Solo ve hashes, nunca datos personales |
| `revocation/` | Lista firmada de credenciales invalidadas | Su firma se verifica igual que la de un token |

## Decisiones de arquitectura pendientes

Registradas como ADR abiertos en `DECISIONS.md`:

- Distribución de la lista de revocación a verificadores con conectividad intermitente.

El stack se cerró en ADR-0005. La gobernanza de la red blockchain se cerró en ADR-0007:
anclaje híbrido — Hyperledger Fabric para la operación local, más un sellado periódico
de la raíz de la ledger en Bitcoin vía OpenTimestamps para la garantía de no repudio que
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

`mi-app-qr/` es una aplicación de escritorio (Electron + React) de registro de asistencia
por QR, construida antes de este diseño y funcional de forma independiente. Es exactamente
el sistema convencional que el planteamiento del problema describe: decodifica un QR de
**texto plano** (nombre, documento, programa, ciudad y vigencia por expresión regular) y
guarda los registros en `localStorage`, sin firma, sin nonce, sin bitácora encadenada.

No implementa ninguno de los cinco módulos de este documento y no debe confundirse con
`issuer/` o `verifier/`. Su valor es el de línea base empírica: sirve para medir, en la
fase de evaluación (Fase 4 de `ROADMAP.md`), la reducción de suplantación y el tiempo de
registro del modelo SecureQR-ID frente a un sistema QR convencional real, tal como plantea
el diseño cuasi-experimental de la propuesta de grado.

**Evolución en curso (ADR-0008).** El prototipo pasa de monopuesto a cliente-servidor: al
ejecutarse levanta un servidor accesible por su IP en la red institucional, con inicio de
sesión para personal (nunca para estudiantes) y roles diferenciados para registrar,
consultar, corregir y generar informes. Esto no lo convierte en `verifier/` — sigue sin
validación criptográfica alguna — pero sí cambia dos cosas que importan para este diseño:

1. **Aparece almacenamiento compartido y persistente**, que es donde eventualmente se
   apoyaría `evidence-log/`.
2. **Aparece la noción de "quién hizo qué"**, ausente hasta ahora. Las correcciones deben
   registrarse como eventos nuevos, no como sobrescrituras, para no chocar de frente con
   la invariante append-only de `evidence-log/` cuando ambos convivan.
