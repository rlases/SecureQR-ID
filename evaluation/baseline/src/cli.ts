import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { release, type } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ejecutarCasos } from './casos.js';
import { ETIQUETA, cargarLineaBase } from './lineaBase.js';
import { aCsv, resumen } from './resultados.js';
import { csvComun, filasComunes } from './comun.js';

// Uso: npm run brazo -- --salida <carpeta> [--intentos 200] [--control 1000] [--repo <ruta>]

const AYUDA =
  'Uso: npm run brazo -- --salida <carpeta> [--intentos N] [--control N] [--semilla S] [--anio AAAA] [--repo <ruta>]';

function estadoEvaluador() {
  const raiz = resolve(import.meta.dirname, '../../..');
  const git = (...args: string[]) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' }).trim();
  return { evaluador_commit: git('rev-parse', 'HEAD'), arbol_modificado: Boolean(git('status', '--porcelain')) };
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      salida: { type: 'string' },
      intentos: { type: 'string', default: '200' },
      control: { type: 'string', default: '1000' },
      semilla: { type: 'string', default: '20261027' },
      anio: { type: 'string' },
      repo: { type: 'string', default: resolve(import.meta.dirname, '../../..') },
    },
  });
  if (!values.salida) {
    console.error(AYUDA);
    return 2;
  }
  const intentos = Number(values.intentos);
  const control = Number(values.control);
  const semilla = Number(values.semilla);
  const anio = values.anio ? Number(values.anio) : new Date().getUTCFullYear();
  if (![intentos, control, semilla, anio].every(Number.isInteger) || intentos < 1 || control < 1) {
    console.error(AYUDA);
    return 2;
  }

  const carpeta = resolve(values.salida);
  if (existsSync(carpeta) && readdirSync(carpeta).length > 0) {
    console.error(`${carpeta} ya tiene contenido; no se sobrescriben resultados.`);
    return 2;
  }
  const lineaBase = await cargarLineaBase(values.repo);
  try {
    const filas = ejecutarCasos(lineaBase.parseQrTextData, { intentos, control, semilla, anio });
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, 'resultados.csv'), csvComun(filas));
    writeFileSync(join(carpeta, 'resultados.json'), JSON.stringify(filasComunes(filas), null, 2) + '\n');
    writeFileSync(join(carpeta, 'tradicional.csv'), aCsv(filas));
    writeFileSync(join(carpeta, 'tradicional-resumen.json'), JSON.stringify(resumen(filas), null, 2) + '\n');
    writeFileSync(
      join(carpeta, 'tradicional-entorno.json'),
      JSON.stringify(
        {
          etiqueta: ETIQUETA,
          commit: lineaBase.commit,
          ...estadoEvaluador(),
          intentos,
          control,
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
