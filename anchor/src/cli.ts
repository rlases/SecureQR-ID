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
 *
 * Comando `verificar` (issue #93, ADR-0017 punto 8):
 *
 *     node dist/cli.js verificar --batch lote.json --evidence evidencia.json [--leaf-index N]
 *
 * Lee la raíz del lote desde la red (sin emitir transacciones), la compara con la del lote
 * local y verifica contra ella una prueba de inclusión de una hoja; comprueba también que
 * una hoja alterada no verifica. Escribe la evidencia (transacción, bloque, raíz, prueba)
 * para el anexo del documento de grado. Mismos códigos de salida; 1 también si el lote no
 * está en la red.
 */
import { mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorBatch, AnchorMismatchError, type LedgerClient } from './anchoring.js';
import { buildMerkleTree, getInclusionProof, verifyInclusionProof } from './merkle.js';
import { loadBatch, type Batch } from './batch.js';
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

type Command =
  | { name: 'anclar'; batch: string; receipt: string }
  | { name: 'verificar'; batch: string; evidence: string; leafIndex: number | null };

function parseArgs(argv: string[]): Command | null {
  const allowed = {
    anclar: ['--batch', '--receipt'],
    verificar: ['--batch', '--evidence', '--leaf-index'],
  } as const;
  const name = argv[0];
  if (name !== 'anclar' && name !== 'verificar') {
    return null;
  }
  const options: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 2) {
    const option = argv[i];
    const value = argv[i + 1];
    if (!(allowed[name] as readonly string[]).includes(option) || value === undefined) {
      return null;
    }
    options[option] = value;
  }
  if (!options['--batch']) {
    return null;
  }
  if (name === 'anclar') {
    return options['--receipt'] ? { name, batch: options['--batch'], receipt: options['--receipt'] } : null;
  }
  if (!options['--evidence']) {
    return null;
  }
  let leafIndex: number | null = null;
  if (options['--leaf-index'] !== undefined) {
    leafIndex = Number(options['--leaf-index']);
    if (!Number.isSafeInteger(leafIndex) || leafIndex < 0) {
      return null;
    }
  }
  return { name, batch: options['--batch'], evidence: options['--evidence'], leafIndex };
}

function writeAtomically(path: string, content: string): void {
  const directory = mkdtempSync(join(dirname(path), '.recibo-'));
  const temporary = join(directory, 'archivo.json');
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
    deps.err(
      'Uso: anclar --batch lote.json --receipt recibo.json | ' +
        'verificar --batch lote.json --evidence evidencia.json [--leaf-index N]',
    );
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
    if (args.name === 'verificar') {
      return await verify(batch, args.evidence, args.leafIndex, connection.ledger, deps);
    }
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
    deps.err(`La operación sobre ${batch.batchId} falló: ${errorText(error)}`);
    return EXIT_LEDGER_FAILED;
  } finally {
    connection.close();
  }
}

/**
 * Lee la raíz desde el ledger y verifica contra ella una prueba de inclusión. La prueba se
 * genera localmente, sin transacciones nuevas (.claude/rules/trazabilidad.md).
 */
async function verify(
  batch: Batch,
  evidencePath: string,
  requestedLeaf: number | null,
  ledger: LedgerClient,
  deps: CliDependencies,
): Promise<number> {
  const found = await ledger.findRoot(batch.batchId);
  if (found === null) {
    deps.err(`El lote ${batch.batchId} no está registrado en la red.`);
    return EXIT_LEDGER_FAILED;
  }
  const tree = buildMerkleTree(batch.hashes);
  if (found.record.merkleRoot !== tree.root) {
    throw new AnchorMismatchError(
      `La raíz de ${batch.batchId} en el ledger no coincide con la del lote local.`,
    );
  }
  const leafIndex = requestedLeaf ?? Math.floor(batch.hashes.length / 2);
  if (leafIndex >= batch.hashes.length) {
    deps.err(`--leaf-index debe ser menor que ${batch.hashes.length}.`);
    return EXIT_USAGE;
  }
  const leafHash = batch.hashes[leafIndex];
  const proof = getInclusionProof(tree, leafIndex);
  const inclusionValid = verifyInclusionProof(leafHash, proof, found.record.merkleRoot);
  // Una hoja alterada (un evento editado después del anclaje) no debe verificar.
  const tampered = (leafHash[0] === '0' ? '1' : '0') + leafHash.slice(1);
  const tamperedRejected = !verifyInclusionProof(tampered, proof, found.record.merkleRoot);
  const evidence = {
    version: 1,
    batch_id: batch.batchId,
    first_event: found.record.firstEvent,
    last_event: found.record.lastEvent,
    event_count: found.record.eventCount,
    merkle_root_ledger: found.record.merkleRoot,
    merkle_root_local: tree.root,
    transaction_id: found.receipt.transactionId,
    block_number: Number(found.receipt.blockNumber),
    anchored_at: found.receipt.anchoredAt,
    leaf_index: leafIndex,
    event_seq: batch.firstEvent + leafIndex,
    leaf_hash: leafHash,
    proof,
    inclusion_valid: inclusionValid,
    tampered_leaf_rejected: tamperedRejected,
  };
  writeAtomically(evidencePath, JSON.stringify(evidence, null, 2));
  if (!inclusionValid || !tamperedRejected) {
    throw new AnchorMismatchError(`La prueba de inclusión de ${batch.batchId} no verifica.`);
  }
  deps.out(
    `${batch.batchId}: raíz leída de la red (transacción ${evidence.transaction_id}, bloque ` +
      `${evidence.block_number}); prueba de inclusión del evento ${evidence.event_seq} válida`,
  );
  return EXIT_OK;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
