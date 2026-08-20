import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import { createSessionMiddleware } from '../src/auth/session.js';
import { requireAdmin } from '../src/auth/requireAdmin.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/passwords.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-require-admin.sqlite';
let db: Database.Database;

beforeEach(() => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware('test-secret'));
  app.locals.db = db;

  // Ruta de prueba mínima que solo existe para ejercitar el middleware.
  app.post('/login-como', express.json(), (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  app.get('/solo-admin', requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('requireAdmin', () => {
  it('rechaza con 401 si no hay sesión iniciada', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/solo-admin');
    expect(res.status).toBe(401);
  });

  it('rechaza con 403 si el usuario tiene sesión pero no es admin', async () => {
    const passwordHash = await hashPassword('clave-123');
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('operador1', passwordHash, 'operador');

    const app = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/login-como').send({ userId: result.lastInsertRowid });

    const res = await agent.get('/solo-admin');
    expect(res.status).toBe(403);
  });

  it('deja pasar si el usuario es admin', async () => {
    const passwordHash = await hashPassword('clave-123');
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin1', passwordHash, 'admin');

    const app = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/login-como').send({ userId: result.lastInsertRowid });

    const res = await agent.get('/solo-admin');
    expect(res.status).toBe(200);
  });
});
