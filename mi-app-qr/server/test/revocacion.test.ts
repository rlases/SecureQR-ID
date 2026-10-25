import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase, reemplazarVentanas } from '../src/estamentos/config.js';
import { registrarTitular } from '../src/titulares/repository.js';
import { isCanonicalCid } from '../src/titulares/identificadores.js';
import { cidsRevocados, exportarRevocados, puedeEmitir } from '../src/titulares/gestion.js';
import { titularRefForCid, verifyAsignaciones } from '../src/titulares/asignaciones.js';

const TEST_DB_PATH = './data/test-revocacion.sqlite';
// Lunes 2026-10-26 a las 10:00 en Bogotá: dentro de la ventana de prueba.
const EN_HORARIO = new Date('2026-10-26T10:00:00-05:00');
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let admin: ReturnType<typeof request.agent>;
let adminId: number;
let estudiante: number;
let exportDir: string;

function alta(documento: string) {
  return registrarTitular(
    db,
    { nombre: 'Titular Sintético', documento, correo: 't@ejemplo.test', estamentoId: estudiante },
    new Date()
  );
}

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revocados-'));
  app = createApp({
    db,
    sessionSecret: 'test-secret',
    revocadosExportPath: path.join(exportDir, 'revocados.txt'),
  });
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
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
  fs.rmSync(exportDir, { recursive: true, force: true });
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + sufijo)) fs.unlinkSync(TEST_DB_PATH + sufijo);
  }
});

describe('puerta de emisión', () => {
  it('autoriza con el cid vigente dentro del horario', () => {
    const { titular, cid } = alta('6000000001');
    expect(puedeEmitir(db, titular.id, EN_HORARIO)).toEqual({
      permitido: true,
      motivo: 'dentro_de_ventana',
      cid,
    });
  });

  it('fuera del horario no autoriza aunque la credencial esté vigente', () => {
    const { titular } = alta('6000000002');
    const domingo = new Date('2026-10-25T10:00:00-05:00');
    expect(puedeEmitir(db, titular.id, domingo)).toMatchObject({ permitido: false, cid: null });
  });
});

describe('revocación inmediata', () => {
  it('tras revocar, ninguna solicitud de token prospera y el titular queda suspendido', async () => {
    const { titular, cid } = alta('6000000010');
    const res = await admin
      .post(`/api/titulares/${titular.id}/revocar`)
      .send({ motivo: 'Teléfono reportado como robado' });
    expect(res.status).toBe(200);
    for (const momento of [EN_HORARIO, new Date(EN_HORARIO.getTime() + 60_000)]) {
      expect(puedeEmitir(db, titular.id, momento)).toEqual({
        permitido: false,
        motivo: 'titular_no_activo',
        cid: null,
      });
    }
    const credencial = db.prepare('SELECT estado, vigente_hasta FROM credenciales WHERE cid = ?').get(cid) as {
      estado: string;
      vigente_hasta: string | null;
    };
    expect(credencial.estado).toBe('revocada');
    expect(credencial.vigente_hasta).not.toBeNull();
    // El portal del teléfono lo ve como suspendido.
    const lista = (await admin.get('/api/titulares').query({ estado: 'suspendido' })).body.titulares;
    expect(lista.map((t: { id: number }) => t.id)).toEqual([titular.id]);
  });

  it('no revoca dos veces ni sin motivo', async () => {
    const { titular } = alta('6000000011');
    expect((await admin.post(`/api/titulares/${titular.id}/revocar`).send({})).status).toBe(400);
    await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Prueba' });
    expect((await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Prueba' })).status).toBe(409);
    expect((await admin.post('/api/titulares/9999/revocar').send({ motivo: 'Prueba' })).status).toBe(404);
  });

  it('desvincular el teléfono le quita el acceso al portal, sin revocar la credencial', async () => {
    const telefono = request.agent(app);
    await telefono.post('/api/portal/alta').send({
      nombre: 'Titular Sintético',
      documento: '6000000012',
      correo: 't@ejemplo.test',
      estamentoId: estudiante,
      autorizaDatos: true,
    });
    const titularId = (db.prepare("SELECT id FROM titulares WHERE documento = '6000000012'").get() as { id: number }).id;
    expect((await telefono.get('/api/portal/yo')).status).toBe(200);
    expect(
      (await admin.post(`/api/titulares/${titularId}/desvincular`).send({ motivo: 'Teléfono perdido' })).status
    ).toBe(200);
    expect((await telefono.get('/api/portal/yo')).status).toBe(401);
    expect(puedeEmitir(db, titularId, EN_HORARIO).permitido).toBe(true);
    expect(cidsRevocados(db)).toEqual([]);
  });

  it('reactivar da una credencial nueva y deja la revocada en la lista', async () => {
    const { titular, cid } = alta('6000000013');
    await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Prueba' });
    expect((await admin.post(`/api/titulares/${titular.id}/reactivar`).send({ motivo: 'Aclarado con el titular' })).status).toBe(200);
    const decision = puedeEmitir(db, titular.id, EN_HORARIO);
    expect(decision.permitido).toBe(true);
    expect(decision.cid).not.toBe(cid);
    expect(isCanonicalCid(decision.cid!)).toBe(true);
    expect(cidsRevocados(db)).toEqual([cid]);
    expect(titularRefForCid(db, decision.cid!)).toBe(titular.ref);
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('cada acción queda en el registro de cambios con su motivo', async () => {
    const { titular, cid } = alta('6000000014');
    await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Robo' });
    const [cambio] = (await admin.get('/api/estamentos/cambios')).body.cambios;
    expect(cambio).toMatchObject({
      usuario: 'admin',
      entidad: 'credencial',
      entidadId: titular.id,
      accion: 'revocar',
      valorAnterior: { estado: 'vigente' },
      valorNuevo: { estado: 'revocada', motivo: 'Robo' },
    });
  });

  it('el historial público no permite atribuir cid nuevos ni históricos sin consulta auditada', async () => {
    const { titular, cid } = alta('6000000098');
    await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Robo' });
    await admin.post(`/api/titulares/${titular.id}/reactivar`).send({ motivo: 'Resuelto' });
    const nuevo = db.prepare("SELECT cid FROM credenciales WHERE titular_id = ? AND estado = 'vigente'").get(titular.id) as { cid: string };
    const originales = JSON.stringify(db.prepare("SELECT * FROM cambios_configuracion WHERE accion IN ('revocar', 'reactivar')").all());
    expect(originales).not.toContain(cid);
    expect(originales).not.toContain(nuevo.cid);
    // Simula filas de versiones anteriores: se conservan append-only, pero se proyectan sin cid.
    db.prepare(`INSERT INTO cambios_configuracion (usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, en)
      VALUES (?, 'credencial', ?, 'revocar', ?, ?, ?)`).run(adminId, titular.id,
      JSON.stringify({ cid, estado: 'vigente' }), JSON.stringify({ cid, estado: 'revocada', motivo: 'Histórico' }), new Date().toISOString());
    const almacenado = db.prepare('SELECT * FROM cambios_configuracion ORDER BY id DESC LIMIT 1').get();
    const historial = await admin.get('/api/estamentos/cambios');
    expect(historial.status).toBe(200);
    expect(JSON.stringify(historial.body)).not.toContain(cid);
    expect(JSON.stringify(historial.body)).not.toContain(nuevo.cid);
    expect(historial.body.cambios[0]).toMatchObject({ entidadId: titular.id, valorNuevo: { estado: 'revocada', motivo: 'Histórico' } });
    expect(db.prepare('SELECT * FROM cambios_configuracion ORDER BY id DESC LIMIT 1').get()).toEqual(almacenado);
  });

  it('un operador no puede revocar ni exportar', async () => {
    const { titular } = alta('6000000015');
    const creado = await admin.post('/api/users').send({ username: 'op1', role: 'operador' });
    const op = request.agent(app);
    await op.post('/api/auth/login').send({ username: 'op1', password: creado.body.generatedPassword });
    expect((await op.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Prueba' })).status).toBe(403);
    expect((await op.get('/api/titulares/revocados.txt')).status).toBe(403);
    expect((await op.get('/api/titulares')).status).toBe(403);
    expect(puedeEmitir(db, titular.id, EN_HORARIO).permitido).toBe(true);
  });
});

describe('exportación de revocados', () => {
  it('el archivo contiene exactamente los cid revocados, uno por línea', async () => {
    const a = alta('6000000020');
    const b = alta('6000000021');
    alta('6000000022');
    await admin.post(`/api/titulares/${a.titular.id}/revocar`).send({ motivo: 'Prueba' });
    await admin.post(`/api/titulares/${b.titular.id}/revocar`).send({ motivo: 'Prueba' });
    const res = await admin.get('/api/titulares/revocados.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.headers['content-disposition']).toMatch(/revocados\.txt/);
    const cids = res.text.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(cids.sort()).toEqual([a.cid, b.cid].sort());
  });

  it('«exportar ahora» escribe el archivo configurado con reemplazo atómico', async () => {
    const { titular, cid } = alta('6000000023');
    await admin.post(`/api/titulares/${titular.id}/revocar`).send({ motivo: 'Prueba' });
    const res = await admin.post('/api/titulares/revocados/exportar');
    expect(res.body.cantidad).toBe(1);
    const contenido = fs.readFileSync(path.join(exportDir, 'revocados.txt'), 'utf8');
    expect(contenido.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([cid]);
    expect(fs.readdirSync(exportDir)).toEqual(['revocados.txt']);
  });

  it('una lista vacía también se exporta, para que el refirmado diario no falle', () => {
    const destino = path.join(exportDir, 'sub', 'revocados.txt');
    expect(exportarRevocados(db, destino, new Date())).toBe(0);
    expect(fs.readFileSync(destino, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([]);
  });

  it('sin ruta configurada, «exportar ahora» lo dice y la descarga sigue disponible', async () => {
    const sinRuta = createApp({ db, sessionSecret: 'test-secret' });
    const agent = request.agent(sinRuta);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    expect((await agent.post('/api/titulares/revocados/exportar')).status).toBe(409);
    expect((await agent.get('/api/titulares/revocados.txt')).status).toBe(200);
  });
});
