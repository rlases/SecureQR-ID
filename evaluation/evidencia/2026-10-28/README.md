# Evidencia de laboratorio del objetivo 3

Paquete conservado para el anexo del documento de grado. Contiene las filas originales,
los entornos y la comparación; todas las identidades son sintéticas y no incluye claves.

- **SecureQR-ID:** [corrida oficial 40635336117](https://github.com/rlases/SecureQR-ID/actions/runs/40635336117),
  sobre `6ef5cb9df3c0b3ffb31ce5d045352ef732c5bb61`, con Fabric, 200 intentos por caso,
  1000 controles y semilla `20261027`. Artefacto `evaluacion-40635336117`, id `12793788797`.
  Se verificó el SHA-256 del ZIP descargado contra el digest de GitHub:
  `816eb0800dac4ae2aaa5c3f7b60e609f8f419988551825900d4f68bbf5df1cbc`.
  Las cinco salidas originales están intactas en `secureqr/` dentro del paquete.
- **Tradicional:** 200 intentos por clase F/P/V y 1000 controles; parser de
  `baseline-o3 = 1b4498af0d2a76ceeadce0a114c40d9d758c7aab`. Evaluador y comparador en
  `5840c51cba2d4b3a9aeaf2d9bda0b305823f534a`, con árbol limpio, Node 22.18.0,
  año de referencia 2026 y la misma semilla. Su entorno conserva la fecha efectiva.
- **Resultado oficial:** 3400/3400 ataques detectados, 0/1000 falsos rechazos y
  ningún motivo incorrecto. Se recalculó `resumen.json` desde las 4400 filas y coincide
  con el resumen original.
- **Comparación:** [comparacion.md](comparacion.md), con F/P/V, falso rechazo e
  intervalos de Wilson. Los tamaños por clase difieren porque SecureQR-ID tiene
  varios casos por clase; no se equiparan los globales de catálogos distintos.

La [corrida oficial](https://github.com/rlases/SecureQR-ID/actions/runs/40635336117)
es anterior a la ampliación del flujo que reúne ambos brazos. Por eso este paquete
conserva dos procedencias y no afirma que se midieran en una misma máquina o versión.
Los tiempos del parser y de HTTP no son tiempos comparables de registro en campo.
Las metas de reducción de suplantación y de tiempo requieren todavía el piloto.

## Conservación y reproducción

[`evidencia.zip`](evidencia.zip) incluye `secureqr/`, `tradicional/`, `comparacion/` y
`manifiesto.json`, que registra el SHA-256 de cada archivo y las revisiones utilizadas.
SHA-256 del paquete:

```text
96d0272d38311da87940f88598698fa3a7f5faf661a18aebd6e3d7298a5aca69
```

Descomprimirlo en una carpeta nueva. Desde la raíz del repositorio, con los paquetes de
`evaluation/` instalados, recalcular el informe usando esa carpeta:

```bash
python evaluation/baseline/comparar.py \
  --tradicional /ruta/paquete/tradicional/resultados.json \
  --secureqr /ruta/paquete/secureqr/resultados.json \
  --salida /ruta/paquete/comparacion-recalculada
```

El informe de tasas y su JSON deben coincidir con los conservados en `comparacion/`.
Los archivos de procedencia usan rutas relativas a su propia carpeta. El comparador
no sobrescribe evidencia existente. El ZIP versionado permite conservar los resultados
después del vencimiento del artefacto de Actions (2027-01-26).
