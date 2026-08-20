import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = './data/test-static.sqlite';
const FAKE_CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const INDEX_HTML_MARKER = '<!doctype html><html><body>cliente de prueba</body></html>';

let db: Database.Database;
let createdDistForTest = false;

beforeAll(() => {
  // Solo crea un dist de prueba si el real no existe todavía (p. ej. en CI antes
  // de que Task 2 del plan del cliente haya corrido `npm run build`). Si ya existe
  // un build real, lo dejamos intacto y usamos su contenido real.
  if (!fs.existsSync(FAKE_CLIENT_DIST)) {
    fs.mkdirSync(FAKE_CLIENT_DIST, { recursive: true });
    fs.writeFileSync(path.join(FAKE_CLIENT_DIST, 'index.html'), INDEX_HTML_MARKER);
    createdDistForTest = true;
  }
});

afterAll(() => {
  if (createdDistForTest) {
    fs.rmSync(FAKE_CLIENT_DIST, { recursive: true, force: true });
  }
});

beforeEach(() => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('archivos estáticos del cliente', () => {
  it('sirve index.html en la raíz', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('sirve index.html también para una ruta del lado del cliente (fallback SPA)', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/registros-inexistente-en-el-servidor');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('NO intercepta rutas de /api — siguen respondiendo como API, no como HTML', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('una ruta de /api inexistente sigue devolviendo 404, no el HTML del cliente', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/api/esto-no-existe');
    expect(res.status).toBe(404);
  });
});
