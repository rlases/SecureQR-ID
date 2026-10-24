import crypto from 'node:crypto';

// Formato canónico de docs/SQRID-1.md: 16 bytes de CSPRNG en Base64url sin relleno, que
// siempre da 22 caracteres. issuer/ solo acepta esta forma.
const IDENTIFIER_BYTES = 16;
const CANONICAL = /^[A-Za-z0-9_-]{22}$/;

function randomIdentifier(): string {
  return crypto.randomBytes(IDENTIFIER_BYTES).toString('base64url');
}

/**
 * `cid` nuevo para una credencial. Como el generador de issuer/ (issue #80), descarta los
 * que empiezan por «-»: el formato los admite, pero una herramienta de línea de comandos
 * los confunde con una opción. Cuesta unos 0,02 bits de los 128.
 */
export function generateCid(): string {
  for (;;) {
    const cid = randomIdentifier();
    if (!cid.startsWith('-')) return cid;
  }
}

/** Identificador interno opaco del titular: no deriva de sus datos personales. */
export function generateTitularRef(): string {
  return randomIdentifier();
}

/** El `cid` está en la forma canónica (22 caracteres que decodifican a 16 bytes). */
export function isCanonicalCid(value: string): boolean {
  if (!CANONICAL.test(value)) return false;
  const raw = Buffer.from(value, 'base64url');
  return raw.length === IDENTIFIER_BYTES && raw.toString('base64url') === value;
}

/** Predicado SQLite equivalente a isCanonicalCid. Solo admite nombres internos de
 * columna; el último carácter de 16 bytes en Base64url es A, Q, g o w. */
export function canonicalCidSql(column: 'cid' | 'OLD.cid' = 'cid'): string {
  return `(length(${column}) = 22
    AND ${column} NOT GLOB '*[^A-Za-z0-9_-]*'
    AND substr(${column}, 22, 1) IN ('A', 'Q', 'g', 'w'))`;
}
