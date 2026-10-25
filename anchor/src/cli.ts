/**
 * Comando `anclar` (issue #91, ADR-0017):
 *
 *     node dist/cli.js anclar --batch lote.json --receipt recibo.json
 *
 * Lee el lote que exportó `evidence-log/`, construye el árbol de Merkle, publica la
 * raíz en Fabric y escribe el recibo. Lo invoca `evidence-log cycle` como un proceso
 * aparte. Códigos de salida (los mismos que interpreta `cycle`):
 *
 *   0  raíz anclada (o ya estaba con la misma raíz) y recibo escrito
 *   1  falla de la red o de Fabric: no se escribe recibo; se reintenta después
 *   2  error de uso, de configuración o de formato del lote
 *   3  ALERTA: el lote registrado en Fabric no coincide con el lote local
 */
import { mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorBatch, AnchorMismatchError, type LedgerClient } from './anchoring.js';
import { loadBatch } from './batch.js';
import { connectFabric, errorText, fabricConfigFromEnv } from './fabric.js';

export const EXIT_OK = 0;
export const EXIT_LEDGER_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_ALERT = 3;

export interface CliDependencies {
  openLedger: () => Promise<{ ledger: LedgerClient; close: () => void }>;
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultDependencies: CliDependencies = {
  openLedger: async () => connectFabric(fabricConfigFromEnv(process.env)),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

function parseArgs(argv: string[]): { batch: string; receipt: string } | null {
  if (argv[0] !== 'anclar') {
    return null;
  }
  const options: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!['--batch', '--receipt'].includes(name) || value === undefined) {
      return null;
    }
    options[name] = value;
  }
  if (!options['--batch'] || !options['--receipt']) {
    return null;
  }
  return { batch: options['--batch'], receipt: options['--receipt'] };
}

function writeAtomically(path: string, content: string): void {
  const directory = mkdtempSync(join(dirname(path), '.recibo-'));
  const temporary = join(directory, 'recibo.json');
  try {
    writeFileSync(temporary, content, { encoding: 'utf-8', mode: 0o644 });
    renameSync(temporary, path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function main(
  argv: string[],
  dependencies: Partial<CliDependencies> = {},
): Promise<number> {
  const deps = { ...defaultDependencies, ...dependencies };
  const args = parseArgs(argv);
  if (args === null) {
    deps.err('Uso: anclar --batch lote.json --receipt recibo.json');
    return EXIT_USAGE;
  }

  let batch;
  try {
    batch = loadBatch(args.batch);
  } catch (error) {
    deps.err(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_USAGE;
  }

  let connection;
  try {
    connection = await deps.openLedger();
  } catch (error) {
    deps.err(`No se pudo conectar con Fabric: ${errorText(error)}`);
    return EXIT_LEDGER_FAILED;
  }

  try {
    const receipt = await anchorBatch(batch, connection.ledger);
    writeAtomically(args.receipt, JSON.stringify(receipt));
    deps.out(
      `${receipt.batch_id} anclado: transacción ${receipt.transaction_id}, bloque ${receipt.block_number}`,
    );
    return EXIT_OK;
  } catch (error) {
    if (error instanceof AnchorMismatchError) {
      deps.err(`ALERTA: ${error.message}`);
      return EXIT_ALERT;
    }
    deps.err(`El anclaje de ${batch.batchId} falló: ${errorText(error)}`);
    return EXIT_LEDGER_FAILED;
  } finally {
    connection.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
