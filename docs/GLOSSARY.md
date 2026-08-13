# Glosario

Vocabulario canónico del proyecto. **Los términos del código deben coincidir con los del
documento de grado.** Si el artículo dice "raíz de Merkle", el código dice `merkle_root`.

---

**Anclaje (anchoring).** Publicación de la raíz de Merkle de un lote de eventos en una
blockchain, para dotar a la bitácora local de evidencia de inmutabilidad verificable
desde fuera de la institución.

**Bitácora encadenada (hash-chained log).** Registro append-only en el que cada entrada
incluye el hash de la anterior. Alterar un evento pasado invalida toda la cadena
posterior, lo que hace la manipulación detectable.

**Blockchain permisionada.** Red distribuida con participantes identificados y gobernanza
definida, en oposición a una red pública abierta. En este proyecto se plantea Hyperledger
Fabric. Ver ADR-0007 sobre la limitación de gobernanza.

**Credencial.** El carné institucional con código QR. En este modelo **no es** prueba de
identidad, sino transporte de un reclamo criptográfico sujeto a validación.

**ECDSA.** Algoritmo de firma digital sobre curva elíptica. Elegido sobre RSA por producir
firmas mucho más compactas con seguridad equivalente, lo que importa dado el presupuesto
de bytes de un QR. Ver ADR-0001.

**Emisor (issuer).** Entidad que firma las credenciales con la clave privada institucional.

**Evidencia de manipulación (tamper-evident).** Propiedad de detectar alteraciones
posteriores. Distinta de *tamper-proof*: el modelo no impide que alguien modifique la
base de datos, garantiza que quedará en evidencia si lo hace.

**Frescura (freshness).** Propiedad de que una presentación sea reciente y no una
repetición. Se implementa con marca temporal y nonce.

**`kid` (key id).** Identificador de la clave pública que verifica un token. Permite rotar
claves sin invalidar todas las credenciales emitidas.

**Nonce.** Valor de un solo uso generado con un CSPRNG. Un nonce ya visto invalida la
presentación aunque la firma sea correcta.

**Prueba de inclusión.** Camino de hashes desde una hoja del árbol de Merkle hasta la raíz
anclada. Permite verificar que un evento concreto formaba parte del lote sin revelar los
demás eventos ni emitir transacciones nuevas.

**QRLjacking.** Ataque documentado por OWASP: secuestro de sesiones de autenticación
basadas en QR cuando no hay mecanismos de verificación adecuados.

**Raíz de Merkle (merkle root).** Hash superior de un árbol de Merkle. Resume un lote
completo de eventos en un único valor. Es lo único que viaja a la blockchain.

**Revocación.** Invalidación de una credencial antes de su expiración natural: pérdida
del carné, suspensión académica, desvinculación laboral.

**`SQRID/1`.** Versión 1 del formato de payload que viaja dentro del código QR. Ver
`SQRID-1.md`.

**Token efímero.** Credencial con vigencia corta que debe regenerarse periódicamente.
Se opone al QR estático, reutilizable indefinidamente por quien lo captura.

**Verificador (verifier).** Punto de control que decide aceptar o rechazar una credencial
presentada.

---

## Formas canónicas

- **SecureQR-ID** — nunca "SecureQR" a secas (nombre tomado por terceros) ni "Secure QR ID"
- **UNAD CCAV Pitalito** — no "CEAD Pitalito". Ver ADR-0006
- **Ley 1581 de 2012** — no "Ley de Habeas Data" en texto formal
- **CONPES 3995** — Política Nacional de Confianza y Seguridad Digital
