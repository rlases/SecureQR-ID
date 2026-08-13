---
paths:
  - "issuer/**"
  - "verifier/**"
  - "revocation/**"
---

# Reglas para código criptográfico

Estás tocando la ruta crítica de seguridad del sistema. Aplica siempre:

- **No implementes primitivas propias.** Firma, hash y generación de aleatoriedad salen
  de librerías establecidas y mantenidas. Nada de aritmética de curva elíptica a mano,
  nada de "una implementación mínima de SHA-256 para no traer dependencias".
- **Aleatoriedad criptográfica siempre.** Nonces, salts e identificadores usan un CSPRNG
  (`secrets` en Python, `crypto.randomBytes` en Node). Nunca `random`, `Math.random` ni
  una marca temporal como fuente de entropía.
- **Comparación en tiempo constante** para firmas, tokens y cualquier valor secreto.
  `==` sobre un secreto es una fuga por canal lateral.
- **Falla cerrado.** Si la verificación no puede completarse —clave ausente, lista de
  revocación inalcanzable, reloj inconsistente— el resultado es rechazo, nunca aceptación
  por defecto ni "modo degradado permisivo".
- **Orden de validación:** firma → expiración → nonce no visto → revocación. No reordenes
  para "optimizar"; verificar la firma primero evita procesar payloads no confiables.
- **Sin claves en el código.** Ni literales, ni valores por defecto, ni ejemplos "solo
  para pruebas". Se cargan desde el entorno o desde un almacén externo.
- **Sin secretos en logs ni en mensajes de error.** Un error de verificación no revela
  qué componente falló al usuario final; el detalle va a la bitácora interna.

Cualquier cambio en el esquema de firma, la construcción del nonce o la ventana temporal
de validez exige un ADR nuevo en `docs/DECISIONS.md` **antes** de escribir el código.
