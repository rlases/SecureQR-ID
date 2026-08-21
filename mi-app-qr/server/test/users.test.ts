import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { verifyPassword } from '../src/auth/passwords.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-users.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;

async function loginAsAdmin(agent: ReturnType<typeof request.agent>) {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
}

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

describe('POST /api/users', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ username: 'nuevo1', role: 'operador' });
    expect(res.status).toBe(401);
  });

  it('rechaza si el usuario en sesión no es admin', async () => {
    // Flujo completo, sin atajos: se crea el operador de verdad vía la API (como
    // admin), y se usa su contraseña generada real para loguearlo — así el propio
    // ciclo de creación de usuarios queda ejercitado dentro del test de autorización.
    const adminAgent = request.agent(app);
    await loginAsAdmin(adminAgent);

    const createRes = await adminAgent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });
    const { generatedPassword } = createRes.body;

    const operadorAgent = request.agent(app);
    await operadorAgent
      .post('/api/auth/login')
      .send({ username: 'operador1', password: generatedPassword });

    const res = await operadorAgent
      .post('/api/users')
      .send({ username: 'otro-mas', role: 'operador' });

    expect(res.status).toBe(403);
  });

  it('crea un usuario con contraseña generada por el servidor', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    const res = await agent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('operador1');
    expect(res.body.user.role).toBe('operador');
    expect(res.body.user.cargo).toBe('vigilancia');
    expect(typeof res.body.generatedPassword).toBe('string');
    expect(res.body.generatedPassword.length).toBeGreaterThanOrEqual(10);

    const row = db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get('operador1') as { password_hash: string };
    expect(await verifyPassword(res.body.generatedPassword, row.password_hash)).toBe(true);
  });

  it('rechaza un username duplicado con 409, no con un error crudo de SQLite', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    await agent.post('/api/users').send({ username: 'duplicado', role: 'operador' });
    const res = await agent.post('/api/users').send({ username: 'duplicado', role: 'operador' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('rechaza un role inválido', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    const res = await agent.post('/api/users').send({ username: 'malrol', role: 'superadmin' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/users', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lista los usuarios sin exponer password_hash', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);
    await agent.post('/api/users').send({ username: 'operador2', role: 'operador' });

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2); // admin sembrado + operador2
    for (const user of res.body.users) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
    }
  });
});
