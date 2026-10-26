import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { GENESIS_HASH, listAsignaciones, verifyAsignaciones } from './asignaciones.js';

// Compromiso externo de la cabeza de `asignaciones_cid` (enmienda de 2026-10-25 a
// ADR-0016, issue #119).
//
// El HMAC protege el historial cid → titular de quien solo tiene la base, pero no de quien
// controla el servidor completo (base y clave). Por eso mi-app-qr escribe periódicamente la
// cabeza de la cadena (seq y etiqueta HMAC) en un archivo; evidence-log/ la registra como
// evento, la ancla en Fabric con el siguiente lote y devuelve, en otro archivo, cuáles
// compromisos ya están anclados. Desde ese momento, una reescritura del historial anterior
// a un compromiso anclado se detecta aquí: la fila comprometida ya no tiene el mismo hash.
//
// Límite de proceso por archivos (ADR-0005): no se importa código de Python. Solo viajan un
// número y un hash de 256 bits que no se puede invertir; nunca datos personales.

export const FUENTE = 'asignaciones_cid';

export interface Cabeza {
  seq: number;
  hash: string;
}

/** Último eslabón de la cadena; seq 0 y el hash génesis si todavía no hay asignaciones. */
export function cabezaAsignaciones(db: Database.Database): Cabeza {
  const row = db
    .prepare('SELECT seq, hash FROM asignaciones_cid ORDER BY seq DESC LIMIT 1')
    .get() as Cabeza | undefined;
  return row ?? { seq: 0, hash: GENESIS_HASH };
}

/** Escribe la cabeza con reemplazo atómico, para que evidence-log nunca lea uno a medias. */
export function escribirCabeza(db: Database.Database, destino: string, ahora: Date): Cabeza {
  const cabeza = cabezaAsignaciones(db);
  const contenido = JSON.stringify({
    version: 1,
    fuente: FUENTE,
    seq: cabeza.seq,
    hash: cabeza.hash,
    generado_en: ahora.toISOString(),
  });
  const dir = path.dirname(path.resolve(destino));
  fs.mkdirSync(dir, { recursive: true });
  const temporal = path.join(dir, `.${path.basename(destino)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporal, contenido, { encoding: 'utf8', mode: 0o644 });
    fs.renameSync(temporal, destino);
  } catch (error) {
    fs.rmSync(temporal, { force: true });
    throw error;
  }
  return cabeza;
}

interface CompromisoArchivo {
  fuente: string;
  seq: number;
  hash: string;
  anclado: boolean;
  transaction_id: string | null;
  block_number: number | null;
}

export type EstadoIntegridad =
  // La cadena verifica y coincide con todos los compromisos anclados.
  | { estado: 'ok'; ultimoAnclado: { seq: number; transactionId: string; blockNumber: number } | null }
  // No hay archivo de compromisos todavía: solo rige el HMAC.
  | { estado: 'sin_compromisos' }
  // Algo no cuadra: hay que investigar antes de confiar en la atribución.
  | { estado: 'alerta'; detalle: string };

/**
 * Compara el historial con los compromisos anclados que exporta evidence-log/.
 * Detecta una reescritura (la fila comprometida tiene otro hash), un truncamiento (la
 * fila comprometida ya no existe) y una bitácora alterada (evidence-log la marca).
 */
export function verificarContraCompromisos(db: Database.Database, archivo: string): EstadoIntegridad {
  let datos: { version?: unknown; cadena_valida?: unknown; compromisos?: unknown };
  try {
    datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { estado: 'sin_compromisos' };
    return { estado: 'alerta', detalle: 'El archivo de compromisos no es un JSON legible.' };
  }
  if (datos.version !== 1 || !Array.isArray(datos.compromisos)) {
    return { estado: 'alerta', detalle: 'El archivo de compromisos tiene un formato desconocido.' };
  }
  if (datos.cadena_valida !== true) {
    return { estado: 'alerta', detalle: 'La bitácora de evidence-log no verifica.' };
  }
  if (!verifyAsignaciones(db)) {
    return { estado: 'alerta', detalle: 'El historial cid → titular no verifica con su clave.' };
  }
  const porSeq = new Map(listAsignaciones(db).map((a) => [a.seq, a.hash]));
  const anclados = (datos.compromisos as CompromisoArchivo[]).filter(
    (c) => c.fuente === FUENTE && c.anclado
  );
  for (const c of anclados) {
    if (c.seq === 0) continue; // compromiso de una cadena vacía: nada que comparar
    const actual = porSeq.get(c.seq);
    if (actual === undefined) {
      return { estado: 'alerta', detalle: `Falta la asignación ${c.seq}, comprometida y anclada.` };
    }
    if (actual !== c.hash) {
      return { estado: 'alerta', detalle: `La asignación ${c.seq} no coincide con su compromiso anclado.` };
    }
  }
  const ultimo = anclados.at(-1);
  return {
    estado: 'ok',
    ultimoAnclado:
      ultimo && ultimo.transaction_id !== null && ultimo.block_number !== null
        ? { seq: ultimo.seq, transactionId: ultimo.transaction_id, blockNumber: ultimo.block_number }
        : null,
  };
}
