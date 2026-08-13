---
paths:
  - "evidence-log/**"
  - "anchor/**"
---

# Reglas para bitácora y anclaje

## `evidence-log/` — bitácora local encadenada

- **Append-only.** No existe operación de borrado ni de actualización. Si un evento se
  registró mal, se añade un evento correctivo; no se edita el anterior.
- Cada evento incluye el hash del evento anterior. Un evento sin predecesor válido
  rompe la cadena y debe detectarse, no silenciarse.
- El primer evento de la cadena (génesis) se documenta explícitamente; no se genera
  de forma implícita al primer arranque.
- La verificación de la cadena completa debe ser una operación disponible y testeada,
  no un procedimiento manual.

## `anchor/` — Merkle y blockchain

- **A la cadena solo va la raíz de Merkle.** Nunca datos personales. Nunca un hash cuyo
  preimagen viva en un espacio pequeño y enumerable, como un número de documento sin sal:
  eso es reidentificable por fuerza bruta y es irreversible una vez anclado.
- El anclaje es **asíncrono**. Nunca bloquea la validación de una credencial en el punto
  de control. Si la red no responde, los eventos se acumulan y se anclan después.
- La prueba de inclusión (camino desde la hoja hasta la raíz) debe poder generarse y
  verificarse sin necesidad de emitir transacciones nuevas.
- Los parámetros del lote —cada cuántos eventos o cada cuánto tiempo se ancla— son
  configurables, no constantes incrustadas en el código.

Este módulo es el que materializa la diferencia entre "registro local" y "evidencia
externa". No los mezcles: la distinción es el aporte central del modelo.
