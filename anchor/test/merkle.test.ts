import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMerkleTree } from '../src/merkle.js';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('buildMerkleTree', () => {
  it('la raiz es determinista: los mismos hashes de hoja producen siempre la misma raiz', () => {
    const hojas = [sha256('evento-1'), sha256('evento-2'), sha256('evento-3'), sha256('evento-4')];

    const arbol1 = buildMerkleTree(hojas);
    const arbol2 = buildMerkleTree(hojas);

    expect(arbol1.root).toBe(arbol2.root);
    expect(arbol1.root).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambiar una sola hoja cambia la raiz', () => {
    const hojasOriginales = [sha256('evento-1'), sha256('evento-2'), sha256('evento-3'), sha256('evento-4')];
    const hojasAlteradas = [sha256('evento-1'), sha256('evento-2-ALTERADO'), sha256('evento-3'), sha256('evento-4')];

    const arbolOriginal = buildMerkleTree(hojasOriginales);
    const arbolAlterado = buildMerkleTree(hojasAlteradas);

    expect(arbolOriginal.root).not.toBe(arbolAlterado.root);
  });
});