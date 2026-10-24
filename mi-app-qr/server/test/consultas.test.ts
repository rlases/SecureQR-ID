import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase } from '../src/estamentos/config.js';
import { registrarTitular } from '../src/titulares/repository.js';
import { generateCid } from '../src/titulares/identificadores.js';

const TEST_DB_PATH = './data/test-consultas.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let admin: ReturnType<typeof request.agent>;
let cid: string;
let titularId: number;

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
  const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  const estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
  const alta = registrarTitular(
    db,
    { nombre: 'Titular Sintético', documento: '5000000001', correo: 't@ejemplo.test', estamentoId: estudiante },
    new Date()
  );
  cid = alta.cid!;
  titularId = alta.titular.id;
});

afterEach(() => {
  db.close();
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + sufijo)) fs.unlinkSync(TEST_DB_PATH + sufijo);
  }
});

async function operador() {
  const creado = await admin.post('/api/users').send({ username: 'op1', role: 'operador' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'op1', password: creado.body.generatedPassword });
  return agent;
}

describe('consulta cid → persona', () => {
  it('un admin ve a quién pertenece un cid y la consulta queda registrada', async () => {
    const res = await admin
      .post('/api/titulares/consultas')
      .send({ cids: [cid], motivo: 'Revisión de la bitácora del lunes' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.resultados).toEqual([
      expect.objectContaining({
        cid,
        encontrado: true,
        anonimizado: false,
        titularId,
        nombre: 'Titular Sintético',
        documento: '5000000001',
        estamento: 'Estudiante',
        estadoCredencial: 'vigente',
      }),
    ]);
    const { consultas } = (await admin.get('/api/titulares/consultas')).body;
    expect(consultas).toEqual([
      expect.objectContaining({
        usuario: 'admin',
        cid,
        encontrado: true,
        motivo: 'Revisión de la bitácora del lunes',
      }),
    ]);
    expect(Number.isNaN(Date.parse(consultas[0].en))).toBe(false);
  });

  it('también registra la búsqueda de un cid que no existe o no es válido', async () => {
    const otro = generateCid();
    const res = await admin.post('/api/titulares/consultas').send({ cids: [otro, 'no-es-un-cid'] });
    expect(res.body.resultados).toEqual([
      { cid: otro, encontrado: false },
      { cid: 'no-es-un-cid', encontrado: false },
    ]);
    const { consultas } = (await admin.get('/api/titulares/consultas')).body;
    expect(consultas.map((c: { cid: string }) => c.cid).sort()).toEqual([otro, 'no-es-un-cid'].sort());
  });

  it('resuelve un cid ya reemplazado, para auditar eventos antiguos', async () => {
    db.prepare(
      "UPDATE credenciales SET estado = 'reemplazada', vigente_hasta = ? WHERE cid = ?"
    ).run(new Date().toISOString(), cid);
    const res = await admin.post('/api/titulares/consultas').send({ cids: [cid] });
    expect(res.body.resultados[0]).toMatchObject({ encontrado: true, estadoCredencial: 'reemplazada' });
  });

  it('una consulta por lote registra cada cid una vez', async () => {
    const res = await admin.post('/api/titulares/consultas').send({ cids: [cid, cid, ` ${cid} `] });
    expect(res.body.resultados).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM consultas_cid').get()).toEqual({ n: 1 });
  });

  it('limita el tamaño del lote', async () => {
    const muchos = Array.from({ length: 201 }, () => generateCid());
    expect((await admin.post('/api/titulares/consultas').send({ cids: muchos })).status).toBe(400);
    expect((await admin.post('/api/titulares/consultas').send({ cids: [] })).status).toBe(400);
  });
});

describe('autorización', () => {
  it('un operador no puede consultar ni ver el registro, y su intento no revela nada', async () => {
    const op = await operador();
    const res = await op.post('/api/titulares/consultas').send({ cids: [cid] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Titular Sintético');
    expect((await op.get('/api/titulares/consultas')).status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM consultas_cid').get()).toEqual({ n: 0 });
  });

  it('sin sesión responde 401', async () => {
    expect((await request(app).post('/api/titulares/consultas').send({ cids: [cid] })).status).toBe(401);
  });

  it('el teléfono del titular tampoco puede consultar', async () => {
    const telefono = await request(app).post('/api/portal/alta').send({
      nombre: 'Otro Titular',
      documento: '5000000002',
      correo: 'o@ejemplo.test',
      estamentoId: (db.prepare('SELECT id FROM estamentos').get() as { id: number }).id,
      autorizaDatos: true,
    });
    const cookie = (telefono.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const res = await request(app).post('/api/titulares/consultas').set('Cookie', cookie).send({ cids: [cid] });
    expect(res.status).toBe(401);
  });

  it('el registro de consultas es de solo agregar', async () => {
    await admin.post('/api/titulares/consultas').send({ cids: [cid] });
    expect(() => db.prepare('DELETE FROM consultas_cid').run()).toThrow(/solo agregar/);
    expect(() => db.prepare('UPDATE consultas_cid SET cid = ?').run(generateCid())).toThrow(/solo agregar/);
  });
});
