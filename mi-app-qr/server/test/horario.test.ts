import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { registrarTitular } from '../src/titulares/repository.js';
import { dentroDeHorario, momentoLocal } from '../src/estamentos/horario.js';
import {
  ConfigError,
  crearEstamento,
  crearExcepcion,
  elegirBase,
  reemplazarVentanas,
} from '../src/estamentos/config.js';

// Hora local de la sede: America/Bogota (UTC−5, sin horario de verano).
// 2026-10-26 es lunes; 08:00 en Bogotá son las 13:00 UTC.
const TZ = 'America/Bogota';
const local = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);
const LUNES = '2026-10-26';
const SABADO = '2026-10-31';

let db: Database.Database;
let admin: number;
let estudiante: number;
let docente: number;
let externo: number;

function alta(documento: string, estamentoId: number) {
  return registrarTitular(
    db,
    { nombre: 'Titular Sintético', documento, correo: 'titular@ejemplo.test', estamentoId },
    new Date()
  ).titular;
}

function decide(titularId: number, momento: Date) {
  return dentroDeHorario(db, titularId, momento, TZ);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  admin = Number(
    db
      .prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', 'x', 'admin')")
      .run().lastInsertRowid
  );
  const ahora = new Date();
  estudiante = crearEstamento(db, admin, { nombre: 'Estudiante', requiereConfirmacion: false }, ahora).id;
  docente = crearEstamento(db, admin, { nombre: 'Docente', requiereConfirmacion: true }, ahora).id;
  externo = crearEstamento(db, admin, { nombre: 'Externo', requiereConfirmacion: true }, ahora).id;
  elegirBase(db, admin, estudiante, ahora);
  // Estudiante: lunes a viernes de 06:00 a 18:00.
  reemplazarVentanas(
    db,
    admin,
    estudiante,
    [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, inicio: '06:00', fin: '18:00' })),
    ahora
  );
  // Docente: lunes a sábado de 05:00 a 22:00.
  reemplazarVentanas(
    db,
    admin,
    docente,
    [1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, inicio: '05:00', fin: '22:00' })),
    ahora
  );
  // Externo: sin restricción de horario, todos los días el día completo.
  reemplazarVentanas(
    db,
    admin,
    externo,
    [1, 2, 3, 4, 5, 6, 7].map((d) => ({ diaSemana: d, inicio: '00:00', fin: '24:00' })),
    ahora
  );
});

afterEach(() => db.close());

describe('momento local de la sede', () => {
  it('convierte a la fecha, el día ISO y el minuto de Bogotá', () => {
    // 03:30 UTC del martes son las 22:30 del lunes en Bogotá.
    expect(momentoLocal(new Date('2026-10-27T03:30:00Z'), TZ)).toEqual({
      fecha: LUNES,
      diaSemana: 1,
      minutos: 22 * 60 + 30,
    });
    expect(momentoLocal(local(SABADO, '00:00'), TZ).diaSemana).toBe(6);
  });
});

describe('ventanas semanales', () => {
  it('el inicio de la ventana entra y el fin no', () => {
    const t = alta('2000000001', estudiante);
    expect(decide(t.id, local(LUNES, '05:59')).permitido).toBe(false);
    expect(decide(t.id, local(LUNES, '06:00')).permitido).toBe(true);
    expect(decide(t.id, local(LUNES, '17:59')).permitido).toBe(true);
    const cierre = decide(t.id, local(LUNES, '18:00'));
    expect(cierre).toEqual({ permitido: false, motivo: 'fuera_de_ventana', estamentoEfectivoId: estudiante });
  });

  it('un día sin ventanas no da QR', () => {
    const t = alta('2000000002', estudiante);
    expect(decide(t.id, local(SABADO, '10:00')).motivo).toBe('fuera_de_ventana');
  });

  it('«24:00» cubre hasta el último minuto del día', () => {
    const t = alta('2000000003', externo);
    db.prepare('UPDATE titulares SET estamento_confirmado = 1 WHERE id = ?').run(t.id);
    expect(decide(t.id, local(SABADO, '23:59')).permitido).toBe(true);
    expect(decide(t.id, local(SABADO, '00:00')).permitido).toBe(true);
  });

  it('un estamento sin ventanas no recibe QR (falla cerrado)', () => {
    reemplazarVentanas(db, admin, estudiante, [], new Date());
    const t = alta('2000000004', estudiante);
    expect(decide(t.id, local(LUNES, '10:00')).motivo).toBe('sin_ventanas');
  });
});

describe('estamento pendiente de confirmar', () => {
  it('recibe las ventanas del estamento base', () => {
    const t = alta('2000000010', docente);
    expect(t.estamentoConfirmado).toBe(false);
    // 20:00 entra en Docente pero no en Estudiante.
    const pendiente = decide(t.id, local(LUNES, '20:00'));
    expect(pendiente.permitido).toBe(false);
    expect(pendiente.estamentoEfectivoId).toBe(estudiante);
    db.prepare('UPDATE titulares SET estamento_confirmado = 1 WHERE id = ?').run(t.id);
    expect(decide(t.id, local(LUNES, '20:00')).permitido).toBe(true);
  });

  it('declararse Externo no salta los horarios mientras no se confirme', () => {
    const t = alta('2000000011', externo);
    expect(decide(t.id, local(SABADO, '03:00')).permitido).toBe(false);
  });

  it('sin estamento base no hay horario', () => {
    const t = alta('2000000012', docente);
    db.prepare('UPDATE estamentos SET es_base = 0').run();
    expect(decide(t.id, local(LUNES, '10:00')).motivo).toBe('sin_estamento_base');
  });
});

describe('excepciones de calendario', () => {
  it('un cierre para todos manda sobre las ventanas semanales', () => {
    crearExcepcion(
      db,
      admin,
      {
        fechaDesde: LUNES,
        fechaHasta: LUNES,
        tipo: 'cierre',
        estamentoId: null,
        descripcion: 'Festivo',
        ventanas: [],
      },
      new Date()
    );
    const t = alta('2000000020', estudiante);
    expect(decide(t.id, local(LUNES, '10:00')).motivo).toBe('dia_cerrado');
    // El día siguiente vuelve a las ventanas normales.
    expect(decide(t.id, local('2026-10-27', '10:00')).permitido).toBe(true);
  });

  it('un cierre para un estamento no afecta a los demás', () => {
    crearExcepcion(
      db,
      admin,
      {
        fechaDesde: LUNES,
        fechaHasta: LUNES,
        tipo: 'cierre',
        estamentoId: docente,
        descripcion: 'Jornada pedagógica',
        ventanas: [],
      },
      new Date()
    );
    const est = alta('2000000021', estudiante);
    const doc = alta('2000000022', docente);
    db.prepare('UPDATE titulares SET estamento_confirmado = 1 WHERE id = ?').run(doc.id);
    expect(decide(est.id, local(LUNES, '10:00')).permitido).toBe(true);
    expect(decide(doc.id, local(LUNES, '10:00')).motivo).toBe('dia_cerrado');
  });

  it('un reemplazo deja solo sus ventanas, en un rango de fechas inclusivo', () => {
    crearExcepcion(
      db,
      admin,
      {
        fechaDesde: '2026-10-30',
        fechaHasta: SABADO,
        tipo: 'reemplazo',
        estamentoId: null,
        descripcion: 'Jornada especial',
        ventanas: [{ inicio: '08:00', fin: '12:00' }],
      },
      new Date()
    );
    const t = alta('2000000023', estudiante);
    // El sábado normalmente no hay ventana para Estudiante; la excepción la abre.
    expect(decide(t.id, local(SABADO, '09:00')).permitido).toBe(true);
    expect(decide(t.id, local(SABADO, '12:00')).permitido).toBe(false);
    // El viernes, las 15:00 entraban por la ventana normal; el reemplazo las cierra.
    expect(decide(t.id, local('2026-10-30', '15:00')).motivo).toBe('fuera_de_ventana');
  });

  it('si coinciden cierre y reemplazo, gana el cierre', () => {
    const base = { fechaDesde: LUNES, fechaHasta: LUNES, estamentoId: null };
    crearExcepcion(
      db,
      admin,
      { ...base, tipo: 'reemplazo', descripcion: 'Media jornada', ventanas: [{ inicio: '08:00', fin: '12:00' }] },
      new Date()
    );
    crearExcepcion(
      db,
      admin,
      { ...base, tipo: 'cierre', descripcion: 'Cierre por emergencia', ventanas: [] },
      new Date()
    );
    const t = alta('2000000024', estudiante);
    expect(decide(t.id, local(LUNES, '09:00')).motivo).toBe('dia_cerrado');
  });

  it('valida las excepciones', () => {
    const intento = (cambios: object) => () =>
      crearExcepcion(
        db,
        admin,
        {
          fechaDesde: LUNES,
          fechaHasta: LUNES,
          tipo: 'reemplazo',
          estamentoId: null,
          descripcion: 'Prueba',
          ventanas: [{ inicio: '08:00', fin: '12:00' }],
          ...cambios,
        },
        new Date()
      );
    expect(intento({ fechaHasta: '2026-10-25' })).toThrow(ConfigError);
    expect(intento({ fechaDesde: '2026-02-30' })).toThrow(ConfigError);
    expect(intento({ ventanas: [] })).toThrow(ConfigError);
    expect(intento({ tipo: 'cierre' })).toThrow(ConfigError);
    expect(intento({ ventanas: [{ inicio: '12:00', fin: '08:00' }] })).toThrow(ConfigError);
  });
});

describe('estado del titular', () => {
  it('un titular suspendido o en revisión no recibe QR', () => {
    const t = alta('2000000030', estudiante);
    db.prepare("UPDATE titulares SET estado = 'suspendido' WHERE id = ?").run(t.id);
    expect(decide(t.id, local(LUNES, '10:00')).motivo).toBe('titular_no_activo');
    const repetido = alta('2000000030', estudiante);
    expect(repetido.estado).toBe('en_revision');
    expect(decide(repetido.id, local(LUNES, '10:00')).motivo).toBe('titular_no_activo');
    expect(decide(9999, local(LUNES, '10:00')).motivo).toBe('titular_no_activo');
  });
});
