import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase, reemplazarVentanas } from '../src/estamentos/config.js';
import { crearClienteEmisor, leerSecretoEmisor } from '../src/emision/clienteEmisor.js';

// De punta a punta (issue #85): portal del titular → mi-app-qr/server → servicio local
// real de issuer/ (`secureqr-issuer serve`), por HTTP y con el secreto compartido real.
// Comprueba el alta, el QR y su renovación con el cid vigente del titular.

const url = process.env.ISSUER_E2E_URL;
const archivoSecreto = process.env.ISSUER_E2E_SECRET_FILE;
// En CI la prueba no puede saltarse en silencio: sin el servicio, falla.
if (process.env.CI && (!url || !archivoSecreto)) {
  throw new Error('ISSUER_E2E_URL e ISSUER_E2E_SECRET_FILE son obligatorias en CI.');
}

describe.skipIf(!url || !archivoSecreto)('emisión contra el servicio real de issuer/', () => {
  let dir: string;
  let db: Database.Database;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-e2e-'));
    db = openDatabase(path.join(dir, 'e2e.sqlite'));
    runMigrations(db);
    await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('el teléfono vinculado recibe un QR firmado con su cid y lo renueva', async () => {
    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
    elegirBase(db, adminId, estudiante, new Date());
    reemplazarVentanas(
      db,
      adminId,
      estudiante,
      [1, 2, 3, 4, 5, 6, 7].map((d) => ({ diaSemana: d, inicio: '00:00', fin: '24:00' })),
      new Date()
    );
    const app = createApp({
      db,
      sessionSecret: 'e2e-secret',
      emisor: crearClienteEmisor({ url: url!, secreto: leerSecretoEmisor(archivoSecreto!) }),
      timeZone: 'America/Bogota',
    });

    const telefono = request.agent(app);
    const alta = await telefono.post('/api/portal/alta').send({
      nombre: 'Titular Sintético',
      documento: '9100000001',
      correo: 't@ejemplo.test',
      estamentoId: estudiante,
      autorizaDatos: true,
    });
    expect(alta.status).toBe(201);
    const cid = (
      db.prepare("SELECT cid FROM credenciales WHERE estado = 'vigente'").get() as { cid: string }
    ).cid;

    const primero = await telefono.post('/api/portal/qr');
    expect(primero.status).toBe(200);
    expect(primero.headers['cache-control']).toBe('no-store');
    // SQRID/1: CBOR determinista en Base64url sin relleno; el cid viaja como texto.
    expect(primero.body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(primero.body.token, 'base64url').includes(Buffer.from(cid, 'ascii'))).toBe(true);
    expect(primero.body.renovarEnSegundos).toBeGreaterThan(0);

    // La renovación trae otro token (nonce nuevo) para el mismo cid.
    const segundo = await telefono.post('/api/portal/qr');
    expect(segundo.status).toBe(200);
    expect(segundo.body.token).not.toBe(primero.body.token);
    expect(Buffer.from(segundo.body.token, 'base64url').includes(Buffer.from(cid, 'ascii'))).toBe(true);
  });
});
