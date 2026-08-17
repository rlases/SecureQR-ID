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
});
