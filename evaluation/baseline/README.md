# Brazo tradicional de la batería (ADR-0019, punto 4)

Ejecuta los casos F, P y V del catálogo de ADR-0019, más el grupo de control, contra la
lectura de QR de la línea base: `parseQrTextData`, la función que usa la pantalla de
registro (`RegistrosPage`) de `mi-app-qr` en la etiqueta `baseline-o3`.

**La etiqueta no se modifica.** El parser se extrae con `git show baseline-o3:…` a una
carpeta temporal, se carga desde ahí y la carpeta se borra al terminar. El commit de la
etiqueta queda en `tradicional-entorno.json`.

```bash
cd evaluation/baseline
npm ci
npm test
npm run brazo -- --salida ../resultados/2026-10-28 --intentos 200 --semilla 20261028
```

Necesita la etiqueta `baseline-o3` en el clon (`git fetch --tags`).

| Caso | Qué se presenta | Variante |
|---|---|---|
| control | El carné vigente de su titular, una vez | `vigente` |
| F | Un carné con nombre y documento inventados | `identidad_inventada` |
| P | El texto de un carné ya presentado, otra vez; solo cuenta la segunda | `segunda_presentacion` |
| V | El carné de alguien retirado | `retirado_vigente` o `vigencia_vencida`, mitad y mitad |

R y M no aplican a la línea base: no firma ni tiene bitácora encadenada. El resumen los
lista en `noAplica` y no los cuenta como rechazos.

**Qué se cuenta como aceptado:** toda lectura que rellena el formulario. Que el documento
tenga una entrada abierta no es un rechazo, porque la pantalla solo pide confirmar y el
registro se guarda.

**Salida**, en la carpeta indicada:

- `tradicional.csv`: una fila por presentación, con las columnas comunes del informe
  (`brazo,caso,variante,repeticion,decision,motivo,ms`);
- `tradicional-resumen.json`: la tasa por caso (detección en F, P y V; falso rechazo en
  el control) con su intervalo de Wilson al 95 %, más la detección global;
- `tradicional-entorno.json`: etiqueta, commit, intentos, semilla, año de referencia,
  Node, sistema operativo y fecha.

Las identidades son sintéticas: nombres de una lista fija y documentos aleatorios. El
generador con semilla (mulberry32) solo hace repetible la corrida; no es criptográfico ni
se usa para nada de seguridad.

Los milisegundos miden solo la lectura local del texto. No son comparables con el tiempo
de validación del brazo SecureQR-ID, que pasa por HTTP; el tiempo de registro comparable
es el que se cronometra en campo (`docs/PROTOCOLO-PILOTO.md`, §5).
