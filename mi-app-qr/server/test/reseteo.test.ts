import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase, reemplazarVentanas } from '../src/estamentos/config.js';
import { puedeEmitir, revocarCredencial, cidsRevocados } from '../src/titulares/gestion.js';
import { titularRefForCid, verifyAsignaciones, listAsignaciones } from '../src/titulares/asignaciones.js';
import { historialCredenciales } from '../src/titulares/repository.js';
import { aplicarReseteoSiCorresponde, resetearCids, trimestreDe } from '../src/titulares/reseteo.js';

const TEST_DB_PATH = './data/test-reseteo.sqlite';
const EN_HORARIO = new Date('2026-10-26T10:00:00-05:00'); // lunes, 4.º trimestre
const ENERO = new Date('2027-01-04T10:00:00-05:00'); // lunes, 1.er trimestre siguiente
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let adminId: number;
let estudiante: number;

async function altaConTelefono(documento: string) {
  const telefono = request.agent(app);
  await telefono.post('/api/portal/alta').send({
    nombre: 'Titular Sintético',
    documento,
    correo: 't@ejemplo.test',
    estamentoId: estudiante,
    autorizaDatos: true,
  });
  const titular = db.prepare('SELECT id, ref FROM titulares WHERE documento = ?').get(documento) as {
    id: number;
    ref: string;
  };
  return { telefono, ...titular, cid: puedeEmitir(db, titular.id, EN_HORARIO).cid! };
}

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
  reemplazarVentanas(
    db,
    adminId,
    estudiante,
    [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, inicio: '06:00', fin: '18:00' })),
    new Date()
  );
});

afterEach(() => {
  db.close();
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + sufijo)) fs.unlinkSync(TEST_DB_PATH + sufijo);
  }
});

describe('trimestre local', () => {
  it('usa la fecha de la sede, no la UTC', () => {
    // 31 de diciembre a las 23:30 en Bogotá ya es 1 de enero en UTC.
    expect(trimestreDe(new Date('2027-01-01T04:30:00Z'), 'America/Bogota')).toBe('2026-T4');
    expect(trimestreDe(new Date('2027-01-01T05:30:00Z'), 'America/Bogota')).toBe('2027-T1');
    expect(trimestreDe(new Date('2026-04-01T12:00:00Z'))).toBe('2026-T2');
    expect(trimestreDe(new Date('2026-09-30T12:00:00Z'))).toBe('2026-T3');
  });
});

describe('reseteo del cid', () => {
  it('tras el reseteo no se emite con el cid anterior y el teléfono sigue vinculado', async () => {
    const { telefono, id, cid } = await altaConTelefono('7000000001');
    expect(resetearCids(db, ENERO)).toBe(1);
    const decision = puedeEmitir(db, id, ENERO);
    expect(decision.permitido).toBe(true);
    expect(decision.cid).not.toBe(cid);
    // El titular no hizo nada: su teléfono sigue funcionando.
    expect((await telefono.get('/api/portal/yo')).status).toBe(200);
    const historial = historialCredenciales(db, id);
    expect(historial.map((c) => [c.cid, c.estado])).toEqual([
      [cid, 'reemplazada'],
      [decision.cid, 'vigente'],
    ]);
  });

  it('el historial sigue resolviendo eventos viejos y la cadena verifica', async () => {
    const { ref, cid } = await altaConTelefono('7000000002');
    resetearCids(db, ENERO);
    expect(titularRefForCid(db, cid)).toBe(ref);
    expect(listAsignaciones(db).map((a) => a.motivo)).toEqual(['alta', 'reseteo']);
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('el cid anterior queda reemplazado, no revocado', async () => {
    await altaConTelefono('7000000003');
    resetearCids(db, ENERO);
    expect(cidsRevocados(db)).toEqual([]);
  });

  it('un titular suspendido no recibe cid nuevo', async () => {
    const activo = await altaConTelefono('7000000004');
    const suspendido = await altaConTelefono('7000000005');
    revocarCredencial(db, adminId, suspendido.id, 'Prueba', EN_HORARIO);
    expect(resetearCids(db, ENERO)).toBe(1);
    expect(historialCredenciales(db, suspendido.id).map((c) => c.estado)).toEqual(['revocada']);
    expect(puedeEmitir(db, suspendido.id, ENERO)).toMatchObject({ permitido: false, cid: null });
    expect(puedeEmitir(db, activo.id, ENERO).permitido).toBe(true);
  });
});

describe('tarea programada', () => {
  it('el primer arranque solo anota la línea base y no reinicia', async () => {
    const { id, cid } = await altaConTelefono('7000000010');
    expect(aplicarReseteoSiCorresponde(db, EN_HORARIO)).toEqual({ accion: 'linea_base', trimestre: '2026-T4' });
    expect(puedeEmitir(db, id, EN_HORARIO).cid).toBe(cid);
  });

  it('reinicia una sola vez al entrar en un trimestre nuevo', async () => {
    const { id, cid } = await altaConTelefono('7000000011');
    aplicarReseteoSiCorresponde(db, EN_HORARIO);
    expect(aplicarReseteoSiCorresponde(db, new Date('2026-12-31T10:00:00-05:00')).accion).toBe('nada');
    expect(aplicarReseteoSiCorresponde(db, ENERO)).toEqual({ accion: 'reseteo', trimestre: '2027-T1', cantidad: 1 });
    const nuevo = puedeEmitir(db, id, ENERO).cid;
    expect(nuevo).not.toBe(cid);
    // Correrla de nuevo en el mismo trimestre no vuelve a cambiar el cid.
    expect(aplicarReseteoSiCorresponde(db, new Date(ENERO.getTime() + 6 * 3600_000)).accion).toBe('nada');
    expect(puedeEmitir(db, id, ENERO).cid).toBe(nuevo);
  });

  it('el registro de reseteos es de solo agregar', async () => {
    aplicarReseteoSiCorresponde(db, EN_HORARIO);
    expect(() => db.prepare('DELETE FROM reseteos_cid').run()).toThrow(/solo agregar/);
  });
});
