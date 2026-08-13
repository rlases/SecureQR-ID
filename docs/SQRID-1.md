# Formato de token `SQRID/1`

> Estado: **borrador**. Versión 1 del formato de payload que viaja dentro del código QR.
> Darle nombre y versión al formato lo hace citable en la publicación y comparable con
> otras propuestas. Los cambios incompatibles crean `SQRID/2`, no modifican esta versión.

## Campos

| Campo | Nombre | Descripción |
|---|---|---|
| `v` | versión | Identificador de formato. Valor fijo: `SQRID/1` |
| `kid` | key id | Identifica qué clave pública del emisor verifica esta firma |
| `cid` | credential id | Identificador opaco de la credencial. **No** el número de documento |
| `iat` | issued at | Marca temporal de emisión |
| `exp` | expires at | Marca temporal de expiración |
| `n` | nonce | Valor de un solo uso, generado con CSPRNG |
| `sig` | signature | Firma ECDSA sobre la concatenación canónica de los campos anteriores |

## Reglas de diseño

**`cid` es opaco.** No es la cédula ni el código de estudiante. Es un identificador
interno sin significado fuera del sistema. Si alguien decodifica el QR sin autorización,
no obtiene un dato personal. Esta regla es lo que permite cumplir el principio de
minimización de la Ley 1581 de 2012.

**`kid` habilita la rotación de claves.** Sin él, cambiar la clave institucional
invalidaría de golpe todas las credenciales emitidas. Con él, el verificador sabe cuál
de las claves vigentes aplicar.

**`exp` corto.** El valor concreto es un compromiso entre seguridad y usabilidad: más
corto reduce la ventana de repetición, pero exige regeneración más frecuente y falla
peor con conectividad intermitente. Parametrizable, no constante en el código.

**La firma cubre todos los campos.** Incluida la versión. Un atacante no debe poder
degradar el token a una versión futura más permisiva.

**Codificación canónica.** La serialización que se firma debe ser determinista: mismo
contenido, mismos bytes, siempre. Una serialización con orden de campos variable produce
firmas que no verifican, o peor, permite maleabilidad del payload.

## Decisiones pendientes

- Serialización concreta y su compacidad. El presupuesto de bytes del QR es el límite
  real: hay que medir la densidad resultante contra la legibilidad en impresión sobre
  carné plástico, con cámaras de gama baja y con desgaste.
- Curva elíptica y función hash específicas.
- Formato de la marca temporal y tolerancia admitida al desfase de reloj entre emisor
  y verificador.
- Si el token se transporta como texto en el QR o en una codificación binaria compacta.

## Ejemplo

<!-- TODO: incluir un token de ejemplo con datos sintéticos, nunca reales -->
