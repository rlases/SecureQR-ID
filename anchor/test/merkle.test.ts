import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMerkleTree, getInclusionProof, verifyInclusionProof } from '../src/merkle.js';
import type { ProofStep } from '../src/merkle.js';

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

  it('un nodo interno no se puede hacer pasar por una hoja (separacion de dominio, CVE-2012-2459)', () => {
    // Sin prefijos de hoja/nodo, H(hoja0, hoja1) -- un nodo interno real del
    // arbol -- se puede presentar como si fuera el hash de un evento que
    // nunca existio, junto con una prueba mas corta (el otro nodo interno del
    // mismo nivel) que igual reconstruye la raiz real. Reproduce exactamente
    // ese ataque contra la raiz publicada.
    const hojas = [sha256('evento-1'), sha256('evento-2'), sha256('evento-3'), sha256('evento-4')];
    const arbol = buildMerkleTree(hojas);

    const nodoInternoComoHojaFalsa = arbol.layers[1][0]; // H(hoja0, hoja1)
    const pruebaForjada: ProofStep[] = [{ hash: arbol.layers[1][1], position: 'right' }]; // H(hoja2, hoja3)

    expect(verifyInclusionProof(nodoInternoComoHojaFalsa, pruebaForjada, arbol.root)).toBe(false);
  });
});