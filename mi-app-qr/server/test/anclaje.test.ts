import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { leerEstadoAnclaje } from '../src/anclaje/estado.js';

// Alerta de anclaje (#139). El archivo que aquí se escribe a mano es el que deja
// `evidence-log cycle --status-file` (evidence-log/tests cubre ese lado).
let dir: string;
let db: Database.Database;
const AHORA = new Date('2026-10-26T12:00:00.000Z');
const ahoraSeg = AHORA.getTime() / 1000;

function estado(campos: Record<string, unknown> = {}): string {
  const archivo = path.join(dir, `estado-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(
    archivo,
    JSON.stringify({
      pending_events: 3,
      oldest_pending_timestamp: ahoraSeg - 600,
      last_batch_id: 'ccav-pitalito-porteria-1:seq-000001-000040',
      last_anchored_at: ahoraSeg - 900,
      stale: false,
      written_at: ahoraSeg - 300,
      ...campos,
    })
  );
  return archivo;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-anclaje-'));
});

afterEach(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('leerEstadoAnclaje', () => {
  it('sin ruta configurada no alerta', () => {
    expect(leerEstadoAnclaje(undefined, AHORA)).toEqual({ estado: 'sin_configurar' });
  });

  it('un ciclo reciente y sin atraso está bien', () => {
    expect(leerEstadoAnclaje(estado(), AHORA)).toEqual({
      estado: 'ok',
      resumen: {
        eventosPendientes: 3,
        pendienteMasAntiguo: '2026-10-26T11:50:00.000Z',
        ultimoLote: 'ccav-pitalito-porteria-1:seq-000001-000040',
        ultimoAnclaje: '2026-10-26T11:45:00.000Z',
        escritoEn: '2026-10-26T11:55:00.000Z',
      },
    });
  });

  it('eventos sin anclar desde hace más de 2 horas: alerta', () => {
    const r = leerEstadoAnclaje(estado({ stale: true }), AHORA);
    expect(r).toMatchObject({ estado: 'alerta', detalle: expect.stringMatching(/sin anclar/) });
  });

  it('un archivo de más de 2 horas delata que el ciclo dejó de correr, aunque diga stale=false', () => {
    const r = leerEstadoAnclaje(estado({ written_at: ahoraSeg - 2 * 3600 - 1 }), AHORA);
    expect(r).toMatchObject({ estado: 'alerta', detalle: expect.stringMatching(/no ha escrito su estado/) });
    expect(leerEstadoAnclaje(estado({ written_at: ahoraSeg - 2 * 3600 }), AHORA).estado).toBe('ok');
  });

  it('sin archivo, ilegible o con otro formato: alerta, nunca «todo bien»', () => {
    expect(leerEstadoAnclaje(path.join(dir, 'no-existe.json'), AHORA)).toMatchObject({
      estado: 'alerta',
      detalle: expect.stringMatching(/no ha corrido nunca/),
    });
    const roto = path.join(dir, 'roto.json');
    fs.writeFileSync(roto, '{"pending_events":');
    expect(leerEstadoAnclaje(roto, AHORA).estado).toBe('alerta');
    for (const malo of [{ stale: 'no' }, { pending_events: -1 }, { written_at: null }, { last_batch_id: 7 }]) {
      expect(leerEstadoAnclaje(estado(malo), AHORA)).toMatchObject({ estado: 'alerta', resumen: null });
    }
  });
});

describe('GET /api/anclaje/estado', () => {
  async function agente(estadoPath?: string) {
    db = openDatabase(path.join(dir, 'test.sqlite'));
    runMigrations(db);
    await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
    const app = createApp({ db, sessionSecret: 'test-secret', anclajeEstadoPath: estadoPath });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    return { app, admin };
  }

  it('solo para admin y sin caché', async () => {
    const { app, admin } = await agente(estado({ stale: true }));
    expect((await request(app).get('/api/anclaje/estado')).status).toBe(401);
    const respuesta = await admin.get('/api/anclaje/estado');
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.body.estado).toBe('alerta');
  });

  it('sin configurar responde sin_configurar', async () => {
    const { admin } = await agente();
    expect((await admin.get('/api/anclaje/estado')).body).toEqual({ estado: 'sin_configurar' });
  });
});
