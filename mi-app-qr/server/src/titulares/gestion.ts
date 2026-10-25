import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { EstadoTitular, TitularAdmin } from '@mi-app-qr/shared';
import { registrarCambio } from '../estamentos/config.js';
import { dentroDeHorario, DEFAULT_TIME_ZONE, type MotivoHorario } from '../estamentos/horario.js';
import { credencialVigente, crearCredencial } from './repository.js';

// Revocación inmediata y exportación de revocados (ADR-0016, punto 9; issue #87).
//
// Dos niveles:
// - Inmediato, aquí: desde que un admin revoca una credencial o corta el vínculo de un
//   teléfono, `puedeEmitir` deja de autorizar tokens para ella.
// - Lista firmada, para el verificador: este módulo exporta, sin firmar, los cid
//   revocados, uno por línea; el custodio los firma con `secureqr-revocation sign` (#81).

export class GestionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409
  ) {
    super(message);
  }
}

export type MotivoEmision = MotivoHorario | 'sin_credencial_vigente';

export interface DecisionEmision {
  permitido: boolean;
  motivo: MotivoEmision;
  // El cid vigente con el que se pide el token, solo si está permitido.
  cid: string | null;
}

/**
 * ¿Se puede pedir un token para este titular ahora? Es la puerta que usa la emisión (#85):
 * titular activo, credencial vigente y dentro de su horario. Falla cerrado.
 */
export function puedeEmitir(
  db: Database.Database,
  titularId: number,
  ahora: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): DecisionEmision {
  const horario = dentroDeHorario(db, titularId, ahora, timeZone);
  if (!horario.permitido) return { permitido: false, motivo: horario.motivo, cid: null };
  const credencial = credencialVigente(db, titularId);
  if (!credencial) return { permitido: false, motivo: 'sin_credencial_vigente', cid: null };
  return { permitido: true, motivo: horario.motivo, cid: credencial.cid };
}

interface TitularRow {
  id: number;
  nombre: string;
  documento: string;
  correo: string;
  estado: EstadoTitular;
  estamento_id: number;
  estamento: string;
  estamento_confirmado: number;
  dispositivo_activo: number;
  creado_en: string;
}

export function listTitulares(db: Database.Database, estado?: EstadoTitular): TitularAdmin[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.nombre, t.documento, t.correo, t.estado, t.estamento_id,
              e.nombre AS estamento, t.estamento_confirmado, t.creado_en,
              EXISTS (SELECT 1 FROM dispositivos d
                      WHERE d.titular_id = t.id AND d.estado = 'activo') AS dispositivo_activo
       FROM titulares t JOIN estamentos e ON e.id = t.estamento_id
       WHERE t.estado <> 'anonimizado' AND (? IS NULL OR t.estado = ?)
       ORDER BY t.nombre, t.id`
    )
    .all(estado ?? null, estado ?? null) as TitularRow[];
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    documento: r.documento,
    correo: r.correo,
    estado: r.estado,
    estamentoId: r.estamento_id,
    estamento: r.estamento,
    estamentoConfirmado: r.estamento_confirmado === 1,
    dispositivoActivo: r.dispositivo_activo === 1,
    creadoEn: r.creado_en,
  }));
}

function getTitularEstado(db: Database.Database, titularId: number): { ref: string; estado: EstadoTitular } {
  const row = db.prepare('SELECT ref, estado FROM titulares WHERE id = ?').get(titularId) as
    | { ref: string; estado: EstadoTitular }
    | undefined;
  if (!row || row.estado === 'anonimizado') throw new GestionError('El titular no existe.', 404);
  return row;
}

/**
 * Revoca la credencial vigente y suspende al titular: desde ahora no recibe tokens, el
 * reseteo trimestral no le da un cid nuevo (#88) y su cid entra en la próxima
 * exportación de revocados. Solo un admin lo reactiva.
 */
export function revocarCredencial(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  motivo: string,
  ahora: Date
): void {
  db.transaction(() => {
    const titular = getTitularEstado(db, titularId);
    const credencial = credencialVigente(db, titularId);
    if (titular.estado !== 'activo' || !credencial) {
      throw new GestionError('El titular no tiene una credencial vigente que revocar.');
    }
    const momento = ahora.toISOString();
    db.prepare(
      "UPDATE credenciales SET estado = 'revocada', vigente_hasta = ? WHERE id = ?"
    ).run(momento, credencial.id);
    db.prepare("UPDATE titulares SET estado = 'suspendido' WHERE id = ?").run(titularId);
    registrarCambio(
      db,
      usuarioId,
      'credencial',
      titularId,
      'revocar',
      { cid: credencial.cid, estado: 'vigente', titular: 'activo' },
      { cid: credencial.cid, estado: 'revocada', titular: 'suspendido', motivo },
      ahora
    );
  })();
}

/** Corta el vínculo del teléfono (perdido o robado). El titular puede vincular otro. */
export function desvincularDispositivo(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  motivo: string,
  ahora: Date
): void {
  db.transaction(() => {
    getTitularEstado(db, titularId);
    const dispositivo = db
      .prepare("SELECT id FROM dispositivos WHERE titular_id = ? AND estado = 'activo'")
      .get(titularId) as { id: number } | undefined;
    if (!dispositivo) throw new GestionError('El titular no tiene un teléfono vinculado.');
    db.prepare(
      "UPDATE dispositivos SET estado = 'revocado', desactivado_en = ? WHERE id = ?"
    ).run(ahora.toISOString(), dispositivo.id);
    registrarCambio(
      db,
      usuarioId,
      'dispositivo',
      titularId,
      'revocar',
      { dispositivoId: dispositivo.id, estado: 'activo' },
      { dispositivoId: dispositivo.id, estado: 'revocado', motivo },
      ahora
    );
  })();
}

/** Reactiva a un titular suspendido con una credencial nueva; la revocada sigue revocada. */
export function reactivarTitular(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  motivo: string,
  ahora: Date
): string {
  return db.transaction(() => {
    const titular = getTitularEstado(db, titularId);
    if (titular.estado !== 'suspendido') {
      throw new GestionError('Solo se reactiva un titular suspendido.');
    }
    const momento = ahora.toISOString();
    db.prepare("UPDATE titulares SET estado = 'activo' WHERE id = ?").run(titularId);
    const cid = crearCredencial(db, titularId, titular.ref, 'reactivacion', momento);
    registrarCambio(
      db,
      usuarioId,
      'titular',
      titularId,
      'reactivar',
      { estado: 'suspendido' },
      { estado: 'activo', cid, motivo },
      ahora
    );
    return cid;
  })();
}

/** cid revocados, en el orden en que se revocaron. */
export function cidsRevocados(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT cid FROM credenciales WHERE estado = 'revocada' ORDER BY vigente_hasta, id")
      .all() as { cid: string }[]
  ).map((r) => r.cid);
}

/** Archivo de revocados en el formato de `secureqr-revocation sign`: un cid por línea. */
export function archivoRevocados(db: Database.Database, ahora: Date): string {
  const cids = cidsRevocados(db);
  return [
    '# cid revocados de mi-app-qr, sin firmar (ADR-0016, punto 9).',
    `# Exportado: ${ahora.toISOString()} · ${cids.length} cid.`,
    '# Fírmalo con: secureqr-revocation sign --key <clave> --input <este archivo> --output <lista>',
    ...cids,
    '',
  ].join('\n');
}

/** Escribe el archivo con reemplazo atómico, para que el custodio nunca lea uno a medias. */
export function exportarRevocados(db: Database.Database, destino: string, ahora: Date): number {
  const contenido = archivoRevocados(db, ahora);
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
  return cidsRevocados(db).length;
}
