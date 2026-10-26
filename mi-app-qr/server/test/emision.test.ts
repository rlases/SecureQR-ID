import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase, reemplazarVentanas } from '../src/estamentos/config.js';
import { revocarCredencial } from '../src/titulares/gestion.js';
import { resetearCids } from '../src/titulares/reseteo.js';
import {
  EmisorNoDisponibleError,
  crearClienteEmisor,
  leerSecretoEmisor,
  validarUrlEmisor,
} from '../src/emision/clienteEmisor.js';
import { LimiteDispositivo, VENTANA_MS } from '../src/emision/limiteDispositivo.js';

// Emisión del QR del titular (issue #85) contra un doble HTTP del servicio local de
// issuer/ que sigue su contrato (issuer/README.md). Datos sintéticos (SECURITY.md).

const SECRETO = 'secreto-compartido-sintetico-de-al-menos-32-bytes';
let testDirectory: string;
let db: Database.Database;
let doble: http.Server;
let urlDoble: string;
let pedidos: { authorization?: string; cuerpo: unknown }[];
let respuestaDoble: { status: number; body: unknown; demoraMs?: number };
let estudiante: number;
let adminId: number;

function iniciarDoble(): Promise<void> {
  pedidos = [];
  respuestaDoble = { status: 200, body: null };
  doble = http.createServer((req, res) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => {
      const cuerpo = datos ? JSON.parse(datos) : null;
      pedidos.push({ authorization: req.headers.authorization, cuerpo });
      const responder = () => {
        if (req.method !== 'POST' || req.url !== '/v1/tokens') {
          res.writeHead(404).end();
          return;
        }
        if (req.headers.authorization !== `Bearer ${SECRETO}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"Unauthorized"}');
          return;
        }
        const body =
          respuestaDoble.body ?? { token: `SQRID1.token-${pedidos.length}.firma`, expires_in: 60 };
        res.writeHead(respuestaDoble.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (respuestaDoble.demoraMs) setTimeout(responder, respuestaDoble.demoraMs);
      else responder();
    });
  });
  return new Promise((resolve) =>
    doble.listen(0, '127.0.0.1', () => {
      urlDoble = `http://127.0.0.1:${(doble.address() as AddressInfo).port}`;
      resolve();
    })
  );
}

function app(opciones: { emisor?: boolean; maxTokensPorMinuto?: number; secreto?: string } = {}) {
  return createApp({
    db,
    sessionSecret: 'test-secret',
    emisor:
      opciones.emisor === false
        ? undefined
        : crearClienteEmisor({ url: urlDoble, secreto: opciones.secreto ?? SECRETO }),
    timeZone: 'America/Bogota',
    maxTokensPorMinuto: opciones.maxTokensPorMinuto,
  });
}

/** Alta por el portal: devuelve un agente con la cookie del teléfono vinculado. */
async function telefonoVinculado(aplicacion: ReturnType<typeof createApp>, documento: string) {
  const telefono = request.agent(aplicacion);
  const res = await telefono.post('/api/portal/alta').send({
    nombre: 'Titular Sintético',
    documento,
    correo: 't@ejemplo.test',
    estamentoId: estudiante,
    autorizaDatos: true,
  });
  expect(res.status).toBe(201);
  const titularId = (db.prepare('SELECT id FROM titulares WHERE documento = ?').get(documento) as { id: number }).id;
  return { telefono, titularId };
}

function cidVigente(titularId: number): string {
  return (
    db.prepare("SELECT cid FROM credenciales WHERE titular_id = ? AND estado = 'vigente'").get(titularId) as {
      cid: string;
    }
  ).cid;
}

/** Ventana de ingreso que cubre todo el día de hoy, en la hora de la sede. */
function ventanaTodoElDia() {
  reemplazarVentanas(
    db,
    adminId,
    estudiante,
    [1, 2, 3, 4, 5, 6, 7].map((d) => ({ diaSemana: d, inicio: '00:00', fin: '24:00' })),
    new Date()
  );
}

beforeEach(async () => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-emision-'));
  db = openDatabase(path.join(testDirectory, 'test.sqlite'));
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
  await iniciarDoble();
});

afterEach(async () => {
  await new Promise((resolve) => doble.close(resolve));
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('cliente del servicio de emisión', () => {
  it('pide el token con el secreto y solo el cid', async () => {
    const cliente = crearClienteEmisor({ url: urlDoble, secreto: SECRETO });
    const token = await cliente.pedirToken('AAAAAAAAAAAAAAAAAAAAAA');
    expect(token).toEqual({ token: 'SQRID1.token-1.firma', expiresIn: 60 });
    expect(pedidos).toEqual([{ authorization: `Bearer ${SECRETO}`, cuerpo: { cid: 'AAAAAAAAAAAAAAAAAAAAAA' } }]);
  });

  it('solo acepta el bucle local', () => {
    expect(() => validarUrlEmisor('http://127.0.0.1:8765')).not.toThrow();
    expect(() => validarUrlEmisor('http://[::1]:8765')).not.toThrow();
    for (const url of ['http://10.0.0.5:8765', 'http://localhost:8765', 'https://127.0.0.1:8765', 'nada']) {
      expect(() => validarUrlEmisor(url)).toThrow();
    }
  });

  it('un rechazo o una respuesta inválida es un error sin detalles', async () => {
    const malo = crearClienteEmisor({ url: urlDoble, secreto: 'otro-secreto-sintetico-tambien-largo-32b' });
    await expect(malo.pedirToken('AAAAAAAAAAAAAAAAAAAAAA')).rejects.toThrow(EmisorNoDisponibleError);
    respuestaDoble = { status: 200, body: { token: 42 } };
    const cliente = crearClienteEmisor({ url: urlDoble, secreto: SECRETO });
    await expect(cliente.pedirToken('AAAAAAAAAAAAAAAAAAAAAA')).rejects.toThrow(EmisorNoDisponibleError);
  });

  it('un servicio caído es un error de emisión', async () => {
    await new Promise((resolve) => doble.close(resolve));
    const cliente = crearClienteEmisor({ url: urlDoble, secreto: SECRETO });
    await expect(cliente.pedirToken('AAAAAAAAAAAAAAAAAAAAAA')).rejects.toThrow(EmisorNoDisponibleError);
    await iniciarDoble();
  });

  it('lee el secreto del archivo de generate-secret, sin el salto de línea', () => {
    const ruta = path.join(testDirectory, 'issuer.secret');
    fs.writeFileSync(ruta, `${SECRETO}\n`);
    expect(leerSecretoEmisor(ruta)).toBe(SECRETO);
    fs.writeFileSync(ruta, 'corto\n');
    expect(() => leerSecretoEmisor(ruta)).toThrow();
  });
});

describe('POST /api/portal/qr', () => {
  it('sin teléfono vinculado no hay QR', async () => {
    ventanaTodoElDia();
    expect((await request(app()).post('/api/portal/qr')).status).toBe(401);
    expect(pedidos).toHaveLength(0);
  });

  it('pide el token con el cid vigente y dice cuándo renovar', async () => {
    ventanaTodoElDia();
    const aplicacion = app();
    const { telefono, titularId } = await telefonoVinculado(aplicacion, '8100000001');
    const res = await telefono.post('/api/portal/qr');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.token).toBe('SQRID1.token-1.firma');
    expect(res.body.renovarEnSegundos).toBe(45);
    expect(new Date(res.body.expiraEn).getTime()).toBeGreaterThan(Date.now() + 55_000);
    expect(pedidos[0].cuerpo).toEqual({ cid: cidVigente(titularId) });
  }, 30_000);

  it('fuera del horario no pide token y lo explica', async () => {
    // Un estamento sin ventanas falla cerrado: no recibe QR.
    const aplicacion = app();
    const { telefono } = await telefonoVinculado(aplicacion, '8100000002');
    const res = await telefono.post('/api/portal/qr');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ motivo: 'sin_ventanas', mensaje: expect.stringContaining('horario') });
    expect(pedidos).toHaveLength(0);
  }, 30_000);

  it('con ventanas solo otro día, responde fuera de horario', async () => {
    const dias = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>;
    const hoy = dias[new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short' }).format(new Date())];
    reemplazarVentanas(db, adminId, estudiante, [{ diaSemana: (hoy % 7) + 1, inicio: '00:00', fin: '24:00' }], new Date());
    const aplicacion = app();
    const { telefono } = await telefonoVinculado(aplicacion, '8100000011');
    const res = await telefono.post('/api/portal/qr');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ motivo: 'fuera_de_ventana', mensaje: expect.stringContaining('fuera de tu horario') });
    expect(pedidos).toHaveLength(0);
  }, 30_000);

  it('con un día cerrado por excepción tampoco', async () => {
    ventanaTodoElDia();
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    db.prepare(
      "INSERT INTO excepciones_calendario (fecha_desde, fecha_hasta, tipo, estamento_id, descripcion) VALUES (?, ?, 'cierre', NULL, 'Festivo')"
    ).run(hoy, hoy);
    const aplicacion = app();
    const { telefono } = await telefonoVinculado(aplicacion, '8100000003');
    const res = await telefono.post('/api/portal/qr');
    expect(res.status).toBe(403);
    expect(res.body.motivo).toBe('dia_cerrado');
  }, 30_000);

  it('una credencial revocada deja de recibir tokens en ese momento', async () => {
    ventanaTodoElDia();
    const aplicacion = app();
    const { telefono, titularId } = await telefonoVinculado(aplicacion, '8100000004');
    expect((await telefono.post('/api/portal/qr')).status).toBe(200);
    revocarCredencial(db, adminId, titularId, 'teléfono robado', new Date());
    const res = await telefono.post('/api/portal/qr');
    expect(res.status).toBe(403);
    expect(res.body.motivo).toBe('titular_no_activo');
    expect(pedidos).toHaveLength(1);
  }, 30_000);

  it('tras el reseteo trimestral pide el token con el cid nuevo, sin volver a vincular', async () => {
    ventanaTodoElDia();
    const aplicacion = app();
    const { telefono, titularId } = await telefonoVinculado(aplicacion, '8100000005');
    await telefono.post('/api/portal/qr');
    const anterior = cidVigente(titularId);
    resetearCids(db, new Date());
    await telefono.post('/api/portal/qr');
    expect(pedidos[1].cuerpo).toEqual({ cid: cidVigente(titularId) });
    expect(cidVigente(titularId)).not.toBe(anterior);
  }, 30_000);

  it('limita los tokens por dispositivo', async () => {
    ventanaTodoElDia();
    const aplicacion = app({ maxTokensPorMinuto: 2 });
    const { telefono } = await telefonoVinculado(aplicacion, '8100000006');
    const otro = await telefonoVinculado(aplicacion, '8100000007');
    expect((await telefono.post('/api/portal/qr')).status).toBe(200);
    expect((await telefono.post('/api/portal/qr')).status).toBe(200);
    expect((await telefono.post('/api/portal/qr')).status).toBe(429);
    // Otro teléfono tiene su propio cupo.
    expect((await otro.telefono.post('/api/portal/qr')).status).toBe(200);
    expect(pedidos).toHaveLength(3);
  }, 30_000);

  it('sin servicio configurado o con el servicio caído responde 503 sin detalles', async () => {
    ventanaTodoElDia();
    const sinEmisor = app({ emisor: false });
    const { telefono } = await telefonoVinculado(sinEmisor, '8100000008');
    expect((await telefono.post('/api/portal/qr')).status).toBe(503);
    respuestaDoble = { status: 500, body: { error: 'Internal Server Error' } };
    const conEmisor = app();
    const otro = await telefonoVinculado(conEmisor, '8100000009');
    const res = await otro.telefono.post('/api/portal/qr');
    expect(res.status).toBe(503);
    expect(Object.keys(res.body)).toEqual(['error']);
  }, 30_000);

  it('renovación: cada pedido trae un token nuevo para el mismo cid', async () => {
    ventanaTodoElDia();
    const aplicacion = app();
    const { telefono, titularId } = await telefonoVinculado(aplicacion, '8100000010');
    const tokens = [];
    for (let i = 0; i < 3; i++) tokens.push((await telefono.post('/api/portal/qr')).body.token);
    expect(new Set(tokens).size).toBe(3);
    const cid = cidVigente(titularId);
    expect(pedidos.every((p) => (p.cuerpo as { cid: string }).cid === cid)).toBe(true);
  }, 30_000);
});

describe('límite por dispositivo', () => {
  it('libera el cupo al pasar la ventana', () => {
    const limite = new LimiteDispositivo(1);
    expect(limite.reservar(1, 0)).toBe(true);
    expect(limite.reservar(1, VENTANA_MS - 1)).toBe(false);
    expect(limite.reservar(1, VENTANA_MS + 1)).toBe(true);
  });
});
