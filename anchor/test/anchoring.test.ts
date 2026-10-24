import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMerkleTree } from '../src/merkle.js';
import {
  anchorBatch,
  AnchorMismatchError,
  BatchAlreadyRegisteredError,
  InMemoryLedgerClient,
  type LedgerClient,
} from '../src/anchoring.js';
import type { Batch } from '../src/batch.js';

const h = (text: string) => createHash('sha256').update(text).digest('hex');

function batch(first = 1, count = 3): Batch {
  const hashes = Array.from({ length: count }, (_, i) => h(`evento-${first + i}`));
  const last = first + count - 1;
  const pad = (n: number) => String(n).padStart(6, '0');
  return { batchId: `ccav-test-1:seq-${pad(first)}-${pad(last)}`, firstEvent: first, lastEvent: last, hashes };
}

describe('anchorBatch', () => {
  it('publica la raíz y devuelve el recibo que espera evidence-log', async () => {
    const ledger = new InMemoryLedgerClient(() => 1_800_000_000_500);
    const lote = batch();

    const recibo = await anchorBatch(lote, ledger);

    expect(recibo).toEqual({
      version: 1,
      batch_id: 'ccav-test-1:seq-000001-000003',
      merkle_root: buildMerkleTree(lote.hashes).root,
      first_event: 1,
      last_event: 3,
      event_count: 3,
      transaction_id: 'tx-ccav-test-1:seq-000001-000003',
      block_number: 1,
      anchored_at: 1_800_000_000,
    });
    expect(ledger.publishedRoots).toEqual([recibo.merkle_root]);
  });

  it('si el lote ya estaba con la misma raíz, devuelve el recibo original', async () => {
    let reloj = 1_800_000_000_000;
    const ledger = new InMemoryLedgerClient(() => reloj);
    const primero = await anchorBatch(batch(), ledger);
    reloj += 3_600_000;

    const segundo = await anchorBatch(batch(), ledger);

    // Idéntico, fecha incluida: la fecha es la del ledger, no la de la segunda corrida.
    expect(segundo).toEqual(primero);
    expect(ledger.records.size).toBe(1);
  });

  it('si el lote ya estaba con otra raíz, alerta y no publica nada', async () => {
    const ledger = new InMemoryLedgerClient();
    await anchorBatch(batch(), ledger);
    const alterado = { ...batch(), hashes: [h('otro'), ...batch().hashes.slice(1)] };

    await expect(anchorBatch(alterado, ledger)).rejects.toThrow(AnchorMismatchError);
    expect(ledger.records.size).toBe(1);
  });

  it('si el ledger dice "ya registrado" pero no lo encuentra, alerta', async () => {
    const ledger: LedgerClient = {
      publishRoot: async () => {
        throw new BatchAlreadyRegisteredError('ya');
      },
      findRoot: async () => null,
    };

    await expect(anchorBatch(batch(), ledger)).rejects.toThrow(AnchorMismatchError);
  });

  it('otros errores del ledger se propagan sin recibo', async () => {
    const ledger: LedgerClient = {
      publishRoot: async () => {
        throw new Error('UNAVAILABLE');
      },
      findRoot: async () => null,
    };

    await expect(anchorBatch(batch(), ledger)).rejects.toThrow('UNAVAILABLE');
  });

  it('rechaza un lote vacío', async () => {
    await expect(
      anchorBatch({ batchId: 'x', firstEvent: 1, lastEvent: 0, hashes: [] }, new InMemoryLedgerClient()),
    ).rejects.toThrow();
  });
});
