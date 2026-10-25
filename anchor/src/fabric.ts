/**
 * Cliente de Hyperledger Fabric con la Gateway API (issue #91, ADR-0017).
 *
 * Contrato con el chaincode en Go de `anchor/chaincode/` (issue #82):
 *
 * - `registrarRaiz(loteId, raiz, cantidad, primerEvento, ultimoEvento)` guarda el lote
 *   junto con el id de la transacción (`GetTxID`) y su fecha (`GetTxTimestamp`, en
 *   segundos Unix). Si el `loteId` ya existe, falla con un mensaje que contiene
 *   `LOTE_YA_REGISTRADO`.
 * - `consultarRaiz(loteId)` devuelve JSON
 *   `{loteId, raiz, cantidad, primerEvento, ultimoEvento, txId, fechaAnclaje}`; si el
 *   lote no existe, falla con un mensaje que contiene `LOTE_NO_ENCONTRADO`.
 *
 * El número de bloque de un lote ya registrado se obtiene del contrato de sistema
 * `qscc` (`GetBlockByTxID`), sin emitir transacciones nuevas. La fecha del recibo es
 * siempre `fechaAnclaje` (la del ledger), para que reintentar dé el mismo recibo.
 */
import { readFile } from 'node:fs/promises';
import { createPrivateKey } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import { connect, hash, signers, type Gateway } from '@hyperledger/fabric-gateway';
import { common } from '@hyperledger/fabric-protos';
import {
  BatchAlreadyRegisteredError,
  type LedgerClient,
  type LedgerReceipt,
  type RootRecord,
} from './anchoring.js';

export const ALREADY_REGISTERED = 'LOTE_YA_REGISTRADO';
export const NOT_FOUND = 'LOTE_NO_ENCONTRADO';

/** Lo mínimo de `Contract` de la Gateway API que usa este cliente (permite dobles). */
export interface FabricContract {
  submitAsync(
    name: string,
    options: { arguments: string[] },
  ): Promise<{
    getTransactionId(): string;
    getStatus(): Promise<{ blockNumber: bigint; successful: boolean; code: number }>;
  }>;
  evaluateTransaction(name: string, ...args: string[]): Promise<Uint8Array>;
}

export type BlockLookup = (transactionId: string) => Promise<bigint>;

export class CommitFailedError extends Error {}

/** Texto de un error de la Gateway, incluidos los detalles de cada nodo. */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const details = (error as { details?: Array<{ message?: string }> }).details ?? [];
  return [error.message, ...details.map((detail) => detail.message ?? '')].join(' | ');
}

interface StoredRoot {
  loteId: string;
  raiz: string;
  cantidad: number;
  primerEvento: number;
  ultimoEvento: number;
  txId: string;
  fechaAnclaje: number;
}

function parseStoredRoot(bytes: Uint8Array): StoredRoot {
  const value = JSON.parse(Buffer.from(bytes).toString('utf-8')) as Partial<StoredRoot>;
  const numbers = [value.cantidad, value.primerEvento, value.ultimoEvento, value.fechaAnclaje];
  if (
    typeof value.loteId !== 'string' ||
    typeof value.raiz !== 'string' ||
    typeof value.txId !== 'string' ||
    !numbers.every((n) => typeof n === 'number' && Number.isSafeInteger(n))
  ) {
    throw new Error('consultarRaiz devolvió un lote con formato inesperado.');
  }
  return value as StoredRoot;
}

export class FabricLedgerClient implements LedgerClient {
  constructor(
    private readonly contract: FabricContract,
    private readonly blockLookup: BlockLookup,
  ) {}

  async publishRoot(record: RootRecord): Promise<LedgerReceipt> {
    let submitted;
    try {
      submitted = await this.contract.submitAsync('registrarRaiz', {
        arguments: [
          record.batchId,
          record.merkleRoot,
          String(record.eventCount),
          String(record.firstEvent),
          String(record.lastEvent),
        ],
      });
    } catch (error) {
      if (errorText(error).includes(ALREADY_REGISTERED)) {
        throw new BatchAlreadyRegisteredError(`El lote ${record.batchId} ya está registrado.`);
      }
      throw error;
    }
    const status = await submitted.getStatus();
    if (!status.successful) {
      // Una transacción inválida (por ejemplo, conflicto de versiones) no ancla nada.
      throw new CommitFailedError(
        `La transacción ${submitted.getTransactionId()} no se confirmó (código ${status.code}).`,
      );
    }
    const transactionId = submitted.getTransactionId();
    // La fecha la pone el ledger; se lee del lote recién confirmado.
    const stored = await this.readStored(record.batchId);
    if (stored === null || stored.txId !== transactionId) {
      throw new CommitFailedError(
        `La transacción ${transactionId} se confirmó, pero el lote ${record.batchId} no la refleja.`,
      );
    }
    return { transactionId, blockNumber: status.blockNumber, anchoredAt: stored.fechaAnclaje };
  }

  private async readStored(batchId: string): Promise<StoredRoot | null> {
    let bytes: Uint8Array;
    try {
      bytes = await this.contract.evaluateTransaction('consultarRaiz', batchId);
    } catch (error) {
      if (errorText(error).includes(NOT_FOUND)) {
        return null;
      }
      throw error;
    }
    return parseStoredRoot(bytes);
  }

  async findRoot(batchId: string) {
    const stored = await this.readStored(batchId);
    if (stored === null) {
      return null;
    }
    return {
      record: {
        batchId: stored.loteId,
        merkleRoot: stored.raiz,
        eventCount: stored.cantidad,
        firstEvent: stored.primerEvento,
        lastEvent: stored.ultimoEvento,
      },
      receipt: {
        transactionId: stored.txId,
        blockNumber: await this.blockLookup(stored.txId),
        anchoredAt: stored.fechaAnclaje,
      },
    };
  }
}

/** Configuración de la conexión; todo viene del entorno, sin valores por defecto. */
export interface FabricConfig {
  peerEndpoint: string;
  peerHostAlias: string;
  tlsCertPath: string;
  mspId: string;
  certPath: string;
  keyPath: string;
  channel: string;
  chaincode: string;
}

export const FABRIC_ENV = {
  peerEndpoint: 'SQRID_FABRIC_PEER_ENDPOINT',
  peerHostAlias: 'SQRID_FABRIC_PEER_HOST_ALIAS',
  tlsCertPath: 'SQRID_FABRIC_TLS_CERT_PATH',
  mspId: 'SQRID_FABRIC_MSP_ID',
  certPath: 'SQRID_FABRIC_CERT_PATH',
  keyPath: 'SQRID_FABRIC_KEY_PATH',
  channel: 'SQRID_FABRIC_CHANNEL',
  chaincode: 'SQRID_FABRIC_CHAINCODE',
} as const satisfies Record<keyof FabricConfig, string>;

export function fabricConfigFromEnv(env: NodeJS.ProcessEnv): FabricConfig {
  const missing = Object.values(FABRIC_ENV).filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}.`);
  }
  return Object.fromEntries(
    Object.entries(FABRIC_ENV).map(([key, name]) => [key, env[name]!.trim()]),
  ) as unknown as FabricConfig;
}

/** Abre la conexión real con el peer (TLS) y devuelve el cliente y cómo cerrarlo. */
export async function connectFabric(
  config: FabricConfig,
): Promise<{ ledger: FabricLedgerClient; close: () => void }> {
  const [tlsCert, certificate, keyPem] = await Promise.all([
    readFile(config.tlsCertPath),
    readFile(config.certPath),
    readFile(config.keyPath),
  ]);
  const client = new grpc.Client(config.peerEndpoint, grpc.credentials.createSsl(tlsCert), {
    'grpc.ssl_target_name_override': config.peerHostAlias,
  });
  let gateway: Gateway;
  try {
    gateway = connect({
      client,
      identity: { mspId: config.mspId, credentials: certificate },
      signer: signers.newPrivateKeySigner(createPrivateKey(keyPem)),
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30_000 }),
      submitOptions: () => ({ deadline: Date.now() + 10_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 120_000 }),
    });
  } catch (error) {
    client.close();
    throw error;
  }
  const network = gateway.getNetwork(config.channel);
  const qscc = network.getContract('qscc');
  const blockLookup: BlockLookup = async (transactionId) => {
    const bytes = await qscc.evaluateTransaction('GetBlockByTxID', config.channel, transactionId);
    return BigInt(common.Block.deserializeBinary(bytes).getHeader()!.getNumber());
  };
  return {
    ledger: new FabricLedgerClient(network.getContract(config.chaincode), blockLookup),
    close: () => {
      gateway.close();
      client.close();
    },
  };
}
