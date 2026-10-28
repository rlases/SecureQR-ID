import { mkdirSync, writeFileSync } from 'node:fs';
import { release, type } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ejecutarCasos } from './casos.js';
import { ETIQUETA, cargarLineaBase } from './lineaBase.js';
import { aCsv, resumen } from './resultados.js';

// Uso: npm run brazo -- --salida <carpeta> [--intentos 200] [--semilla 20261028] [--repo <ruta>]

const AYUDA =
  'Uso: npm run brazo -- --salida <carpeta> [--intentos N] [--semilla S] [--anio AAAA] [--repo <ruta>]';

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      salida: { type: 'string' },
      intentos: { type: 'string', default: '200' },
      semilla: { type: 'string', default: '20261028' },
      anio: { type: 'string' },
      repo: { type: 'string', default: resolve(import.meta.dirname, '../../..') },
    },
  });
  if (!values.salida) {
    console.error(AYUDA);
    return 2;
  }
  const intentos = Number(values.intentos);
  const semilla = Number(values.semilla);
  const anio = values.anio ? Number(values.anio) : new Date().getUTCFullYear();
  if (![intentos, semilla, anio].every(Number.isInteger) || intentos < 1) {
    console.error(AYUDA);
    return 2;
  }

  const lineaBase = await cargarLineaBase(values.repo);
  try {
    const filas = ejecutarCasos(lineaBase.parseQrTextData, { intentos, semilla, anio });
    const carpeta = resolve(values.salida);
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, 'tradicional.csv'), aCsv(filas));
    writeFileSync(join(carpeta, 'tradicional-resumen.json'), JSON.stringify(resumen(filas), null, 2) + '\n');
    writeFileSync(
      join(carpeta, 'tradicional-entorno.json'),
      JSON.stringify(
        {
          etiqueta: ETIQUETA,
          commit: lineaBase.commit,
          intentos,
          semilla,
          anio,
          node: process.version,
          so: `${type()} ${release()}`,
          fecha: new Date().toISOString(),
        },
        null,
        2
      ) + '\n'
    );
    console.log(`Brazo tradicional: ${filas.length} presentaciones en ${carpeta}`);
    return 0;
  } finally {
    lineaBase.cerrar();
  }
}

main(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
