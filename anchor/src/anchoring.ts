import { buildMerkleTree } from './merkle.js';

/**
 * Cualquier forma de "publicar una raiz de Merkle" que anchor/ pueda usar.
 *
 * Hoy solo existe InMemoryLedgerClient (para pruebas). Conectar a una red
 * Hyperledger Fabric real (ADR-0005, ADR-0007) requiere una implementacion
 * nueva de esta misma interfaz usando el SDK fabric-network -- no existe
 * todavia ninguna red Fabric desplegada para este proyecto.
 */
export interface LedgerClient {
  publishRoot(root: string): Promise<void>;
}

export class InMemoryLedgerClient implements LedgerClient {
  publishedRoots: string[] = [];

  async publishRoot(root: string): Promise<void> {
    this.publishedRoots.push(root);
  }
}

export interface AnchorResult {
  merkleRoot: string;
  anchoredAt: number;
}

export async function anchorBatch(
  hashes: string[],
  ledger: LedgerClient,
  now: () => number = () => Date.now(),
): Promise<AnchorResult> {
  if (hashes.length === 0) {
    throw new Error('No se puede anclar un lote vacio.');
  }

  const tree = buildMerkleTree(hashes);
  await ledger.publishRoot(tree.root);

  return { merkleRoot: tree.root, anchoredAt: now() };
}