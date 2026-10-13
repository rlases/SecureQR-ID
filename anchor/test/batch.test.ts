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
    batch_id: 'seq-000101-000103',
    first_event: 101,
    last_event: 103,
    hashes: [h('a'), h('b'), h('c')],
    ...overrides,
  };
}

describe('lote exportado por evidence-log/', () => {
  it('genera el mismo loteId que evidence-log', () => {
    expect(batchIdFor(101, 600)).toBe('seq-000101-000600');
    expect(batchIdFor(1, 1_234_567)).toBe('seq-000001-1234567');
  });

  it('lee un lote válido desde disco', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'anchor-test-')), 'lote.json');
    writeFileSync(ruta, JSON.stringify(valid()));

    expect(loadBatch(ruta)).toEqual({
      batchId: 'seq-000101-000103',
      firstEvent: 101,
      lastEvent: 103,
      hashes: [h('a'), h('b'), h('c')],
    });
  });

  it.each([
    ['sin versión', { version: undefined }],
    ['otra versión', { version: 2 }],
    ['loteId que no corresponde', { batch_id: 'seq-000101-000104' }],
    ['rango invertido', { first_event: 103, last_event: 101, batch_id: 'seq-000103-000101' }],
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
