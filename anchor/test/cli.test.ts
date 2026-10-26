import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_ALERT, EXIT_LEDGER_FAILED, EXIT_OK, EXIT_USAGE, main } from '../src/cli.js';
import { InMemoryLedgerClient, type LedgerClient } from '../src/anchoring.js';

const h = (text: string) => createHash('sha256').update(text).digest('hex');

function setup(hashes = [h('1'), h('2'), h('3')]) {
  const dir = mkdtempSync(join(tmpdir(), 'anclar-'));
  const batch = join(dir, 'lote.json');
  writeFileSync(batch, JSON.stringify({
    version: 1, batch_id: `ccav-test-1:seq-000001-${String(hashes.length).padStart(6, '0')}`,
    first_event: 1, last_event: hashes.length, hashes,
  }));
  return { dir, batch, receipt: join(dir, 'recibo.json') };
}

function run(argv: string[], ledger: LedgerClient | (() => never)) {
  const lines: string[] = [];
  let closed = false;
  const code = main(argv, {
    openLedger: async () => {
      if (typeof ledger === 'function') ledger();
      return { ledger: ledger as LedgerClient, close: () => { closed = true; } };
    },
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
  });
  return code.then((value) => ({ code: value, lines, closed: () => closed }));
}

describe('anclar', () => {
  it('ancla y escribe el recibo', async () => {
    const { batch, receipt } = setup();
    const result = await run(['anclar', '--batch', batch, '--receipt', receipt], new InMemoryLedgerClient(() => 1_800_000_000_000));

    expect(result.code).toBe(EXIT_OK);
    expect(result.closed()).toBe(true);
    const recibo = JSON.parse(readFileSync(receipt, 'utf-8'));
    expect(recibo).toMatchObject({ batch_id: 'ccav-test-1:seq-000001-000003', event_count: 3, block_number: 1, anchored_at: 1_800_000_000 });
  });

  it('dos corridas sobre el mismo ledger dan el mismo recibo', async () => {
    const { batch, receipt } = setup();
    const ledger = new InMemoryLedgerClient();
    await run(['anclar', '--batch', batch, '--receipt', receipt], ledger);
    const primero = readFileSync(receipt, 'utf-8');

    const result = await run(['anclar', '--batch', batch, '--receipt', receipt], ledger);

    expect(result.code).toBe(EXIT_OK);
    expect(readFileSync(receipt, 'utf-8')).toBe(primero);
  });

  it('raíz distinta en el ledger: código 3 y sin recibo', async () => {
    const ledger = new InMemoryLedgerClient();
    const first = setup();
    await run(['anclar', '--batch', first.batch, '--receipt', first.receipt], ledger);
    const other = setup([h('1'), h('X'), h('3')]);

    const result = await run(['anclar', '--batch', other.batch, '--receipt', other.receipt], ledger);

    expect(result.code).toBe(EXIT_ALERT);
    expect(existsSync(other.receipt)).toBe(false);
    expect(result.lines.join(' ')).toContain('ALERTA');
  });

  it('Fabric caído al publicar: código 1 y sin recibo', async () => {
    const { batch, receipt } = setup();
    const ledger: LedgerClient = {
      publishRoot: async () => { throw new Error('14 UNAVAILABLE'); },
      findRoot: async () => null,
    };

    const result = await run(['anclar', '--batch', batch, '--receipt', receipt], ledger);

    expect(result.code).toBe(EXIT_LEDGER_FAILED);
    expect(existsSync(receipt)).toBe(false);
    expect(result.closed()).toBe(true);
  });

  it('sin conexión con Fabric: código 1', async () => {
    const { batch, receipt } = setup();
    const result = await run(['anclar', '--batch', batch, '--receipt', receipt], () => { throw new Error('ECONNREFUSED'); });

    expect(result.code).toBe(EXIT_LEDGER_FAILED);
    expect(existsSync(receipt)).toBe(false);
  });

  it.each([
    [[]],
    [['otra-cosa']],
    [['anclar', '--batch']],
    [['anclar', '--batch', 'x.json']],
    [['anclar', '--batch', 'x.json', '--receipt', 'r.json', '--extra', '1']],
  ])('uso incorrecto %j: código 2', async (argv) => {
    const result = await run(argv as string[], new InMemoryLedgerClient());
    expect(result.code).toBe(EXIT_USAGE);
  });

  it('lote mal formado: código 2 y nunca se conecta', async () => {
    const { dir, receipt } = setup();
    const bad = join(dir, 'malo.json');
    writeFileSync(bad, JSON.stringify({ hashes: ['abc'] }));
    let opened = false;

    const code = await main(['anclar', '--batch', bad, '--receipt', receipt], {
      openLedger: async () => { opened = true; return { ledger: new InMemoryLedgerClient(), close: () => {} }; },
      err: () => {},
    });

    expect(code).toBe(EXIT_USAGE);
    expect(opened).toBe(false);
  });
});

describe('verificar (issue #93)', () => {
  async function anclado(hashes?: string[]) {
    const paths = setup(hashes);
    const ledger = new InMemoryLedgerClient(() => 1_800_000_000_000);
    await run(['anclar', '--batch', paths.batch, '--receipt', paths.receipt], ledger);
    return { ...paths, ledger, evidence: join(paths.dir, 'evidencia.json') };
  }

  it('lee la raíz de la red y verifica una prueba de inclusión contra ella', async () => {
    const { batch, ledger, evidence } = await anclado([h('a'), h('b'), h('c'), h('d'), h('e')]);
    const result = await run(['verificar', '--batch', batch, '--evidence', evidence], ledger);

    expect(result.code).toBe(EXIT_OK);
    expect(result.closed()).toBe(true);
    const datos = JSON.parse(readFileSync(evidence, 'utf-8'));
    expect(datos).toMatchObject({
      version: 1,
      batch_id: 'ccav-test-1:seq-000001-000005',
      transaction_id: 'tx-ccav-test-1:seq-000001-000005',
      block_number: 1,
      anchored_at: 1_800_000_000,
      leaf_index: 2,
      event_seq: 3,
      leaf_hash: h('c'),
      inclusion_valid: true,
      tampered_leaf_rejected: true,
    });
    expect(datos.merkle_root_ledger).toBe(datos.merkle_root_local);
    expect(datos.proof.length).toBeGreaterThan(0);
  });

  it('verifica cualquier hoja pedida, también la que se promovió sin pareja', async () => {
    const { batch, ledger, evidence } = await anclado([h('a'), h('b'), h('c')]);
    for (const indice of ['0', '1', '2']) {
      const result = await run(['verificar', '--batch', batch, '--evidence', evidence, '--leaf-index', indice], ledger);
      expect(result.code).toBe(EXIT_OK);
      expect(JSON.parse(readFileSync(evidence, 'utf-8')).inclusion_valid).toBe(true);
    }
  });

  it('un lote que no está en la red es un fallo de anclaje, sin evidencia', async () => {
    const { batch, dir } = setup();
    const evidence = join(dir, 'evidencia.json');
    const result = await run(['verificar', '--batch', batch, '--evidence', evidence], new InMemoryLedgerClient());
    expect(result.code).toBe(EXIT_LEDGER_FAILED);
    expect(existsSync(evidence)).toBe(false);
  });

  it('si el lote local cambió después de anclarse, es alerta', async () => {
    const { ledger, dir } = await anclado([h('a'), h('b'), h('c')]);
    const alterado = setup([h('a'), h('B'), h('c')]);
    const evidence = join(dir, 'evidencia.json');
    const result = await run(['verificar', '--batch', alterado.batch, '--evidence', evidence], ledger);
    expect(result.code).toBe(EXIT_ALERT);
    expect(existsSync(evidence)).toBe(false);
  });

  it('valida los argumentos', async () => {
    const { batch, ledger, evidence } = await anclado();
    expect((await run(['verificar', '--batch', batch], ledger)).code).toBe(EXIT_USAGE);
    expect((await run(['verificar', '--batch', batch, '--evidence', evidence, '--leaf-index', '-1'], ledger)).code).toBe(EXIT_USAGE);
    expect((await run(['verificar', '--batch', batch, '--evidence', evidence, '--leaf-index', '3'], ledger)).code).toBe(EXIT_USAGE);
    expect((await run(['verificar', '--batch', batch, '--evidence', evidence, '--receipt', 'x'], ledger)).code).toBe(EXIT_USAGE);
  });
});
