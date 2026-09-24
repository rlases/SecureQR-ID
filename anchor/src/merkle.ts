import { createHash } from 'node:crypto';

export interface MerkleTree {
  root: string;
  layers: string[][];
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Prefijos de dominio (RFC 6962 / Certificate Transparency) para que el hash de
// una hoja nunca pueda coincidir con el de un nodo interno. Sin esto, cualquiera
// puede tomar un nodo interno ya calculado (p. ej. H(hoja0, hoja1)) y presentarlo
// como si fuera el hash de un evento real que nunca existio, con una prueba de
// inclusion mas corta que igual verifica contra la raiz — el defecto clasico de
// arboles de Merkle sin separacion de dominio (CVE-2012-2459 en Bitcoin).
const LEAF_PREFIX = '\x00';
const NODE_PREFIX = '\x01';

function hashLeaf(leafHash: string): string {
  return sha256Hex(LEAF_PREFIX + leafHash);
}

function hashPair(left: string, right: string): string {
  return sha256Hex(NODE_PREFIX + left + right);
}

/**
 * Construye un arbol de Merkle a partir de una lista de hashes de hoja (hex).
 *
 * Si una capa tiene un numero impar de nodos, el ultimo se promueve tal cual
 * a la capa siguiente en vez de duplicarlo. Duplicar el ultimo nodo (el
 * enfoque clasico de Bitcoin) permite, en ciertas condiciones, que un lote
 * con un numero par de eventos sea indistinguible de otro con uno impar
 * repetido — promover evita esa ambiguedad.
 */
export function buildMerkleTree(leafHashes: string[]): MerkleTree {
  if (leafHashes.length === 0) {
    throw new Error('No se puede construir un arbol de Merkle sin hojas.');
  }

  const hashedLeaves = leafHashes.map(hashLeaf);
  const layers: string[][] = [hashedLeaves];

  let currentLayer = hashedLeaves;
  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = currentLayer[i + 1];
      if (right === undefined) {
        nextLayer.push(left);
      } else {
        nextLayer.push(hashPair(left, right));
      }
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return { root: currentLayer[0], layers };
}

export interface ProofStep {
  hash: string;
  position: 'left' | 'right';
}

export function getInclusionProof(tree: MerkleTree, leafIndex: number): ProofStep[] {
  const proof: ProofStep[] = [];
  let index = leafIndex;

  for (let layerIndex = 0; layerIndex < tree.layers.length - 1; layerIndex++) {
    const layer = tree.layers[layerIndex];
    const isRightNode = index % 2 === 1;

    if (isRightNode) {
      proof.push({ hash: layer[index - 1], position: 'left' });
    } else if (index + 1 < layer.length) {
      proof.push({ hash: layer[index + 1], position: 'right' });
    }
    // Si es el ultimo nodo de una capa impar, se promovio sin pareja:
    // no hay paso de prueba en este nivel.

    index = Math.floor(index / 2);
  }

  return proof;
}

export function verifyInclusionProof(leafHash: string, proof: ProofStep[], root: string): boolean {
  let computed = hashLeaf(leafHash);

  for (const step of proof) {
    computed =
      step.position === 'left' ? hashPair(step.hash, computed) : hashPair(computed, step.hash);
  }

  return computed === root;
}