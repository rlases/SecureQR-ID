# Formato de token `SQRID/1`

> Estado: **aceptado para implementación** mediante ADR-0010. Versión 1 del formato de
> payload que viaja dentro del código QR. Darle nombre y versión al formato lo hace
> citable en la publicación y comparable con otras propuestas. Los cambios incompatibles
> crean `SQRID/2`, no modifican esta versión.

## Campos

| Campo | Nombre | Descripción |
|---|---|---|
| `v` | versión | Texto fijo `SQRID/1` |
| `kid` | key id | Texto Base64url de 22 caracteres; huella de 128 bits de la clave pública |
| `cid` | credential id | Texto Base64url de 22 caracteres; id opaco aleatorio de 128 bits |
| `iat` | issued at | Entero de segundos Unix en UTC |
| `exp` | expires at | Entero de segundos Unix en UTC; siempre mayor que `iat` |
| `n` | nonce | Byte string CBOR de 16 bytes nuevos generados con CSPRNG |
| `sig` | signature | Byte string CBOR de 64 bytes con la firma ECDSA P1363 `r || s` |

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

## Construcción normativa

1. Generar un `cid` opaco de 16 bytes con CSPRNG cuando se crea la credencial y
   representarlo como Base64url sin `=`. El emisor solo acepta esta forma canónica; un
   número de documento no cumple el formato.
2. Derivar `kid` como los primeros 16 bytes de SHA-256 sobre la clave pública P-256 en
   DER SubjectPublicKeyInfo y representarlo como Base64url sin `=`.
3. Para cada emisión, fijar `iat` al segundo Unix UTC actual, calcular `exp` con una
   duración positiva recibida por configuración y generar `n` con 16 bytes nuevos de
   CSPRNG.
4. Formar un mapa con exactamente `v`, `kid`, `cid`, `iat`, `exp` y `n`. Codificarlo
   mediante CBOR determinista conforme a RFC 8949. Esos son los bytes firmados.
5. Firmar esos bytes con ECDSA P-256 + SHA-256. Convertir la firma DER de la biblioteca a
   dos enteros sin signo de 32 bytes en orden de red (`r || s`) y normalizar `s` a la
   mitad inferior del orden de P-256 (*low-S*).
6. Añadir `sig` al mapa y codificar el mapa completo, con exactamente siete campos,
   mediante CBOR determinista.
7. Transportar el resultado como Base64url sin relleno. No se añade un prefijo textual:
   la versión ya está dentro del contenido firmado.

El mapa no acepta campos desconocidos. Añadir uno, cambiar un tipo o alterar cualquiera
de estas reglas requiere `SQRID/2` y un ADR previo.

## Reglas de validación que corresponden a `verifier/`

El verificador deberá decodificar Base64url y CBOR en forma estricta, exigir exactamente
los campos y tipos anteriores, reconstruir el mapa sin `sig`, comprobar que `kid`
corresponde a la clave pública y validar la firma P-256/SHA-256. También deberá rechazar
firmas fuera de rango, de longitud distinta a 64 bytes o con `s` alto antes de evaluar
expiración, nonce o revocación. Estas reglas se documentan aquí para que ambos módulos
firmen los mismos bytes; su implementación no pertenece a `issuer/`.

La política temporal se cerró en ADR-0011: `clock_skew_seconds` es configuración externa
obligatoria entre 0 y 60 segundos. El token es vigente si `iat <= now + skew`,
`now < exp + skew` y `exp > iat`; un retroceso del reloj mayor que la tolerancia se
rechaza usando un máximo temporal persistente.

## Decisiones pendientes de evaluación

- Densidad y legibilidad del token Base64url/CBOR impreso o mostrado en pantalla, con
  cámaras de gama baja y desgaste físico.

## Ejemplo

<!-- TODO: incluir un token de ejemplo con datos sintéticos, nunca reales -->
