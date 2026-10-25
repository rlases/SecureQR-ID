import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

// Llave del dispositivo y código de recuperación del titular (ADR-0016, puntos 3 y 4).
// Del lado del servidor solo se guardan hashes.

export const DEVICE_COOKIE = 'sqrid_dispositivo';
const DEVICE_KEY_BYTES = 32; // 256 bits
const RECOVERY_BYTES = 10; // 80 bits = 16 caracteres Base32
const BCRYPT_ROUNDS = 12; // la misma función lenta que las contraseñas del personal
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function hashDeviceKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Código de 80 bits en Base32, en grupos de cuatro: «ABCD-EFGH-IJKL-MNOP». */
export function generateRecoveryCode(): string {
  const code = base32(crypto.randomBytes(RECOVERY_BYTES));
  return code.match(/.{4}/g)!.join('-');
}

/** Acepta el código con o sin guiones, espacios o minúsculas. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_ROUNDS);
}

export function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Z2-7]{16}$/.test(normalized)) return Promise.resolve(false);
  return bcrypt.compare(normalized, hash);
}

/**
 * Vincula un dispositivo nuevo y desactiva el anterior (uno activo por titular).
 * Devuelve la llave en claro, que solo viaja en la cookie. Debe ir en una transacción.
 */
export function linkDevice(db: Database.Database, titularId: number, ahora: Date): string {
  const key = crypto.randomBytes(DEVICE_KEY_BYTES).toString('base64url');
  const momento = ahora.toISOString();
  db.prepare(
    `UPDATE dispositivos SET estado = 'reemplazado', desactivado_en = ?
     WHERE titular_id = ? AND estado = 'activo'`
  ).run(momento, titularId);
  db.prepare(
    `INSERT INTO dispositivos (titular_id, llave_hash, estado, vinculado_en)
     VALUES (?, ?, 'activo', ?)`
  ).run(titularId, hashDeviceKey(key), momento);
  return key;
}

export interface DispositivoTitular {
  dispositivoId: number;
  titularId: number;
}

/** El titular dueño de una llave de dispositivo activa, o null. */
export function findDevice(db: Database.Database, key: string | undefined): DispositivoTitular | null {
  if (!key || key.length > 128) return null;
  const row = db
    .prepare(
      `SELECT d.id AS dispositivo_id, d.titular_id FROM dispositivos d
       JOIN titulares t ON t.id = d.titular_id
       WHERE d.llave_hash = ? AND d.estado = 'activo' AND t.estado IN ('activo', 'suspendido')`
    )
    .get(hashDeviceKey(key)) as { dispositivo_id: number; titular_id: number } | undefined;
  return row ? { dispositivoId: row.dispositivo_id, titularId: row.titular_id } : null;
}
