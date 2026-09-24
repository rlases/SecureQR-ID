import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBatch } from '../src/batch.js';

describe('loadBatch', () => {
  it('lee los hashes desde el JSON que exporta evidence-log/', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'anchor-test-'));
    const ruta = join(carpeta, 'lote.json');
    writeFileSync(ruta, JSON.stringify({ hashes: ['abc123', 'def456'] }));

    const lote = loadBatch(ruta);

    expect(lote.hashes).toEqual(['abc123', 'def456']);
  });

  it('falla si el archivo no tiene el campo hashes', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'anchor-test-'));
    const ruta = join(carpeta, 'lote-invalido.json');
    writeFileSync(ruta, JSON.stringify({ algo: 'distinto' }));

    expect(() => loadBatch(ruta)).toThrow();
  });
});