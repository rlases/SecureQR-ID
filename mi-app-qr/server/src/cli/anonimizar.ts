import readline from 'node:readline/promises';
import os from 'node:os';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import {
  FRASE_CIERRE,
  anonimizarCierre,
  anonimizarVencidos,
} from '../titulares/anonimizacion.js';

// Comando de anonimización (ADR-0016, punto 10; issue #90).
//
//   npm run anonimizar -- --cierre      cierre del piloto: pide escribir la frase
//   npm run anonimizar -- --vencidos    aplica el plazo de conservación configurado
//
// Se ejecuta en el servidor, con el servicio detenido o no: SQLite serializa la escritura.
// La bitácora de evidence-log/ no se toca.

const USO = 'Uso: anonimizar --cierre [--confirmar "ANONIMIZAR TODO"] | --vencidos';

async function main(argv: string[]): Promise<number> {
  const dbPath = process.env.DB_PATH ?? './data/app.db';
  const quien = `${os.userInfo().username} (línea de comandos)`;
  if (argv.includes('--vencidos')) {
    const db = openDatabase(dbPath);
    runMigrations(db);
    const r = anonimizarVencidos(db, new Date(), quien);
    db.close();
    console.log(
      r === null
        ? 'No hay plazo de conservación configurado: no se anonimizó nada.'
        : `Anonimizados por plazo: ${r.registros} registros y ${r.consultas} consultas.`
    );
    return 0;
  }
  if (!argv.includes('--cierre')) {
    console.error(USO);
    return 2;
  }
  let confirmacion = '';
  const i = argv.indexOf('--confirmar');
  if (i >= 0) {
    confirmacion = argv[i + 1] ?? '';
  } else if (process.stdin.isTTY) {
    console.log(
      'Vas a anonimizar los datos personales de TODOS los titulares, registros y consultas.\n' +
        'No se puede deshacer. La bitácora de evidence-log/ no se toca.'
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    confirmacion = await rl.question(`Escribe «${FRASE_CIERRE}» para confirmar: `);
    rl.close();
  }
  if (confirmacion !== FRASE_CIERRE) {
    console.error('Sin confirmación: no se anonimizó nada.');
    return 1;
  }
  const db = openDatabase(dbPath);
  runMigrations(db);
  const r = anonimizarCierre(db, confirmacion, quien, new Date());
  db.close();
  console.log(
    `Anonimizados: ${r.titulares} titulares, ${r.registros} registros y ${r.consultas} consultas.`
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error('No se pudo anonimizar:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
