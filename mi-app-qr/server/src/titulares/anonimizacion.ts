import type Database from 'better-sqlite3';
import { canonicalCidSql } from './identificadores.js';

// Eliminación o anonimización de datos personales (ADR-0016, punto 10; issue #90).
//
// - Al cierre del piloto (`anonimizarCierre`): se anonimizan los datos personales de todos
//   los titulares, de los registros de asistencia y de las consultas, se quita el texto
//   libre del historial de cambios y se borran los intentos de recuperación. Después,
//   ningún cid puede atribuirse a una persona.
// - En un uso institucional posterior (`anonimizarVencidos`): el admin configura un plazo
//   de conservación, y los registros, consultas y cambios más antiguos se anonimizan
//   solos. El registro de consultas se conserva lo mismo que los registros a los que se
//   refiere.
//
// No se toca:
// - la bitácora encadenada de evidence-log/, que solo contiene cid y vive en otro proceso;
// - el historial cid → titular (`asignaciones_cid`), que solo guarda el identificador
//   opaco del titular: sin sus datos, ese identificador ya no apunta a nadie;
// - las credenciales y los dispositivos, que no tienen datos personales.

export const PLAZO_CLAVE = 'plazo_conservacion_dias';
export const FRASE_CIERRE = 'ANONIMIZAR TODO';
const ANONIMO = 'Anonimizado';

export interface ResultadoAnonimizacion {
  titulares: number;
  registros: number;
  consultas: number;
  cambios: number;
}

// Motivos de lista cerrada que se escriben en `cambios_configuracion` al resolver un alta
// en revisión (`revision.ts`). No son texto del admin y se conservan; cualquier otro
// `motivo` (revocar, desvincular, reactivar) es libre y se quita (issue #147).
const MOTIVOS_CERRADOS = [
  'documento_de_otra_persona',
  'misma_persona',
  'registro_anterior_indebido',
  'sin_registro_anterior',
];

const CERRADOS_SQL = MOTIVOS_CERRADOS.map((m) => `'${m}'`).join(', ');

function motivoLibreSql(valor: string): string {
  return `(json_type(${valor}, '$.motivo') = 'text'
    AND json_extract(${valor}, '$.motivo') NOT IN (${CERRADOS_SQL}))`;
}

function tieneTextoLibreSql(valor: string): string {
  return `(json_valid(${valor}) AND json_type(${valor}) = 'object'
    AND (json_type(${valor}, '$.nota') IS NOT NULL OR ${motivoLibreSql(valor)}))`;
}

/**
 * `valor` sin `nota` ni el `motivo` libre; igual si no los tiene. El disparador de
 * `cambios_configuracion` solo admite actualizar una fila a este resultado.
 */
export function limpiarTextoLibreSql(valor: string): string {
  return `(CASE WHEN NOT ${tieneTextoLibreSql(valor)} THEN ${valor}
    WHEN ${motivoLibreSql(valor)} THEN json_remove(${valor}, '$.nota', '$.motivo')
    ELSE json_remove(${valor}, '$.nota') END)`;
}

function limpiarCambios(db: Database.Database, antesDe: string | null): number {
  return db
    .prepare(
      `UPDATE cambios_configuracion
       SET valor_anterior = ${limpiarTextoLibreSql('valor_anterior')},
           valor_nuevo = ${limpiarTextoLibreSql('valor_nuevo')}
       WHERE (${tieneTextoLibreSql('valor_anterior')} OR ${tieneTextoLibreSql('valor_nuevo')})
         AND (? IS NULL OR en < ?)`
    )
    .run(antesDe, antesDe).changes;
}

function registrar(
  db: Database.Database,
  alcance: 'cierre' | 'plazo',
  r: ResultadoAnonimizacion,
  quien: string,
  ahora: Date
): void {
  db.prepare(
    `INSERT INTO anonimizaciones
       (alcance, titulares, registros, consultas, cambios, ejecutado_por, ejecutado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(alcance, r.titulares, r.registros, r.consultas, r.cambios, quien, ahora.toISOString());
}

/**
 * Cierre del piloto. Irreversible: por eso exige la frase de confirmación, igual que el
 * comando de línea de comandos.
 */
export function anonimizarCierre(
  db: Database.Database,
  confirmacion: string,
  quien: string,
  ahora: Date
): ResultadoAnonimizacion {
  if (confirmacion !== FRASE_CIERRE) {
    throw new Error(`Para confirmar escribe exactamente «${FRASE_CIERRE}».`);
  }
  return db.transaction(() => {
    // El documento se reemplaza por uno único y opaco: el índice de documento único sigue
    // valiendo y nada del valor original sobrevive.
    const titulares = db
      .prepare(
        `UPDATE titulares
         SET nombre = ?, documento = 'anon-' || ref, correo = '', estado = 'anonimizado',
             codigo_recuperacion_hash = NULL
         WHERE estado <> 'anonimizado'`
      )
      .run(ANONIMO).changes;
    const registros = db
      .prepare(
        `UPDATE registros SET nombre = ?, documento = 'anon-' || id,
           motivo = CASE WHEN corrige_registro_id IS NOT NULL THEN ? ELSE NULL END
         WHERE NOT (nombre = ? AND documento = 'anon-' || id)
            OR (motivo IS NOT NULL AND motivo <> ?)`
      )
      .run(ANONIMO, ANONIMO, ANONIMO, ANONIMO).changes;
    const consultas = db
      .prepare(`UPDATE consultas_cid
        SET motivo = NULL, cid = CASE WHEN ${canonicalCidSql()} THEN cid ELSE 'anon-' || id END
        WHERE motivo IS NOT NULL OR (NOT ${canonicalCidSql()} AND cid <> 'anon-' || id)`)
      .run().changes;
    const cambios = limpiarCambios(db, null);
    db.prepare('DELETE FROM intentos_recuperacion').run();
    db.prepare('DELETE FROM intentos_alta').run();
    const resultado = { titulares, registros, consultas, cambios };
    registrar(db, 'cierre', resultado, quien, ahora);
    return resultado;
  })();
}

export function getPlazoConservacion(db: Database.Database): number | null {
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(PLAZO_CLAVE) as
    | { valor: string | null }
    | undefined;
  return row?.valor ? Number(row.valor) : null;
}

/** null = sin plazo: los datos se conservan hasta el cierre. */
export function setPlazoConservacion(
  db: Database.Database,
  dias: number | null,
  usuarioId: number,
  ahora: Date
): void {
  if (dias !== null && (!Number.isInteger(dias) || dias < 30 || dias > 3650)) {
    throw new Error('El plazo va de 30 a 3650 días.');
  }
  db.transaction(() => {
    const anterior = getPlazoConservacion(db);
    db.prepare(
      `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`
    ).run(PLAZO_CLAVE, dias === null ? null : String(dias));
    db.prepare(
      `INSERT INTO cambios_configuracion
         (usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, en)
       VALUES (?, 'conservacion', NULL, 'plazo', ?, ?, ?)`
    ).run(usuarioId, JSON.stringify(anterior), JSON.stringify(dias), ahora.toISOString());
  })();
}

/** Anonimiza registros, consultas y cambios más antiguos que el plazo configurado. */
export function anonimizarVencidos(
  db: Database.Database,
  ahora: Date,
  quien = 'tarea programada'
): ResultadoAnonimizacion | null {
  const dias = getPlazoConservacion(db);
  if (dias === null) return null;
  const limite = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  // `registros.timestamp` usa el formato de SQLite (AAAA-MM-DD HH:MM:SS, UTC).
  const limiteSqlite = limite.toISOString().replace('T', ' ').slice(0, 19);
  return db.transaction(() => {
    const registros = db
      .prepare(
        `UPDATE registros SET nombre = ?, documento = 'anon-' || id,
           motivo = CASE WHEN corrige_registro_id IS NOT NULL THEN ? ELSE NULL END
         WHERE timestamp < ? AND (
           NOT (nombre = ? AND documento = 'anon-' || id)
           OR (motivo IS NOT NULL AND motivo <> ?))`
      )
      .run(ANONIMO, ANONIMO, limiteSqlite, ANONIMO, ANONIMO).changes;
    const consultas = db
      .prepare(`UPDATE consultas_cid
        SET motivo = NULL, cid = CASE WHEN ${canonicalCidSql()} THEN cid ELSE 'anon-' || id END
        WHERE en < ? AND (motivo IS NOT NULL OR (NOT ${canonicalCidSql()} AND cid <> 'anon-' || id))`)
      .run(limite.toISOString()).changes;
    const cambios = limpiarCambios(db, limite.toISOString());
    db.prepare('DELETE FROM intentos_recuperacion WHERE en < ?').run(limite.toISOString());
    db.prepare('DELETE FROM intentos_alta WHERE en < ?').run(limite.toISOString());
    const resultado = { titulares: 0, registros, consultas, cambios };
    if (registros > 0 || consultas > 0 || cambios > 0) {
      registrar(db, 'plazo', resultado, quien, ahora);
    }
    return resultado;
  })();
}
