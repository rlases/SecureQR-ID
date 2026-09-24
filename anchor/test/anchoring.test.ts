import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMerkleTree } from '../src/merkle.js';
import { anchorBatch, InMemoryLedgerClient } from '../src/anchoring.js';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('anchorBatch', () => {
  it('construye el arbol, publica la raiz en el ledger, y devuelve el resultado', async () => {
    const hashes = [sha256('evento-1'), sha256('evento-2'), sha256('evento-3')];
    const ledger = new InMemoryLedgerClient();

    const resultado = await anchorBatch(hashes, ledger, () => 5000);

    const arbolEsperado = buildMerkleTree(hashes);
    expect(resultado.merkleRoot).toBe(arbolEsperado.root);
    expect(resultado.anchoredAt).toBe(5000);
    expect(ledger.publishedRoots).toEqual([arbolEsperado.root]);
  });

  it('rechaza un lote vacio: no tiene sentido anclar nada', async () => {
    const ledger = new InMemoryLedgerClient();

    await expect(anchorBatch([], ledger, () => 5000)).rejects.toThrow();
  });
});