import type Database from 'better-sqlite3';
import type {
  Estamento,
  EstamentoDetalle,
  ExcepcionCalendario,
  ReglaDominio,
  TipoExcepcion,
  VentanaHorario,
} from '@mi-app-qr/shared';

// Configuración de estamentos desde el panel de admin (ADR-0016, punto 5; issue #89).
// Todo cambio queda en `cambios_configuracion` con quién, cuándo, el valor anterior y el
// nuevo, en la misma transacción que el cambio.

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
  }
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Dominio de correo en minúsculas, sin «@» (ejemplo.edu.co).
const DOMINIO = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** «HH:MM» a minutos desde la medianoche. «24:00» solo vale como fin de una ventana. */
export function parseHora(valor: string, esFin = false): number {
  if (esFin && valor === '24:00') return 1440;
  const m = HORA.exec(valor);
  if (!m) throw new ConfigError(`Hora inválida: usa HH:MM (00:00 a ${esFin ? '24:00' : '23:59'}).`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function esFechaValida(valor: string): boolean {
  if (!FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export function registrarCambio(
  db: Database.Database,
  usuarioId: number,
  entidad: string,
  entidadId: number | null,
  accion: string,
  anterior: unknown,
  nuevo: unknown,
  ahora: Date
): void {
  db.prepare(
    `INSERT INTO cambios_configuracion
       (usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    usuarioId,
    entidad,
    entidadId,
    accion,
    anterior === undefined ? null : JSON.stringify(anterior),
    nuevo === undefined ? null : JSON.stringify(nuevo),
    ahora.toISOString()
  );
}

interface EstamentoRow {
  id: number;
  nombre: string;
  requiere_confirmacion: number;
  es_base: number;
}

function toEstamento(row: EstamentoRow): Estamento {
  return {
    id: row.id,
    nombre: row.nombre,
    requiereConfirmacion: row.requiere_confirmacion === 1,
    esBase: row.es_base === 1,
  };
}

function getEstamentoRow(db: Database.Database, id: number): EstamentoRow {
  const row = db
    .prepare('SELECT id, nombre, requiere_confirmacion, es_base FROM estamentos WHERE id = ?')
    .get(id) as EstamentoRow | undefined;
  if (!row) throw new ConfigError('El estamento no existe.', 404);
  return row;
}

function ventanasDe(db: Database.Database, estamentoId: number): VentanaHorario[] {
  const rows = db
    .prepare(
      `SELECT dia_semana, inicio_min, fin_min FROM reglas_horario
       WHERE estamento_id = ? ORDER BY dia_semana, inicio_min`
    )
    .all(estamentoId) as { dia_semana: number; inicio_min: number; fin_min: number }[];
  return rows.map((r) => ({
    diaSemana: r.dia_semana,
    inicio: formatHora(r.inicio_min),
    fin: formatHora(r.fin_min),
  }));
}

export function listEstamentos(db: Database.Database): EstamentoDetalle[] {
  const rows = db
    .prepare('SELECT id, nombre, requiere_confirmacion, es_base FROM estamentos ORDER BY nombre')
    .all() as EstamentoRow[];
  return rows.map((row) => ({ ...toEstamento(row), ventanas: ventanasDe(db, row.id) }));
}

export function hayEstamentoBase(db: Database.Database): boolean {
  return db.prepare('SELECT 1 FROM estamentos WHERE es_base = 1').get() !== undefined;
}

export function crearEstamento(
  db: Database.Database,
  usuarioId: number,
  datos: { nombre: string; requiereConfirmacion: boolean },
  ahora: Date
): Estamento {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new ConfigError('El estamento necesita un nombre.');
  return db.transaction(() => {
    let id: number;
    try {
      id = Number(
        db
          .prepare(
            `INSERT INTO estamentos (nombre, requiere_confirmacion, es_base, creado_en)
             VALUES (?, ?, 0, ?)`
          )
          .run(nombre, datos.requiereConfirmacion ? 1 : 0, ahora.toISOString()).lastInsertRowid
      );
    } catch {
      throw new ConfigError('Ya existe un estamento con ese nombre.', 409);
    }
    const estamento = toEstamento(getEstamentoRow(db, id));
    registrarCambio(db, usuarioId, 'estamento', id, 'crear', undefined, estamento, ahora);
    return estamento;
  })();
}

export function actualizarEstamento(
  db: Database.Database,
  usuarioId: number,
  id: number,
  datos: { nombre?: string; requiereConfirmacion?: boolean },
  ahora: Date
): Estamento {
  return db.transaction(() => {
    const anterior = toEstamento(getEstamentoRow(db, id));
    const nombre = datos.nombre === undefined ? anterior.nombre : datos.nombre.trim();
    if (!nombre) throw new ConfigError('El estamento necesita un nombre.');
    const requiere = datos.requiereConfirmacion ?? anterior.requiereConfirmacion;
    if (anterior.esBase && requiere) {
      throw new ConfigError('El estamento base no puede requerir confirmación.', 409);
    }
    try {
      db.prepare('UPDATE estamentos SET nombre = ?, requiere_confirmacion = ? WHERE id = ?').run(
        nombre,
        requiere ? 1 : 0,
        id
      );
    } catch {
      throw new ConfigError('Ya existe un estamento con ese nombre.', 409);
    }
    const nuevo = toEstamento(getEstamentoRow(db, id));
    registrarCambio(db, usuarioId, 'estamento', id, 'actualizar', anterior, nuevo, ahora);
    return nuevo;
  })();
}

/** Elige el estamento base de la instalación. Sin base, el portal no admite altas. */
export function elegirBase(
  db: Database.Database,
  usuarioId: number,
  id: number,
  ahora: Date
): Estamento {
  return db.transaction(() => {
    const elegido = toEstamento(getEstamentoRow(db, id));
    if (elegido.requiereConfirmacion) {
      throw new ConfigError(
        'El estamento base no puede requerir confirmación: quítasela antes de elegirlo.',
        409
      );
    }
    const anterior = db.prepare('SELECT id FROM estamentos WHERE es_base = 1').get() as
      | { id: number }
      | undefined;
    db.prepare('UPDATE estamentos SET es_base = 0 WHERE es_base = 1').run();
    db.prepare('UPDATE estamentos SET es_base = 1 WHERE id = ?').run(id);
    registrarCambio(
      db,
      usuarioId,
      'estamento_base',
      id,
      'elegir_base',
      anterior ? { estamentoId: anterior.id } : null,
      { estamentoId: id },
      ahora
    );
    return toEstamento(getEstamentoRow(db, id));
  })();
}

export function borrarEstamento(
  db: Database.Database,
  usuarioId: number,
  id: number,
  ahora: Date
): void {
  db.transaction(() => {
    const anterior = toEstamento(getEstamentoRow(db, id));
    if (anterior.esBase) {
      throw new ConfigError('No se puede borrar el estamento base mientras lo sea.', 409);
    }
    const enUso = db.prepare('SELECT 1 FROM titulares WHERE estamento_id = ? LIMIT 1').get(id);
    if (enUso) {
      throw new ConfigError('Hay titulares en este estamento: cámbialos antes de borrarlo.', 409);
    }
    const detalle = { ...anterior, ventanas: ventanasDe(db, id) };
    db.prepare('DELETE FROM estamentos WHERE id = ?').run(id);
    registrarCambio(db, usuarioId, 'estamento', id, 'borrar', detalle, undefined, ahora);
  })();
}

/** Reemplaza todas las ventanas semanales de un estamento. Una lista vacía lo deja sin QR. */
export function reemplazarVentanas(
  db: Database.Database,
  usuarioId: number,
  estamentoId: number,
  ventanas: VentanaHorario[],
  ahora: Date
): VentanaHorario[] {
  const nuevas = ventanas.map((v) => {
    if (!Number.isInteger(v.diaSemana) || v.diaSemana < 1 || v.diaSemana > 7) {
      throw new ConfigError('El día de la semana va de 1 (lunes) a 7 (domingo).');
    }
    const inicio = parseHora(v.inicio);
    const fin = parseHora(v.fin, true);
    if (inicio >= fin) {
      throw new ConfigError('Cada ventana debe terminar después de empezar, el mismo día.');
    }
    return { dia: v.diaSemana, inicio, fin };
  });
  return db.transaction(() => {
    getEstamentoRow(db, estamentoId);
    const anteriores = ventanasDe(db, estamentoId);
    db.prepare('DELETE FROM reglas_horario WHERE estamento_id = ?').run(estamentoId);
    const insertar = db.prepare(
      'INSERT INTO reglas_horario (estamento_id, dia_semana, inicio_min, fin_min) VALUES (?, ?, ?, ?)'
    );
    for (const v of nuevas) insertar.run(estamentoId, v.dia, v.inicio, v.fin);
    const actuales = ventanasDe(db, estamentoId);
    registrarCambio(db, usuarioId, 'ventanas', estamentoId, 'reemplazar', anteriores, actuales, ahora);
    return actuales;
  })();
}

interface ExcepcionRow {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  tipo: TipoExcepcion;
  estamento_id: number | null;
  descripcion: string;
}

function toExcepcion(db: Database.Database, row: ExcepcionRow): ExcepcionCalendario {
  const ventanas = db
    .prepare(
      'SELECT inicio_min, fin_min FROM excepcion_ventanas WHERE excepcion_id = ? ORDER BY inicio_min'
    )
    .all(row.id) as { inicio_min: number; fin_min: number }[];
  return {
    id: row.id,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    tipo: row.tipo,
    estamentoId: row.estamento_id,
    descripcion: row.descripcion,
    ventanas: ventanas.map((v) => ({ inicio: formatHora(v.inicio_min), fin: formatHora(v.fin_min) })),
  };
}

export function listExcepciones(db: Database.Database): ExcepcionCalendario[] {
  const rows = db
    .prepare('SELECT * FROM excepciones_calendario ORDER BY fecha_desde, id')
    .all() as ExcepcionRow[];
  return rows.map((row) => toExcepcion(db, row));
}

export function crearExcepcion(
  db: Database.Database,
  usuarioId: number,
  datos: Omit<ExcepcionCalendario, 'id'>,
  ahora: Date
): ExcepcionCalendario {
  if (!esFechaValida(datos.fechaDesde) || !esFechaValida(datos.fechaHasta)) {
    throw new ConfigError('Fecha inválida: usa AAAA-MM-DD.');
  }
  if (datos.fechaDesde > datos.fechaHasta) {
    throw new ConfigError('La fecha final no puede ser anterior a la inicial.');
  }
  const descripcion = datos.descripcion.trim();
  if (!descripcion) throw new ConfigError('Describe la excepción (por ejemplo, «Festivo»).');
  if (datos.tipo === 'cierre' && datos.ventanas.length > 0) {
    throw new ConfigError('Un cierre no lleva ventanas.');
  }
  if (datos.tipo === 'reemplazo' && datos.ventanas.length === 0) {
    throw new ConfigError('Un reemplazo necesita al menos una ventana; para cerrar, usa un cierre.');
  }
  const ventanas = datos.ventanas.map((v) => {
    const inicio = parseHora(v.inicio);
    const fin = parseHora(v.fin, true);
    if (inicio >= fin) throw new ConfigError('Cada ventana debe terminar después de empezar.');
    return { inicio, fin };
  });
  return db.transaction(() => {
    if (datos.estamentoId !== null) getEstamentoRow(db, datos.estamentoId);
    const id = Number(
      db
        .prepare(
          `INSERT INTO excepciones_calendario
             (fecha_desde, fecha_hasta, tipo, estamento_id, descripcion)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(datos.fechaDesde, datos.fechaHasta, datos.tipo, datos.estamentoId, descripcion)
        .lastInsertRowid
    );
    const insertar = db.prepare(
      'INSERT INTO excepcion_ventanas (excepcion_id, inicio_min, fin_min) VALUES (?, ?, ?)'
    );
    for (const v of ventanas) insertar.run(id, v.inicio, v.fin);
    const creada = toExcepcion(
      db,
      db.prepare('SELECT * FROM excepciones_calendario WHERE id = ?').get(id) as ExcepcionRow
    );
    registrarCambio(db, usuarioId, 'excepcion', id, 'crear', undefined, creada, ahora);
    return creada;
  })();
}

export function borrarExcepcion(
  db: Database.Database,
  usuarioId: number,
  id: number,
  ahora: Date
): void {
  db.transaction(() => {
    const row = db.prepare('SELECT * FROM excepciones_calendario WHERE id = ?').get(id) as
      | ExcepcionRow
      | undefined;
    if (!row) throw new ConfigError('La excepción no existe.', 404);
    const anterior = toExcepcion(db, row);
    db.prepare('DELETE FROM excepciones_calendario WHERE id = ?').run(id);
    registrarCambio(db, usuarioId, 'excepcion', id, 'borrar', anterior, undefined, ahora);
  })();
}

export function listDominios(db: Database.Database): ReglaDominio[] {
  const rows = db
    .prepare('SELECT id, dominio, estamento_id FROM dominios_correo ORDER BY dominio')
    .all() as { id: number; dominio: string; estamento_id: number }[];
  return rows.map((r) => ({ id: r.id, dominio: r.dominio, estamentoId: r.estamento_id }));
}

export function crearDominio(
  db: Database.Database,
  usuarioId: number,
  datos: { dominio: string; estamentoId: number },
  ahora: Date
): ReglaDominio {
  const dominio = datos.dominio.trim().toLowerCase().replace(/^@/, '');
  if (!DOMINIO.test(dominio)) {
    throw new ConfigError('Dominio inválido: escríbelo sin «@», por ejemplo ejemplo.edu.co.');
  }
  return db.transaction(() => {
    getEstamentoRow(db, datos.estamentoId);
    let id: number;
    try {
      id = Number(
        db
          .prepare('INSERT INTO dominios_correo (dominio, estamento_id) VALUES (?, ?)')
          .run(dominio, datos.estamentoId).lastInsertRowid
      );
    } catch {
      throw new ConfigError('Ese dominio ya tiene una regla.', 409);
    }
    const regla = { id, dominio, estamentoId: datos.estamentoId };
    registrarCambio(db, usuarioId, 'dominio', id, 'crear', undefined, regla, ahora);
    return regla;
  })();
}

export function borrarDominio(
  db: Database.Database,
  usuarioId: number,
  id: number,
  ahora: Date
): void {
  db.transaction(() => {
    const row = db.prepare('SELECT id, dominio, estamento_id FROM dominios_correo WHERE id = ?').get(
      id
    ) as { id: number; dominio: string; estamento_id: number } | undefined;
    if (!row) throw new ConfigError('La regla de dominio no existe.', 404);
    db.prepare('DELETE FROM dominios_correo WHERE id = ?').run(id);
    registrarCambio(
      db,
      usuarioId,
      'dominio',
      id,
      'borrar',
      { id: row.id, dominio: row.dominio, estamentoId: row.estamento_id },
      undefined,
      ahora
    );
  })();
}

export interface Sugerencia {
  estamentoId: number;
  // Solo se asigna directamente si el estamento no requiere confirmación; si la requiere,
  // queda pendiente del admin igual que si el titular lo hubiera elegido.
  asignaDirecto: boolean;
}

/** Estamento que sugiere el dominio del correo declarado (el correo no se verifica). */
export function estamentoSugerido(db: Database.Database, correo: string): Sugerencia | null {
  const arroba = correo.lastIndexOf('@');
  if (arroba < 0) return null;
  const dominio = correo.slice(arroba + 1).trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT e.id, e.requiere_confirmacion FROM dominios_correo d
       JOIN estamentos e ON e.id = d.estamento_id WHERE d.dominio = ?`
    )
    .get(dominio) as { id: number; requiere_confirmacion: number } | undefined;
  if (!row) return null;
  return { estamentoId: row.id, asignaDirecto: row.requiere_confirmacion === 0 };
}

/**
 * Un admin cambia el estamento de un titular o confirma el que declaró. Confirmar un
 * estamento que no requiere confirmación no cambia nada: ya estaba confirmado.
 */
export function cambiarEstamentoTitular(
  db: Database.Database,
  usuarioId: number,
  titularId: number,
  estamentoId: number,
  ahora: Date
): { estamentoId: number; estamentoConfirmado: boolean } {
  return db.transaction(() => {
    getEstamentoRow(db, estamentoId);
    const titular = db
      .prepare('SELECT estamento_id, estamento_confirmado, estado FROM titulares WHERE id = ?')
      .get(titularId) as
      | { estamento_id: number; estamento_confirmado: number; estado: string }
      | undefined;
    if (!titular || titular.estado === 'anonimizado') {
      throw new ConfigError('El titular no existe.', 404);
    }
    const anterior = {
      estamentoId: titular.estamento_id,
      estamentoConfirmado: titular.estamento_confirmado === 1,
    };
    // Lo asigna un admin: queda confirmado, requiera o no confirmación.
    db.prepare('UPDATE titulares SET estamento_id = ?, estamento_confirmado = 1 WHERE id = ?').run(
      estamentoId,
      titularId
    );
    const nuevo = { estamentoId, estamentoConfirmado: true };
    registrarCambio(db, usuarioId, 'titular_estamento', titularId, 'asignar', anterior, nuevo, ahora);
    return nuevo;
  })();
}

export interface CambioConfiguracion {
  id: number;
  usuario: string;
  entidad: string;
  entidadId: number | null;
  accion: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  en: string;
}

export function listCambios(db: Database.Database, limite = 200): CambioConfiguracion[] {
  const rows = db
    .prepare(
      `SELECT c.id, u.username, c.entidad, c.entidad_id, c.accion, c.valor_anterior,
              c.valor_nuevo, c.en
       FROM cambios_configuracion c JOIN users u ON u.id = c.usuario_id
       ORDER BY c.id DESC LIMIT ?`
    )
    .all(limite) as {
    id: number;
    username: string;
    entidad: string;
    entidad_id: number | null;
    accion: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
    en: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    usuario: r.username,
    entidad: r.entidad,
    entidadId: r.entidad_id,
    accion: r.accion,
    valorAnterior: valorPublico(r.valor_anterior),
    valorNuevo: valorPublico(r.valor_nuevo),
    en: r.en,
  }));
}

// Las filas antiguas pueden contener cid junto al id del titular. El registro de
// configuración no es una consulta auditada cid → persona: quitar ese campo de
// la respuesta sin modificar las filas históricas de solo agregar.
function valorPublico(serializado: string | null): unknown {
  const valor: unknown = serializado === null ? null : JSON.parse(serializado);
  if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    const { cid: _cid, ...publico } = valor as Record<string, unknown>;
    return publico;
  }
  return valor;
}
