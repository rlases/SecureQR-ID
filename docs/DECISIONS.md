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

**Estado:** Abierta

**Contexto.** El SDK de Hyperledger Fabric para Python no tiene mantenimiento activo;
el oficial y mantenido es el de Node.js (`fabric-network`). Python, por su parte, ofrece
mejor ergonomía para la parte criptográfica y para el análisis estadístico de la fase de
evaluación.

**Opciones.** (a) Todo en Node.js. (b) Todo en Python, con un puente mínimo a Fabric.
(c) Repositorio políglota: Python para `issuer`/`verifier`/`evidence-log`, Node para
`anchor`.

**Pendiente de decidir.** Al resolverse, actualizar `CLAUDE.md`, el README y esta entrada.

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

**Estado:** Propuesta

**Contexto.** Se plantea Hyperledger Fabric por ser permisionada, con control de
participantes y gobernanza definida. Pero una red permisionada operada por la misma
institución que podría querer alterar los registros ofrece una garantía debilitada:
si la UNAD controla todos los nodos, el anclaje no protege contra la UNAD.

**Propuesta.** Definir explícitamente quiénes son los pares de la red y por qué su
independencia hace creíble la evidencia. Alternativa a evaluar: anclaje en una cadena
pública mediante un servicio de sellado temporal, que elimina el problema de gobernanza
a costa de introducir dependencia externa.

**Pendiente.** Esta es la objeción más probable en la sustentación. Resolverla antes.
