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
npm run brazo -- --salida ../resultados/tradicional --intentos 200 --control 1000 --semilla 20261027
```

Necesita la etiqueta `baseline-o3` en el clon (`git fetch --tags`).
Requiere Node 22.12 o posterior, como el ejecutor de pruebas fijado en el lock.
Los valores por defecto son 200 intentos por clase maliciosa, 1000 controles y
semilla 20261027, como en #151. La carpeta de salida debe ser nueva o vacía: no se
sobrescribe la evidencia de una corrida anterior.

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

- `resultados.json` y `resultados.csv`: una fila por presentación con el contrato
  de `secureqr_evaluation.ejecutor.Fila` de #151, ampliado con `variante` en #152:
  `brazo,caso,clase,repeticion,variante,malicioso,decision,motivo,motivo_correcto,ms`.
  `caso`/`clase` conservan F, P, V y `control`; `malicioso` separa el control de los
  ataques. `motivo_correcto` es nulo porque el parser tradicional no tiene un
  registro interno de códigos de seguridad comparable al del verificador;
- `tradicional.csv`: detalle adicional con `variante`, conservado para distinguir
  el carné retirado con vigencia futura del vencido. Sus siete columnas **no** son
  el contrato de intercambio con #151;
- `tradicional-resumen.json`: la tasa por caso (detección en F, P y V; falso rechazo en
  el control) con su intervalo de Wilson al 95 %, más la detección global;
- `tradicional-entorno.json`: etiqueta, commit, intentos, semilla, año de referencia,
  tamaño del grupo de control, Node, sistema operativo y fecha. `commit` identifica
  el parser histórico; `evaluador_commit` y `arbol_modificado` identifican el ejecutor.

## Informe de ambos brazos

Requiere el paquete Python `evaluation/` de la pila #160–#162 instalado con sus dependencias
(ver `evaluation/README.md`). Desde la raíz del repositorio, después de ejecutar
los dos brazos:

```bash
python evaluation/baseline/comparar.py \
  --tradicional evaluation/resultados/tradicional/resultados.json \
  --secureqr evaluation/resultados/secureqr/resultados.json \
  --salida evaluation/resultados/comparacion
python -m pytest -q evaluation/baseline/test/test_comparar.py
```

`comparar.py` usa las métricas reales de #151 y produce `comparacion.md` con F/P/V
lado a lado y el falso rechazo del control, `comparacion.json` y las rutas/hash
SHA-256 de los archivos de entrada en `comparacion-origen.json`. Rechaza brazos
equivocados, casos ajenos al catálogo, motivos de rechazo sin verificar, filas
inconsistentes, intentos duplicados y una salida no vacía. Las rutas de origen son
relativas a la carpeta de comparación para conservar la procedencia al mover el paquete.
Los archivos `tradicional-entorno.json` y `entorno.json` se conservan junto a los
resultados originales: el resumen no reemplaza su procedencia.

R/M se declaran no aplicables al brazo tradicional. No se comparan los globales
cuando SecureQR-ID incluye esas clases adicionales. El informe de laboratorio no
demuestra por sí solo H1 ni H2 del piloto.

La corrida manual `evaluacion.yml` genera los dos brazos con los mismos parámetros y
guarda también la comparación en su artefacto. Para comparar una corrida oficial ya
descargada se usa el mismo comando, conservando su `entorno.json` original: no se
atribuye al código actual una medición hecha sobre otro commit.

Las identidades son sintéticas: nombres de una lista fija y documentos aleatorios. El
generador con semilla (mulberry32) solo hace repetible la corrida; no es criptográfico ni
se usa para nada de seguridad.

Los milisegundos miden solo la lectura local del texto. No son comparables con el tiempo
de validación del brazo SecureQR-ID, que pasa por HTTP; el tiempo de registro comparable
es el que se cronometra en campo (`docs/PROTOCOLO-PILOTO.md`, §5).
