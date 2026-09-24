import { readFileSync } from 'node:fs';

export interface Batch {
  hashes: string[];
}

export function loadBatch(path: string): Batch {
  const contenido = JSON.parse(readFileSync(path, 'utf-8'));

  if (!Array.isArray(contenido?.hashes)) {
    throw new Error(`El archivo ${path} no tiene un campo "hashes" valido.`);
  }

  return { hashes: contenido.hashes };
}