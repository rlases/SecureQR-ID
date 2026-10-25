import type Database from 'better-sqlite3';
import type { EstadoCredencial, EstadoTitular, Titular } from '@mi-app-qr/shared';
import { appendAsignacion } from './asignaciones.js';
import { generateCid, generateTitularRef } from './identificadores.js';

export class EstamentoInexistenteError extends Error {}

export interface DatosAlta {
  nombre: string;
  documento: string;
  correo: string;
  estamentoId: number;
}

interface TitularRow {
  id: number;
  ref: string;
  nombre: string;
  documento: string;
  correo: string;
  estamento_id: number;
  estamento_confirmado: number;
  estado: EstadoTitular;
  creado_en: string;
}

export function toTitular(row: TitularRow): Titular {
  return {
    id: row.id,
    ref: row.ref,
    nombre: row.nombre,
    documento: row.documento,
    correo: row.correo,
    estamentoId: row.estamento_id,
    estamentoConfirmado: row.estamento_confirmado === 1,
    estado: row.estado,
    creadoEn: row.creado_en,
  };
}

export function getTitular(db: Database.Database, id: number): Titular | null {
  const row = db.prepare('SELECT * FROM titulares WHERE id = ?').get(id) as
    | TitularRow
    | undefined;
  return row ? toTitular(row) : null;
}

/** Hay un registro vigente (activo o suspendido) con ese documento. */
export function documentoRegistrado(db: Database.Database, documento: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM titulares WHERE documento = ? AND estado IN ('activo', 'suspendido')"
      )
      .get(documento) !== undefined
  );
}

export interface ResultadoAlta {
  titular: Titular;
  // null cuando el alta quedó en revisión por documento repetido: no hay credencial
  // hasta que un admin la resuelva.
  cid: string | null;
}

/**
 * Alta de un titular con sus datos declarados (ADR-0016, punto 2).
 *
 * Si ya hay un registro vigente con el mismo documento, el alta se guarda como
 * `en_revision`, sin credencial, para que la resuelva un admin. Si no, el titular queda
 * activo con una credencial vigente y su asignación entra al historial encadenado, todo
 * en una sola transacción.
 */
export function registrarTitular(
  db: Database.Database,
  datos: DatosAlta,
  ahora: Date
): ResultadoAlta {
  const momento = ahora.toISOString();
  const registrar = db.transaction((): ResultadoAlta => {
    const estamento = db
      .prepare('SELECT requiere_confirmacion FROM estamentos WHERE id = ?')
      .get(datos.estamentoId) as { requiere_confirmacion: number } | undefined;
    if (!estamento) {
      throw new EstamentoInexistenteError('El estamento elegido no existe.');
    }
    const enRevision = documentoRegistrado(db, datos.documento);
    const ref = generateTitularRef();
    const result = db
      .prepare(
        `INSERT INTO titulares (ref, nombre, documento, correo, estamento_id,
           estamento_confirmado, estado, autorizacion_datos_en, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ref,
        datos.nombre,
        datos.documento,
        datos.correo,
        datos.estamentoId,
        estamento.requiere_confirmacion === 1 ? 0 : 1,
        enRevision ? 'en_revision' : 'activo',
        momento,
        momento
      );
    const titularId = Number(result.lastInsertRowid);
    let cid: string | null = null;
    if (!enRevision) {
      cid = crearCredencial(db, titularId, ref, 'alta', momento);
    }
    return { titular: getTitular(db, titularId)!, cid };
  });
  return registrar();
}

/** Crea una credencial vigente y registra la asignación. Debe ir dentro de una transacción. */
export function crearCredencial(
  db: Database.Database,
  titularId: number,
  titularRef: string,
  motivo: 'alta' | 'reseteo' | 'reactivacion',
  momento: string
): string {
  const cid = generateCid();
  db.prepare(
    `INSERT INTO credenciales (cid, titular_id, estado, vigente_desde) VALUES (?, ?, 'vigente', ?)`
  ).run(cid, titularId, momento);
  appendAsignacion(db, titularRef, cid, motivo, momento);
  return cid;
}

export interface CredencialRow {
  id: number;
  cid: string;
  titular_id: number;
  estado: EstadoCredencial;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export function credencialVigente(
  db: Database.Database,
  titularId: number
): CredencialRow | null {
  const row = db
    .prepare("SELECT * FROM credenciales WHERE titular_id = ? AND estado = 'vigente'")
    .get(titularId) as CredencialRow | undefined;
  return row ?? null;
}

export function historialCredenciales(
  db: Database.Database,
  titularId: number
): CredencialRow[] {
  return db
    .prepare('SELECT * FROM credenciales WHERE titular_id = ? ORDER BY id')
    .all(titularId) as CredencialRow[];
}
