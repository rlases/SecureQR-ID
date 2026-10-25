import type Database from 'better-sqlite3';
import { DEFAULT_TIME_ZONE, momentoLocal } from '../estamentos/horario.js';
import { crearCredencial } from './repository.js';

// Reseteo trimestral del cid (ADR-0016, punto 8; THREAT-MODEL.md, «Vinculabilidad del
// cid»).
//
// Cada trimestre, cada titular activo con credencial vigente recibe un cid nuevo y el
// anterior pasa a `reemplazada`: no se revoca, sus tokens vencen solos y el emisor deja
// de firmar con él. Así, quien observa los QR desde fuera solo puede vincular las
// apariciones de una persona dentro de un trimestre.
//
// - El vínculo del teléfono no cambia: depende del titular, no del cid, y la emisión
//   siempre pide el token con el cid vigente.
// - Un titular suspendido (credencial revocada) no recibe cid nuevo: si lo recibiera, la
//   rotación le devolvería una credencial válida que no está en la lista de revocados.
// - El historial cid → titular conserva cada cid anterior, encadenado, para auditar
//   eventos viejos de la bitácora.

/** Trimestre local de la sede, «AAAA-T1» a «AAAA-T4». */
export function trimestreDe(ahora: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const [anio, mes] = momentoLocal(ahora, timeZone).fecha.split('-').map(Number);
  return `${anio}-T${Math.floor((mes - 1) / 3) + 1}`;
}

/** Da un cid nuevo a cada titular activo con credencial vigente. Devuelve cuántos. */
export function resetearCids(db: Database.Database, ahora: Date): number {
  const momento = ahora.toISOString();
  return db.transaction(() => {
    const vigentes = db
      .prepare(
        `SELECT c.id AS credencial_id, t.id AS titular_id, t.ref
         FROM credenciales c JOIN titulares t ON t.id = c.titular_id
         WHERE c.estado = 'vigente' AND t.estado = 'activo'
         ORDER BY t.id`
      )
      .all() as { credencial_id: number; titular_id: number; ref: string }[];
    const reemplazar = db.prepare(
      "UPDATE credenciales SET estado = 'reemplazada', vigente_hasta = ? WHERE id = ?"
    );
    for (const v of vigentes) {
      reemplazar.run(momento, v.credencial_id);
      crearCredencial(db, v.titular_id, v.ref, 'reseteo', momento);
    }
    return vigentes.length;
  })();
}

export type ResultadoReseteo =
  | { accion: 'linea_base'; trimestre: string }
  | { accion: 'reseteo'; trimestre: string; cantidad: number }
  | { accion: 'nada'; trimestre: string };

/**
 * Lo que corre la tarea programada. En el primer arranque solo anota el trimestre actual
 * (no tiene sentido reiniciar cid recién creados); después, la primera vez que corre en
 * un trimestre nuevo, reinicia. Correrla de más no reinicia dos veces.
 */
export function aplicarReseteoSiCorresponde(
  db: Database.Database,
  ahora: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): ResultadoReseteo {
  const trimestre = trimestreDe(ahora, timeZone);
  return db.transaction((): ResultadoReseteo => {
    const ya = db.prepare('SELECT 1 FROM reseteos_cid WHERE trimestre = ?').get(trimestre);
    if (ya) return { accion: 'nada', trimestre };
    const hayHistoria = db.prepare('SELECT 1 FROM reseteos_cid LIMIT 1').get();
    const registrar = db.prepare(
      'INSERT INTO reseteos_cid (trimestre, tipo, cantidad, ejecutado_en) VALUES (?, ?, ?, ?)'
    );
    if (!hayHistoria) {
      registrar.run(trimestre, 'linea_base', 0, ahora.toISOString());
      return { accion: 'linea_base', trimestre };
    }
    const cantidad = resetearCids(db, ahora);
    registrar.run(trimestre, 'reseteo', cantidad, ahora.toISOString());
    return { accion: 'reseteo', trimestre, cantidad };
  })();
}
