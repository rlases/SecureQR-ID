import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-registros.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('POST /api/registros', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1234567890', rol: 'estudiante', tipo: 'entrada' });

    expect(res.status).toBe(401);
  });

  it('crea un registro con sesión válida', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1234567890', rol: 'estudiante', tipo: 'entrada' });

    expect(res.status).toBe(201);
    expect(res.body.registro.nombre).toBe('Ana Ríos');
    expect(res.body.registro.id).toBeDefined();
  });

  it('rechaza un cuerpo inválido', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent.post('/api/registros').send({ nombre: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/registros', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app).get('/api/registros');
    expect(res.status).toBe(401);
  });

  it('devuelve los registros creados, más reciente primero', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    await agent
      .post('/api/registros')
      .send({ nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada' });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(2);
    expect(res.body.registros[0].nombre).toBe('Luis Gómez');
  });

  it('después de corregir, ya no incluye la fila original, solo la corrección', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba la tilde',
      });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(1);
    expect(res.body.registros[0].nombre).toBe('Ana Ríos');
  });

  it('una cadena de dos correcciones muestra solo la más reciente', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const primeraCorreccion = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'tilde',
      });
    const primeraCorreccionId = primeraCorreccion.body.registro.id;

    await agent
      .post(`/api/registros/${primeraCorreccionId}/correcciones`)
      .send({
        nombre: 'Ana Ríos Gómez',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'apellido',
      });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(1);
    expect(res.body.registros[0].nombre).toBe('Ana Ríos Gómez');
  });
});

describe('GET /api/registros/:id/historial', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app).get('/api/registros/1/historial');
    expect(res.status).toBe(401);
  });

  it('rechaza un id inválido y responde 404 para uno inexistente', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const invalidRes = await agent.get('/api/registros/abc/historial');
    const missingRes = await agent.get('/api/registros/9999/historial');

    expect(invalidRes.status).toBe(400);
    expect(missingRes.status).toBe(404);
  });

  it('devuelve la cadena completa desde el original hasta la versión solicitada', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const originalRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'Investigadora visitante', tipo: 'entrada' });
    const originalId = originalRes.body.registro.id;

    const firstCorrectionRes = await agent
      .post(`/api/registros/${originalId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'Investigadora visitante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba la tilde',
      });
    const firstCorrectionId = firstCorrectionRes.body.registro.id;

    const secondCorrectionRes = await agent
      .post(`/api/registros/${firstCorrectionId}/correcciones`)
      .send({
        nombre: 'Ana Ríos Gómez',
        documento: '1',
        rol: 'Investigadora visitante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba el segundo apellido',
      });
    const secondCorrectionId = secondCorrectionRes.body.registro.id;

    const res = await agent.get(`/api/registros/${secondCorrectionId}/historial`);

    expect(res.status).toBe(200);
    expect(res.body.historial.map((registro: { id: number }) => registro.id)).toEqual([
      originalId,
      firstCorrectionId,
      secondCorrectionId,
    ]);
    expect(res.body.historial.map((registro: { motivo: string | null }) => registro.motivo)).toEqual([
      null,
      'faltaba la tilde',
      'faltaba el segundo apellido',
    ]);
    expect(res.body.historial[2].rol).toBe('Investigadora visitante');
  });

  it('permite consultar el historial a un operador sin permitirle corregir', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    const registroRes = await adminAgent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'Recepción', tipo: 'entrada' });

    const userRes = await adminAgent
      .post('/api/users')
      .send({ username: 'operador-historial', role: 'operador', cargo: 'Recepción' });
    const operatorAgent = request.agent(app);
    await operatorAgent
      .post('/api/auth/login')
      .send({ username: 'operador-historial', password: userRes.body.generatedPassword });

    const historyRes = await operatorAgent.get(`/api/registros/${registroRes.body.registro.id}/historial`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.historial).toHaveLength(1);
  });

  it('rechaza una cadena cíclica en lugar de entrar en un bucle', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    const originalRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'Recepción', tipo: 'entrada' });
    const originalId = originalRes.body.registro.id;
    const correctionRes = await agent
      .post(`/api/registros/${originalId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'Recepción',
        tipo: 'salida',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'tipo incorrecto',
      });
    const correctionId = correctionRes.body.registro.id;
    db.prepare('UPDATE registros SET corrige_registro_id = ?, motivo = ? WHERE id = ?')
      .run(correctionId, 'ciclo sintético', originalId);

    const res = await agent.get(`/api/registros/${correctionId}/historial`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cadena de correcciones inconsistente');
  });

  it('rechaza una cadena con una referencia anterior inexistente', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    const originalRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'Recepción', tipo: 'entrada' });
    const originalId = originalRes.body.registro.id;

    db.pragma('foreign_keys = OFF');
    db.prepare('UPDATE registros SET corrige_registro_id = ?, motivo = ? WHERE id = ?')
      .run(9999, 'referencia rota sintética', originalId);
    db.pragma('foreign_keys = ON');

    const res = await agent.get(`/api/registros/${originalId}/historial`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cadena de correcciones inconsistente');
  });
});

describe('POST /api/registros/:id/correcciones', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/registros/1/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(401);
  });

  it('rechaza si el usuario en sesión no es admin', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await adminAgent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const createOperadorRes = await adminAgent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador' });
    const { generatedPassword } = createOperadorRes.body;

    const operadorAgent = request.agent(app);
    await operadorAgent
      .post('/api/auth/login')
      .send({ username: 'operador1', password: generatedPassword });

    const res = await operadorAgent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'x',
      });

    expect(res.status).toBe(403);
  });

  it('rechaza un id no numérico con 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros/abc/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(400);
  });

  it('rechaza un cuerpo inválido con 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const res = await agent.post(`/api/registros/${registroId}/correcciones`).send({ nombre: '' });
    expect(res.status).toBe(400);
  });

  it('rechaza un id inexistente con 404', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros/9999/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(404);
  });

  it('corrige un registro y lo marca con corrigeRegistroId y motivo', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const res = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba la tilde en el nombre',
      });

    expect(res.status).toBe(201);
    expect(res.body.registro.nombre).toBe('Ana Ríos');
    expect(res.body.registro.corrigeRegistroId).toBe(registroId);
    expect(res.body.registro.motivo).toBe('faltaba la tilde en el nombre');
  });

  it('rechaza corregir un registro que ya tiene una corrección más reciente, con 409', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'primera corrección',
      });

    const res = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos G.',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'segunda corrección sobre el original',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('permite corregir una corrección ya hecha (encadenar)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const primeraCorreccion = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'primera corrección',
      });
    const primeraCorreccionId = primeraCorreccion.body.registro.id;

    const res = await agent
      .post(`/api/registros/${primeraCorreccionId}/correcciones`)
      .send({
        nombre: 'Ana Ríos Gómez',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'segunda corrección, apellido',
      });

    expect(res.status).toBe(201);
    expect(res.body.registro.corrigeRegistroId).toBe(primeraCorreccionId);
  });
});
