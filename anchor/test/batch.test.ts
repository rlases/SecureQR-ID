import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BatchFormatError, batchIdFor, loadBatch, parseBatch } from '../src/batch.js';

const h = (text: string) => createHash('sha256').update(text).digest('hex');

function valid(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    batch_id: 'ccav-test-1:seq-000101-000103',
    first_event: 101,
    last_event: 103,
    hashes: [h('a'), h('b'), h('c')],
    ...overrides,
  };
}

describe('lote exportado por evidence-log/', () => {
  it('genera el mismo loteId que evidence-log, con la instalación', () => {
    expect(batchIdFor('ccav-portal-1', 101, 600)).toBe('ccav-portal-1:seq-000101-000600');
    expect(batchIdFor('ccav-portal-1', 1, 1_234_567)).toBe('ccav-portal-1:seq-000001-1234567');
  });

  it('acepta el formato de ADR-0017 con el verifier_id de la instalación', () => {
    const lote = parseBatch(
      valid({ batch_id: 'ccav-portal-1:seq-000101-000103' }),
    );

    expect(lote.batchId).toBe('ccav-portal-1:seq-000101-000103');
  });

  it('acepta un verifier_id que contiene dos puntos', () => {
    const id = 'ccav:pitalito:porteria-1';

    expect(parseBatch(valid({ batch_id: batchIdFor(id, 101, 103) })).batchId).toBe(
      'ccav:pitalito:porteria-1:seq-000101-000103',
    );
  });

  it.each(['', ' ccav', 'ccav ', 'ccav\nuno', 'x'.repeat(129)])(
    'rechaza un verifier_id inválido: %j',
    (id) => {
      expect(() => batchIdFor(id, 1, 2)).toThrow(BatchFormatError);
      expect(() => parseBatch(valid({ batch_id: `${id}:seq-000101-000103` }))).toThrow(
        BatchFormatError,
      );
    },
  );

  it('rechaza el loteId anterior, sin instalación', () => {
    expect(() => parseBatch(valid({ batch_id: 'seq-000101-000103' }))).toThrow(BatchFormatError);
  });

  it('lee un lote válido desde disco', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'anchor-test-')), 'lote.json');
    writeFileSync(ruta, JSON.stringify(valid()));

    expect(loadBatch(ruta)).toEqual({
      batchId: 'ccav-test-1:seq-000101-000103',
      firstEvent: 101,
      lastEvent: 103,
      hashes: [h('a'), h('b'), h('c')],
    });
  });

  it.each([
    ['sin versión', { version: undefined }],
    ['otra versión', { version: 2 }],
    ['loteId que no corresponde', { batch_id: 'ccav-test-1:seq-000101-000104' }],
    ['rango invertido', { first_event: 103, last_event: 101, batch_id: 'ccav-test-1:seq-000103-000101' }],
    ['cantidad distinta al rango', { hashes: [h('a'), h('b')] }],
    ['hash que no es hex', { hashes: [h('a'), h('b'), 'no-hex'] }],
    ['hash en mayúsculas', { hashes: [h('a'), h('b'), h('c').toUpperCase()] }],
    ['sin hashes', { hashes: [] }],
    ['formato anterior', { version: undefined, batch_id: undefined }],
  ])('rechaza %s', (_nombre, overrides) => {
    expect(() => parseBatch(valid(overrides))).toThrow(BatchFormatError);
  });

  it('falla si el archivo no es JSON', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'anchor-test-')), 'lote.json');
    writeFileSync(ruta, '{no es json');

    expect(() => loadBatch(ruta)).toThrow(BatchFormatError);
  });
});
