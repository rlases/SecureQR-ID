import { readFileSync } from 'node:fs';

/**
 * Lote que exporta `evidence-log/` (issue #92, ADR-0017): solo hashes y números de
 * evento, nunca datos personales. Formato documentado en `evidence-log/README.md`.
 */
export interface Batch {
  batchId: string;
  firstEvent: number;
  lastEvent: number;
  hashes: string[];
}

export const BATCH_FORMAT_VERSION = 1;
const HEX64 = /^[0-9a-f]{64}$/;

export class BatchFormatError extends Error {}

/** `loteId` determinista: el mismo rango siempre da el mismo id (ADR-0017). */
export function batchIdFor(firstEvent: number, lastEvent: number): string {
  const pad = (value: number) => String(value).padStart(6, '0');
  return `seq-${pad(firstEvent)}-${pad(lastEvent)}`;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function parseBatch(data: unknown): Batch {
  if (typeof data !== 'object' || data === null) {
    throw new BatchFormatError('El lote no es un objeto JSON.');
  }
  const value = data as Record<string, unknown>;
  if (value.version !== BATCH_FORMAT_VERSION) {
    throw new BatchFormatError('El lote no tiene la versión de formato esperada.');
  }
  const { batch_id: batchId, first_event: firstEvent, last_event: lastEvent, hashes } = value;
  if (!isPositiveInteger(firstEvent) || !isPositiveInteger(lastEvent) || lastEvent < firstEvent) {
    throw new BatchFormatError('El rango de eventos del lote no es válido.');
  }
  if (batchId !== batchIdFor(firstEvent, lastEvent)) {
    throw new BatchFormatError('El loteId no corresponde al rango de eventos.');
  }
  if (!Array.isArray(hashes) || hashes.length === 0) {
    throw new BatchFormatError('El lote no tiene hashes.');
  }
  if (hashes.length !== lastEvent - firstEvent + 1) {
    throw new BatchFormatError('La cantidad de hashes no coincide con el rango de eventos.');
  }
  if (!hashes.every((hash) => typeof hash === 'string' && HEX64.test(hash))) {
    throw new BatchFormatError('El lote contiene un hash que no es SHA-256 en hexadecimal.');
  }
  return { batchId, firstEvent, lastEvent, hashes: [...hashes] as string[] };
}

export function loadBatch(path: string): Batch {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new BatchFormatError(`No se pudo leer el lote ${path} como JSON.`);
  }
  return parseBatch(data);
}
