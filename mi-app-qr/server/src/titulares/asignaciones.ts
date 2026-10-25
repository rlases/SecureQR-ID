import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

// Historial cid → titular encadenado por HMAC (THREAT-MODEL.md, «Vinculabilidad del
// cid», y enmienda de 2026-10-25 a ADR-0016). Cada asignación compromete a todas las
// anteriores: reescribir o quitar una rompe la cadena y `verifyAsignaciones` lo detecta,
// aunque alguien quite los disparadores de solo agregar con acceso directo al archivo.
// La clave vive fuera de la base (`ASIGNACIONES_KEY`), así que con solo el archivo no se
// puede recalcular la cadena después de alterarla.
//
// Solo usa el identificador opaco del titular (`titulares.ref`), nunca sus datos
// personales, así que la cadena sobrevive a la anonimización del cierre del piloto.

export const GENESIS_HASH = '0'.repeat(64);

export type MotivoAsignacion = 'alta' | 'reseteo' | 'reactivacion';

export interface Asignacion {
  seq: number;
  titularRef: string;
  cid: string;
  motivo: MotivoAsignacion;
  asignadoEn: string;
  hashAnterior: string;
  hash: string;
}

interface AsignacionRow {
  seq: number;
  titular_ref: string;
  cid: string;
  motivo: MotivoAsignacion;
  asignado_en: string;
  hash_anterior: string;
  hash: string;
}

const LONGITUD_MINIMA_CLAVE = 32;

export class ClaveAsignacionesError extends Error {}

/**
 * Lee la clave HMAC del historial desde `ASIGNACIONES_KEY` (hexadecimal, 32 bytes o más).
 * Falla cerrado: sin clave válida no se agrega ni se verifica ninguna asignación.
 */
export function claveAsignaciones(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.ASIGNACIONES_KEY ?? '';
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex) || hex.length / 2 < LONGITUD_MINIMA_CLAVE) {
    throw new ClaveAsignacionesError(
      'ASIGNACIONES_KEY no está definida o no tiene 32 bytes en hexadecimal.'
    );
  }
  return Buffer.from(hex, 'hex');
}

export function hashAsignacion(
  hashAnterior: string,
  titularRef: string,
  cid: string,
  motivo: MotivoAsignacion,
  asignadoEn: string,
  clave: Buffer = claveAsignaciones()
): string {
  // Arreglo JSON con orden fijo: sin ambigüedad entre campos.
  const contenido = JSON.stringify([hashAnterior, titularRef, cid, motivo, asignadoEn]);
  return crypto.createHmac('sha256', clave).update(contenido, 'utf8').digest('hex');
}

function toAsignacion(row: AsignacionRow): Asignacion {
  return {
    seq: row.seq,
    titularRef: row.titular_ref,
    cid: row.cid,
    motivo: row.motivo,
    asignadoEn: row.asignado_en,
    hashAnterior: row.hash_anterior,
    hash: row.hash,
  };
}

/** Agrega una asignación al final de la cadena. Debe llamarse dentro de una transacción. */
export function appendAsignacion(
  db: Database.Database,
  titularRef: string,
  cid: string,
  motivo: MotivoAsignacion,
  asignadoEn: string
): Asignacion {
  const last = db
    .prepare('SELECT hash FROM asignaciones_cid ORDER BY seq DESC LIMIT 1')
    .get() as { hash: string } | undefined;
  const hashAnterior = last?.hash ?? GENESIS_HASH;
  const hash = hashAsignacion(hashAnterior, titularRef, cid, motivo, asignadoEn);
  const result = db
    .prepare(
      `INSERT INTO asignaciones_cid (titular_ref, cid, motivo, asignado_en, hash_anterior, hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(titularRef, cid, motivo, asignadoEn, hashAnterior, hash);
  return {
    seq: Number(result.lastInsertRowid),
    titularRef,
    cid,
    motivo,
    asignadoEn,
    hashAnterior,
    hash,
  };
}

export function listAsignaciones(db: Database.Database): Asignacion[] {
  const rows = db
    .prepare('SELECT * FROM asignaciones_cid ORDER BY seq')
    .all() as AsignacionRow[];
  return rows.map(toAsignacion);
}

/** Recalcula toda la cadena. Falso si algún eslabón fue alterado, quitado o reordenado. */
export function verifyAsignaciones(
  db: Database.Database,
  clave: Buffer = claveAsignaciones()
): boolean {
  let anterior = GENESIS_HASH;
  for (const a of listAsignaciones(db)) {
    if (a.hashAnterior !== anterior) return false;
    const esperado = Buffer.from(
      hashAsignacion(anterior, a.titularRef, a.cid, a.motivo, a.asignadoEn, clave),
      'hex'
    );
    const guardado = Buffer.from(a.hash, 'hex');
    if (guardado.length !== esperado.length || !crypto.timingSafeEqual(guardado, esperado)) {
      return false;
    }
    anterior = a.hash;
  }
  return true;
}

/** Hash del último eslabón: lo que se compromete hacia afuera para detectar truncamiento. */
export function headAsignaciones(db: Database.Database): string {
  const last = db
    .prepare('SELECT hash FROM asignaciones_cid ORDER BY seq DESC LIMIT 1')
    .get() as { hash: string } | undefined;
  return last?.hash ?? GENESIS_HASH;
}

/** A quién estaba asignado un `cid`, aunque hoy esté reemplazado o revocado. */
export function titularRefForCid(db: Database.Database, cid: string): string | null {
  const row = db
    .prepare('SELECT titular_ref FROM asignaciones_cid WHERE cid = ? ORDER BY seq LIMIT 1')
    .get(cid) as { titular_ref: string } | undefined;
  return row?.titular_ref ?? null;
}
