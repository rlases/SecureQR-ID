import type Database from 'better-sqlite3';
import { registrarCambio } from '../estamentos/config.js';
import { generateRecoveryCode, hashRecoveryCode } from '../portal/credencialesTitular.js';
import { GestionError } from './gestion.js';
import { crearCredencial, credencialVigente } from './repository.js';

// Resolución de las altas en revisión por documento repetido (enmienda de 2026-10-24 a
// ADR-0016, issue #109). Solo un admin resuelve, y cada decisión queda en
// `cambios_configuracion` con un motivo de una lista cerrada.
//
// - Rechazar: el alta pasa a `anonimizado` de inmediato. Nunca tuvo credencial, vínculo
//   ni código, así que no hay nada que revocar.
// - Reemplazar: el registro vigente anterior pasa a `reemplazado`, su credencial a
//   `reemplazada` o `revocada` según el motivo, y su teléfono a `revocado`; el alta
//   nueva queda activa con credencial y un código provisional.
// - Aprobar: si ya no hay registro vigente con ese documento, el alta nueva queda activa
//   igual que al reemplazar.
//
// El código provisional se muestra una sola vez al admin, que lo entrega en persona tras
// verificar la identidad. Vence a las 72 horas; el titular lo canjea en el flujo de
// recuperación, que lo sustituye por un código propio que no vence.

export const VIGENCIA_PROVISIONAL_HORAS = 72;
const ANONIMO = 'Anonimizado';

export type MotivoReemplazo = 'misma_persona' | 'registro_anterior_indebido';

export interface CodigoProvisional {
  codigoProvisional: string;
  venceEn: string;
}

interface TitularRevision {
  id: number;
  ref: string;
  documento: string;
  estado: string;
}

function titularEnRevision(db: Database.Database, titularId: number): TitularRevision {
  const row = db
    .prepare('SELECT id, ref, documento, estado FROM titulares WHERE id = ?')
    .get(titularId) as TitularRevision | undefined;
  if (!row || row.estado === 'anonimizado') throw new GestionError('El titular no existe.', 404);
  // Resolver una sola vez: una decisión repetida falla sin crear nada.
  if (row.estado !== 'en_revision') {
    throw new GestionError('Esta alta ya no está en revisión.');
  }
  return row;
}

function registroVigente(
  db: Database.Database,
  documento: string
): { id: number; estado: string } | undefined {
  return db
    .prepare(
      "SELECT id, estado FROM titulares WHERE documento = ? AND estado IN ('activo', 'suspendido')"
    )
    .get(documento) as { id: number; estado: string } | undefined;
}

function venceEn(ahora: Date): string {
  return new Date(ahora.getTime() + VIGENCIA_PROVISIONAL_HORAS * 3_600_000).toISOString();
}

/** El alta en revisión queda activa, con credencial y código provisional. En transacción. */
function activarConProvisional(
  db: Database.Database,
  titular: TitularRevision,
  codigoHash: string,
  ahora: Date
): string {
  const vence = venceEn(ahora);
  db.prepare(
    `UPDATE titulares SET estado = 'activo', codigo_recuperacion_hash = ?, provisional_vence_en = ?
     WHERE id = ? AND estado = 'en_revision'`
  ).run(codigoHash, vence, titular.id);
  crearCredencial(db, titular.id, titular.ref, 'alta', ahora.toISOString());
  return vence;
}

/** Rechaza un alta en revisión: sus datos no tienen finalidad y se anonimizan ya. */
export function rechazarAlta(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  nota: string | null,
  ahora: Date
): void {
  db.transaction(() => {
    titularEnRevision(db, titularId);
    db.prepare(
      `UPDATE titulares SET nombre = ?, documento = 'anon-' || ref, correo = '',
         estado = 'anonimizado', codigo_recuperacion_hash = NULL, provisional_vence_en = NULL
       WHERE id = ?`
    ).run(ANONIMO, titularId);
    registrarCambio(
      db,
      usuarioId,
      'titular',
      titularId,
      'rechazar_alta',
      { estado: 'en_revision' },
      { estado: 'anonimizado', motivo: 'documento_de_otra_persona', nota },
      ahora
    );
  })();
}

/**
 * Reemplaza el registro vigente con el mismo documento por el alta en revisión. Todo o
 * nada: si algo falla, ni el anterior ni el nuevo cambian.
 */
export async function reemplazarRegistro(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  motivo: MotivoReemplazo,
  nota: string | null,
  ahora: Date
): Promise<CodigoProvisional> {
  const codigo = generateRecoveryCode();
  const codigoHash = await hashRecoveryCode(codigo);
  const vence = db.transaction(() => {
    const nuevo = titularEnRevision(db, titularId);
    const anterior = registroVigente(db, nuevo.documento);
    if (!anterior) {
      throw new GestionError('No hay un registro vigente que reemplazar: aprueba el alta.');
    }
    const momento = ahora.toISOString();
    const credencial = credencialVigente(db, anterior.id);
    const estadoCredencial = motivo === 'misma_persona' ? 'reemplazada' : 'revocada';
    if (credencial) {
      db.prepare('UPDATE credenciales SET estado = ?, vigente_hasta = ? WHERE id = ?').run(
        estadoCredencial,
        momento,
        credencial.id
      );
    }
    db.prepare(
      `UPDATE dispositivos SET estado = 'revocado', desactivado_en = ?
       WHERE titular_id = ? AND estado = 'activo'`
    ).run(momento, anterior.id);
    db.prepare(
      `UPDATE titulares SET estado = 'reemplazado', codigo_recuperacion_hash = NULL,
         provisional_vence_en = NULL
       WHERE id = ?`
    ).run(anterior.id);
    const vence = activarConProvisional(db, nuevo, codigoHash, ahora);
    // Sin cid: el registro de configuración no es una consulta auditada cid → persona.
    registrarCambio(
      db,
      usuarioId,
      'titular',
      anterior.id,
      'reemplazado',
      { estado: anterior.estado, credencial: credencial ? 'vigente' : null },
      {
        estado: 'reemplazado',
        credencial: credencial ? estadoCredencial : null,
        reemplazadoPor: nuevo.id,
        motivo,
      },
      ahora
    );
    registrarCambio(
      db,
      usuarioId,
      'titular',
      nuevo.id,
      'reemplazar',
      { estado: 'en_revision' },
      { estado: 'activo', reemplazaA: anterior.id, motivo, nota },
      ahora
    );
    return vence;
  })();
  return { codigoProvisional: codigo, venceEn: vence };
}

/** Aprueba un alta en revisión cuyo documento ya no tiene registro vigente. */
export async function aprobarAlta(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  nota: string | null,
  ahora: Date
): Promise<CodigoProvisional> {
  const codigo = generateRecoveryCode();
  const codigoHash = await hashRecoveryCode(codigo);
  const vence = db.transaction(() => {
    const nuevo = titularEnRevision(db, titularId);
    if (registroVigente(db, nuevo.documento)) {
      throw new GestionError('Ese documento tiene un registro vigente: rechaza o reemplaza.');
    }
    const vence = activarConProvisional(db, nuevo, codigoHash, ahora);
    registrarCambio(
      db,
      usuarioId,
      'titular',
      nuevo.id,
      'aprobar_alta',
      { estado: 'en_revision' },
      { estado: 'activo', motivo: 'sin_registro_anterior', nota },
      ahora
    );
    return vence;
  })();
  return { codigoProvisional: codigo, venceEn: vence };
}

/**
 * Genera otro código provisional para un titular que todavía no canjeó el suyo (por
 * ejemplo, porque venció). El anterior deja de servir en el mismo momento.
 */
export async function regenerarProvisional(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  ahora: Date
): Promise<CodigoProvisional> {
  const codigo = generateRecoveryCode();
  const codigoHash = await hashRecoveryCode(codigo);
  const vence = venceEn(ahora);
  db.transaction(() => {
    const cambio = db
      .prepare(
        `UPDATE titulares SET codigo_recuperacion_hash = ?, provisional_vence_en = ?
         WHERE id = ? AND estado = 'activo' AND provisional_vence_en IS NOT NULL`
      )
      .run(codigoHash, vence, titularId);
    if (cambio.changes !== 1) {
      throw new GestionError('Este titular no tiene un código provisional pendiente.');
    }
    registrarCambio(
      db,
      usuarioId,
      'titular',
      titularId,
      'regenerar_provisional',
      null,
      { venceEn: vence },
      ahora
    );
  })();
  return { codigoProvisional: codigo, venceEn: vence };
}
