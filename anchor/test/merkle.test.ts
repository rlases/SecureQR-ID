import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMerkleTree, getInclusionProof, verifyInclusionProof } from '../src/merkle.js';

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

describe('pruebas de inclusion', () => {
  it('cada hoja tiene una prueba de inclusion valida, con numero par de hojas', () => {
    const hojas = [sha256('a'), sha256('b'), sha256('c'), sha256('d')];
    const arbol = buildMerkleTree(hojas);

    hojas.forEach((hoja, indice) => {
      const prueba = getInclusionProof(arbol, indice);
      expect(verifyInclusionProof(hoja, prueba, arbol.root)).toBe(true);
    });
  });

  it('cada hoja tiene una prueba de inclusion valida, con numero impar de hojas', () => {
    const hojas = [sha256('a'), sha256('b'), sha256('c'), sha256('d'), sha256('e')];
    const arbol = buildMerkleTree(hojas);

    hojas.forEach((hoja, indice) => {
      const prueba = getInclusionProof(arbol, indice);
      expect(verifyInclusionProof(hoja, prueba, arbol.root)).toBe(true);
    });
  });

  it('una prueba no sirve para una hoja que no estaba en el lote', () => {
    const hojas = [sha256('a'), sha256('b'), sha256('c'), sha256('d')];
    const arbol = buildMerkleTree(hojas);

    const prueba = getInclusionProof(arbol, 0);
    const hojaFalsa = sha256('no-estaba-aqui');

    expect(verifyInclusionProof(hojaFalsa, prueba, arbol.root)).toBe(false);
  });
});