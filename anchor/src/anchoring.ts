import type { Batch } from './batch.js';
import { buildMerkleTree } from './merkle.js';

/** Lo que se publica en la red por cada lote: solo hashes y números (ADR-0017). */
export interface RootRecord {
  batchId: string;
  merkleRoot: string;
  eventCount: number;
  firstEvent: number;
  lastEvent: number;
}

/**
 * Comprobante de que la raíz quedó en el ledger. `anchoredAt` es la fecha de la
 * transacción según el ledger (segundos Unix), no el reloj local: así el recibo de un
 * lote es idéntico en cada reintento y `evidence-log` no ve un anclaje «distinto».
 */
export interface LedgerReceipt {
  transactionId: string;
  blockNumber: bigint;
  anchoredAt: number;
}

/** El contrato rechazó el lote porque ese `loteId` ya estaba registrado. */
export class BatchAlreadyRegisteredError extends Error {}

/** La raíz registrada en el ledger no coincide con la del lote local: hay que investigar. */
export class AnchorMismatchError extends Error {}

/**
 * Cualquier forma de publicar una raíz de Merkle. `FabricLedgerClient` (fabric.ts) es
 * la real; `InMemoryLedgerClient` es el doble para las pruebas unitarias.
 */
export interface LedgerClient {
  /** Publica la raíz. Lanza `BatchAlreadyRegisteredError` si el lote ya existe. */
  publishRoot(record: RootRecord): Promise<LedgerReceipt>;
  /** Busca un lote ya registrado; `null` si no existe. */
  findRoot(batchId: string): Promise<{ record: RootRecord; receipt: LedgerReceipt } | null>;
}

export class InMemoryLedgerClient implements LedgerClient {
  readonly records = new Map<string, { record: RootRecord; receipt: LedgerReceipt }>();
  private nextBlock = 1n;

  /** `clock` en milisegundos, como `Date.now`, para fijar la fecha en las pruebas. */
  constructor(private readonly clock: () => number = () => Date.now()) {}

  get publishedRoots(): string[] {
    return [...this.records.values()].map(({ record }) => record.merkleRoot);
  }

  async publishRoot(record: RootRecord): Promise<LedgerReceipt> {
    if (this.records.has(record.batchId)) {
      throw new BatchAlreadyRegisteredError(`El lote ${record.batchId} ya está registrado.`);
    }
    const receipt = {
      transactionId: `tx-${record.batchId}`,
      blockNumber: this.nextBlock++,
      anchoredAt: Math.floor(this.clock() / 1000),
    };
    this.records.set(record.batchId, { record: { ...record }, receipt });
    return receipt;
  }

  async findRoot(batchId: string) {
    return this.records.get(batchId) ?? null;
  }
}

/** Recibo que lee `evidence-log record-receipt` (formato en `evidence-log/README.md`). */
export interface AnchorReceiptJson {
  version: 1;
  batch_id: string;
  merkle_root: string;
  first_event: number;
  last_event: number;
  event_count: number;
  transaction_id: string;
  block_number: number;
  anchored_at: number;
}

function sameRecord(left: RootRecord, right: RootRecord): boolean {
  return (
    left.batchId === right.batchId &&
    left.merkleRoot === right.merkleRoot &&
    left.eventCount === right.eventCount &&
    left.firstEvent === right.firstEvent &&
    left.lastEvent === right.lastEvent
  );
}

/**
 * Construye el árbol del lote, publica su raíz y devuelve el recibo.
 *
 * Si la raíz ya había entrado al ledger en una corrida anterior (corte antes de
 * registrar el recibo), el contrato responde «ya registrado»: se consulta el lote y,
 * si coincide, se devuelve el recibo original (operación idempotente). Si no
 * coincide, se lanza `AnchorMismatchError` y no se escribe nada (ADR-0017).
 */
export async function anchorBatch(
  batch: Batch,
  ledger: LedgerClient,
): Promise<AnchorReceiptJson> {
  if (batch.hashes.length === 0) {
    throw new Error('No se puede anclar un lote vacío.');
  }
  const tree = buildMerkleTree(batch.hashes);
  const record: RootRecord = {
    batchId: batch.batchId,
    merkleRoot: tree.root,
    eventCount: batch.hashes.length,
    firstEvent: batch.firstEvent,
    lastEvent: batch.lastEvent,
  };

  let receipt: LedgerReceipt;
  try {
    receipt = await ledger.publishRoot(record);
  } catch (error) {
    if (!(error instanceof BatchAlreadyRegisteredError)) {
      throw error;
    }
    const existing = await ledger.findRoot(record.batchId);
    if (existing === null) {
      throw new AnchorMismatchError(
        `El ledger dice que ${record.batchId} ya existe, pero no lo encuentra.`,
      );
    }
    if (!sameRecord(existing.record, record)) {
      throw new AnchorMismatchError(
        `El lote ${record.batchId} registrado en el ledger no coincide con el lote local.`,
      );
    }
    receipt = existing.receipt;
  }

  const blockNumber = Number(receipt.blockNumber);
  if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
    throw new Error('El número de bloque del ledger está fuera de rango.');
  }
  if (!Number.isSafeInteger(receipt.anchoredAt) || receipt.anchoredAt <= 0) {
    throw new Error('La fecha de anclaje del ledger está fuera de rango.');
  }
  return {
    version: 1,
    batch_id: record.batchId,
    merkle_root: record.merkleRoot,
    first_event: record.firstEvent,
    last_event: record.lastEvent,
    event_count: record.eventCount,
    transaction_id: receipt.transactionId,
    block_number: blockNumber,
    anchored_at: receipt.anchoredAt,
  };
}
