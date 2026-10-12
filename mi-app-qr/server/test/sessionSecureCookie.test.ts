import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import https from 'node:https';
import request from 'supertest';
import selfsigned from 'selfsigned';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import type Database from 'better-sqlite3';

// Certificado de prueba con SAN para localhost/127.0.0.1 — supertest conecta
// por 127.0.0.1, y sin el SAN correcto el handshake TLS falla antes de llegar
// a la app (ver ERR_TLS_CERT_ALTNAME_INVALID).
function testCertificate() {
  return selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 1,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });
}

const TEST_DB_PATH = './data/test-secure-cookie.sqlite';
let db: Database.Database;

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('cookie de sesión y transporte (ADR-0008)', () => {
  it('no marca la cookie Secure por defecto (HTTP plano, sin Electron)', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie.toLowerCase()).not.toContain('secure');
  });

  it('marca la cookie Secure cuando el servidor se sirve por HTTPS', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret', secureCookies: true });
    const pems = testCertificate();
    const server = https.createServer({ cert: pems.cert, key: pems.private }, app);

    const res = await request(server)
      .post('/api/auth/login')
      .ca(pems.cert)
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie.toLowerCase()).toContain('secure');
  });
});
