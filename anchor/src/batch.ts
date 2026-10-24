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

const MAX_VERIFIER_ID_LENGTH = 128;
// Texto imprimible sin espacios en los extremos, igual que `verifier-service/` y
// `evidence-log/`. Sin \p{C} (control, formato, sin asignar) ni separadores, salvo el
// espacio entre palabras.
const NON_PRINTABLE = /[\p{C}\p{Zl}\p{Zp}]/u;
const BATCH_ID = /^(.+):seq-\d+-\d+$/su;

export function isValidVerifierId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_VERIFIER_ID_LENGTH &&
    value === value.trim() &&
    !NON_PRINTABLE.test(value)
  );
}

/**
 * `loteId` determinista (ADR-0017): `<verifier_id>:seq-<primero>-<último>`. El mismo
 * rango de la misma instalación siempre da el mismo id; el prefijo evita que dos
 * instalaciones, cuyas bitácoras empiezan en 1, choquen en la misma red.
 */
export function batchIdFor(verifierId: string, firstEvent: number, lastEvent: number): string {
  if (!isValidVerifierId(verifierId)) {
    throw new BatchFormatError('El verifier_id del loteId no es válido.');
  }
  const pad = (value: number) => String(value).padStart(6, '0');
  return `${verifierId}:seq-${pad(firstEvent)}-${pad(lastEvent)}`;
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
  const verifierId = typeof batchId === 'string' ? BATCH_ID.exec(batchId)?.[1] : undefined;
  if (
    verifierId === undefined ||
    !isValidVerifierId(verifierId) ||
    batchId !== batchIdFor(verifierId, firstEvent, lastEvent)
  ) {
    throw new BatchFormatError(
      'El loteId no corresponde al rango de eventos y a la instalación.',
    );
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
