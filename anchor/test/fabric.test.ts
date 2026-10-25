import { describe, expect, it } from 'vitest';
import {
  ALREADY_REGISTERED,
  CommitFailedError,
  FabricLedgerClient,
  fabricConfigFromEnv,
  FABRIC_ENV,
  NOT_FOUND,
  type FabricContract,
} from '../src/fabric.js';
import { anchorBatch, AnchorMismatchError, BatchAlreadyRegisteredError } from '../src/anchoring.js';
import { createHash } from 'node:crypto';

const h = (text: string) => createHash('sha256').update(text).digest('hex');
const record = {
  batchId: 'ccav-test-1:seq-000001-000002',
  merkleRoot: 'a'.repeat(64),
  eventCount: 2,
  firstEvent: 1,
  lastEvent: 2,
};

/** Simula el chaincode de #82 y la Gateway: guarda lotes y responde como la red. */
class FakeChaincode implements FabricContract {
  stored = new Map<string, Record<string, unknown>>();
  submitted: Array<{ name: string; args: string[] }> = [];
  failCommit = false;
  unavailable = false;
  private tx = 0;

  async submitAsync(name: string, options: { arguments: string[] }) {
    if (this.unavailable) {
      throw Object.assign(new Error('14 UNAVAILABLE: No connection established'), { details: [] });
    }
    this.submitted.push({ name, args: options.arguments });
    const [loteId, raiz, cantidad, primerEvento, ultimoEvento] = options.arguments;
    if (this.stored.has(loteId)) {
      // Así llega un error del chaincode a través de la Gateway: en los detalles.
      throw Object.assign(new Error('10 ABORTED: failed to endorse transaction'), {
        details: [{ address: 'peer0:7051', mspId: 'Org1MSP', message: `chaincode response 500, ${ALREADY_REGISTERED}: ${loteId}` }],
      });
    }
    const txId = `tx-${++this.tx}`;
    if (!this.failCommit) {
      this.stored.set(loteId, {
        loteId, raiz, cantidad: Number(cantidad), primerEvento: Number(primerEvento),
        ultimoEvento: Number(ultimoEvento), txId, fechaAnclaje: 1_800_000_000 + this.tx,
      });
    }
    return {
      getTransactionId: () => txId,
      getStatus: async () => ({ blockNumber: BigInt(100 + this.tx), successful: !this.failCommit, code: this.failCommit ? 11 : 0 }),
    };
  }

  async evaluateTransaction(name: string, ...args: string[]) {
    expect(name).toBe('consultarRaiz');
    const value = this.stored.get(args[0]);
    if (!value) {
      throw Object.assign(new Error('evaluate failed'), { details: [{ message: `${NOT_FOUND}: ${args[0]}` }] });
    }
    return new Uint8Array(Buffer.from(JSON.stringify(value)));
  }
}

const blockLookup = async (txId: string) => BigInt(100 + Number(txId.slice(3)));

describe('FabricLedgerClient', () => {
  it('llama a registrarRaiz con los argumentos del contrato y devuelve transacción y bloque', async () => {
    const chaincode = new FakeChaincode();
    const client = new FabricLedgerClient(chaincode, blockLookup);

    const receipt = await client.publishRoot(record);

    expect(chaincode.submitted).toEqual([
      { name: 'registrarRaiz', args: ['ccav-test-1:seq-000001-000002', 'a'.repeat(64), '2', '1', '2'] },
    ]);
    expect(receipt).toEqual({ transactionId: 'tx-1', blockNumber: 101n, anchoredAt: 1_800_000_001 });
  });

  it('traduce LOTE_YA_REGISTRADO de los detalles a BatchAlreadyRegisteredError', async () => {
    const chaincode = new FakeChaincode();
    const client = new FabricLedgerClient(chaincode, blockLookup);
    await client.publishRoot(record);

    await expect(client.publishRoot(record)).rejects.toThrow(BatchAlreadyRegisteredError);
  });

  it('consulta un lote registrado con su bloque, sin emitir transacciones', async () => {
    const chaincode = new FakeChaincode();
    const client = new FabricLedgerClient(chaincode, blockLookup);
    await client.publishRoot(record);

    const found = await client.findRoot(record.batchId);

    expect(found).toEqual({
      record,
      receipt: { transactionId: 'tx-1', blockNumber: 101n, anchoredAt: 1_800_000_001 },
    });
    expect(chaincode.submitted).toHaveLength(1);
    expect(await client.findRoot('ccav-test-1:seq-000009-000009')).toBeNull();
  });

  it('una transacción que no se confirma no se da por anclada', async () => {
    const chaincode = new FakeChaincode();
    chaincode.failCommit = true;

    await expect(new FabricLedgerClient(chaincode, blockLookup).publishRoot(record)).rejects.toThrow(CommitFailedError);
  });

  it('la red caída se propaga como error, no como lote registrado', async () => {
    const chaincode = new FakeChaincode();
    chaincode.unavailable = true;

    await expect(new FabricLedgerClient(chaincode, blockLookup).publishRoot(record)).rejects.toThrow('UNAVAILABLE');
  });

  it('recibo perdido: la segunda corrida recupera el recibo original desde Fabric', async () => {
    const chaincode = new FakeChaincode();
    const client = new FabricLedgerClient(chaincode, blockLookup);
    const lote = { batchId: 'ccav-test-1:seq-000001-000002', firstEvent: 1, lastEvent: 2, hashes: [h('1'), h('2')] };
    const primero = await anchorBatch(lote, client);

    const segundo = await anchorBatch(lote, client);

    // Idéntico, fecha incluida: evidence-log lo acepta como el mismo recibo.
    expect(segundo).toEqual(primero);
  });

  it('si el lote confirmado no refleja la transacción, no se da por anclado', async () => {
    const chaincode = new FakeChaincode();
    const original = chaincode.submitAsync.bind(chaincode);
    chaincode.submitAsync = async (name, options) => {
      const submitted = await original(name, options);
      chaincode.stored.delete(options.arguments[0]);
      return submitted;
    };

    await expect(new FabricLedgerClient(chaincode, blockLookup).publishRoot(record)).rejects.toThrow(CommitFailedError);
  });

  it('rechaza una respuesta de consultarRaiz sin fechaAnclaje', async () => {
    const chaincode = new FakeChaincode();
    chaincode.stored.set(record.batchId, { ...record, loteId: record.batchId, raiz: record.merkleRoot, cantidad: 2, primerEvento: 1, ultimoEvento: 2, txId: 'tx-9' });

    await expect(new FabricLedgerClient(chaincode, blockLookup).findRoot(record.batchId)).rejects.toThrow(/formato inesperado/);
  });

  it('si Fabric guarda otra raíz para el lote, alerta', async () => {
    const chaincode = new FakeChaincode();
    const client = new FabricLedgerClient(chaincode, blockLookup);
    await anchorBatch({ batchId: 'ccav-test-1:seq-000001-000002', firstEvent: 1, lastEvent: 2, hashes: [h('1'), h('2')] }, client);

    await expect(
      anchorBatch({ batchId: 'ccav-test-1:seq-000001-000002', firstEvent: 1, lastEvent: 2, hashes: [h('1'), h('X')] }, client),
    ).rejects.toThrow(AnchorMismatchError);
  });
});

describe('configuración', () => {
  it('exige todas las variables, sin valores por defecto', () => {
    expect(() => fabricConfigFromEnv({})).toThrow(/SQRID_FABRIC_PEER_ENDPOINT/);
    const env = Object.fromEntries(Object.values(FABRIC_ENV).map((name) => [name, `v-${name}`]));
    expect(fabricConfigFromEnv(env).channel).toBe('v-SQRID_FABRIC_CHANNEL');
  });
});
