import type Database from 'better-sqlite3';

// Decide si un titular puede recibir un QR en un momento dado (ADR-0016, punto 5).
// La regla se aplica al emitir, no al verificar: verifier/ nunca conoce el estamento.
//
// Orden de la decisión, y en cada paso falla cerrado:
// 1. El titular debe estar activo.
// 2. Estamento efectivo: el suyo si está confirmado; si no, el estamento base. Sin base,
//    no hay horario.
// 3. Si una excepción de calendario cubre la fecha local y aplica a ese estamento (o a
//    todos), manda sobre las ventanas semanales: un cierre niega; un reemplazo deja solo
//    sus propias ventanas. Si hay cierre y reemplazo a la vez, gana el cierre.
// 4. Si no, valen las ventanas semanales del día. Un estamento sin ventanas no recibe QR.
// Una ventana incluye su inicio y excluye su fin: [inicio, fin).

export const DEFAULT_TIME_ZONE = 'America/Bogota';

export type MotivoHorario =
  | 'dentro_de_ventana'
  | 'titular_no_activo'
  | 'sin_estamento_base'
  | 'dia_cerrado'
  | 'fuera_de_ventana'
  | 'sin_ventanas';

export interface DecisionHorario {
  permitido: boolean;
  motivo: MotivoHorario;
  // Estamento cuyas reglas se aplicaron (el base si el propio no está confirmado).
  estamentoEfectivoId: number | null;
}

export interface MomentoLocal {
  fecha: string; // AAAA-MM-DD
  diaSemana: number; // 1 = lunes … 7 = domingo
  minutos: number; // desde la medianoche local
}

const DIAS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Fecha, día y minuto en la zona horaria de la sede. */
export function momentoLocal(ahora: Date, timeZone: string): MomentoLocal {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .map((p) => [p.type, p.value])
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    diaSemana: DIAS[partes.weekday],
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

interface Ventana {
  inicio_min: number;
  fin_min: number;
}

function dentro(ventanas: Ventana[], minutos: number): boolean {
  return ventanas.some((v) => v.inicio_min <= minutos && minutos < v.fin_min);
}

/** Estamento cuyas ventanas recibe el titular, o null si no hay forma de saberlo. */
export function estamentoEfectivo(
  db: Database.Database,
  estamentoId: number,
  confirmado: boolean
): number | null {
  if (confirmado) return estamentoId;
  const base = db.prepare('SELECT id FROM estamentos WHERE es_base = 1').get() as
    | { id: number }
    | undefined;
  return base?.id ?? null;
}

/** Evalúa las reglas de un estamento en un momento local. */
export function evaluarEstamento(
  db: Database.Database,
  estamentoId: number,
  momento: MomentoLocal
): { permitido: boolean; motivo: MotivoHorario } {
  const excepciones = db
    .prepare(
      `SELECT id, tipo FROM excepciones_calendario
       WHERE ? BETWEEN fecha_desde AND fecha_hasta
         AND (estamento_id IS NULL OR estamento_id = ?)`
    )
    .all(momento.fecha, estamentoId) as { id: number; tipo: 'cierre' | 'reemplazo' }[];

  if (excepciones.length > 0) {
    if (excepciones.some((e) => e.tipo === 'cierre')) {
      return { permitido: false, motivo: 'dia_cerrado' };
    }
    const marcadores = excepciones.map(() => '?').join(', ');
    const ventanas = db
      .prepare(
        `SELECT inicio_min, fin_min FROM excepcion_ventanas WHERE excepcion_id IN (${marcadores})`
      )
      .all(...excepciones.map((e) => e.id)) as Ventana[];
    if (ventanas.length === 0) return { permitido: false, motivo: 'dia_cerrado' };
    return dentro(ventanas, momento.minutos)
      ? { permitido: true, motivo: 'dentro_de_ventana' }
      : { permitido: false, motivo: 'fuera_de_ventana' };
  }

  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM reglas_horario WHERE estamento_id = ?')
    .get(estamentoId) as { n: number };
  if (n === 0) return { permitido: false, motivo: 'sin_ventanas' };

  const delDia = db
    .prepare(
      'SELECT inicio_min, fin_min FROM reglas_horario WHERE estamento_id = ? AND dia_semana = ?'
    )
    .all(estamentoId, momento.diaSemana) as Ventana[];
  return dentro(delDia, momento.minutos)
    ? { permitido: true, motivo: 'dentro_de_ventana' }
    : { permitido: false, motivo: 'fuera_de_ventana' };
}

/** ¿Puede el titular recibir un QR ahora? Es lo que consulta la emisión (#85). */
export function dentroDeHorario(
  db: Database.Database,
  titularId: number,
  ahora: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): DecisionHorario {
  const titular = db
    .prepare('SELECT estado, estamento_id, estamento_confirmado FROM titulares WHERE id = ?')
    .get(titularId) as
    | { estado: string; estamento_id: number; estamento_confirmado: number }
    | undefined;
  if (!titular || titular.estado !== 'activo') {
    return { permitido: false, motivo: 'titular_no_activo', estamentoEfectivoId: null };
  }
  const efectivo = estamentoEfectivo(
    db,
    titular.estamento_id,
    titular.estamento_confirmado === 1
  );
  if (efectivo === null) {
    return { permitido: false, motivo: 'sin_estamento_base', estamentoEfectivoId: null };
  }
  const resultado = evaluarEstamento(db, efectivo, momentoLocal(ahora, timeZone));
  return { ...resultado, estamentoEfectivoId: efectivo };
}
