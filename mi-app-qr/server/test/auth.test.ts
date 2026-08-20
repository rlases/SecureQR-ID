import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-auth.sqlite';
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

describe('POST /api/auth/login', () => {
  it('acepta credenciales válidas y devuelve el usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rechaza una contraseña incorrecta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rechaza un usuario que no existe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nadie', password: 'lo-que-sea' });

    expect(res.status).toBe(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos consecutivos', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'incorrecta' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/bloqueada/i);
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve 401 sin sesión iniciada', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('devuelve el usuario actual con sesión válida', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
  });
});

describe('POST /api/auth/logout', () => {
  it('cierra la sesión y /me vuelve a devolver 401', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    await agent.post('/api/auth/logout').expect(200);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
