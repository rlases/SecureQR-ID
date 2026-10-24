import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import selfsigned from 'selfsigned';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase } from '../src/estamentos/config.js';
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
} from '../src/portal/credencialesTitular.js';
import { MAX_FALLOS_POR_DOCUMENTO, MAX_FALLOS_POR_IP } from '../src/portal/limiteIntentos.js';

// Datos sintéticos (SECURITY.md).
let testDirectory: string;
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let estudiante: number;
let docente: number;

const datosAlta = (documento: string, cambios: object = {}) => ({
  nombre: 'Titular Sintético',
  documento,
  correo: 'titular@ejemplo.test',
  estamentoId: estudiante,
  autorizaDatos: true,
  ...cambios,
});

function cookieDe(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((c) => c.startsWith('sqrid_dispositivo='));
}

function prepararEstamentos(conBase = true) {
  const admin = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, admin, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  docente = crearEstamento(db, admin, { nombre: 'Docente', requiereConfirmacion: true }, new Date()).id;
  if (conBase) elegirBase(db, admin, estudiante, new Date());
}

beforeEach(async () => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-portal-'));
  db = openDatabase(path.join(testDirectory, 'test.sqlite'));
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
});

afterEach(() => {
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('código de recuperación', () => {
  it('tiene 80 bits en Base32, en cuatro grupos de cuatro', () => {
    const codigo = generateRecoveryCode();
    expect(codigo).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(generateRecoveryCode()).not.toBe(codigo);
  });

  it('se normaliza sin guiones, espacios ni minúsculas', () => {
    expect(normalizeRecoveryCode('abcd-efgh ijkl-mnop')).toBe('ABCDEFGHIJKLMNOP');
  });
});

describe('información para el alta', () => {
  it('sin estamento base el registro no está abierto', async () => {
    prepararEstamentos(false);
    const info = await request(app).get('/api/portal/alta');
    expect(info.body.abierta).toBe(false);
    const alta = await request(app).post('/api/portal/alta').send(datosAlta('4000000001'));
    expect(alta.status).toBe(409);
  });

  it('lista los estamentos y muestra la huella del certificado', async () => {
    prepararEstamentos();
    const { cert, private: key } = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      days: 1,
    });
    const conCertificado = createApp({
      db,
      sessionSecret: 'test-secret',
      certificate: Buffer.from(cert),
    });
    expect(key).toBeTruthy();
    const res = await request(conCertificado).get('/api/portal/alta');
    expect(res.body.abierta).toBe(true);
    expect(res.body.estamentos.map((e: { nombre: string }) => e.nombre)).toEqual(['Docente', 'Estudiante']);
    expect(res.body.huella.sha256).toBe(new crypto.X509Certificate(cert).fingerprint256);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sugiere el estamento por el dominio del correo', async () => {
    prepararEstamentos();
    db.prepare('INSERT INTO dominios_correo (dominio, estamento_id) VALUES (?, ?)').run(
      'docentes.ejemplo.test',
      docente
    );
    const res = await request(app)
      .get('/api/portal/alta/sugerencia')
      .query({ correo: 'ana@docentes.ejemplo.test' });
    expect(res.body).toEqual({ estamentoId: docente });
  });
});

describe('alta', () => {
  beforeEach(() => prepararEstamentos());

  it('vincula el teléfono con una cookie HttpOnly, SameSite=Strict y solo para el portal', async () => {
    const res = await request(app).post('/api/portal/alta').send(datosAlta('4000000010'));
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('activo');
    expect(res.body.estamentoPendiente).toBe(false);
    expect(res.body.codigoRecuperacion).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    const cookie = cookieDe(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/portal/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('marca la cookie Secure cuando el servidor sirve por HTTPS', async () => {
    const seguro = createApp({ db, sessionSecret: 'test-secret', secureCookies: true });
    const res = await request(seguro).post('/api/portal/alta').send(datosAlta('4000000011'));
    expect(cookieDe(res)).toMatch(/Secure/);
  });

  it('la base solo guarda hashes de la llave y del código', async () => {
    const res = await request(app).post('/api/portal/alta').send(datosAlta('4000000012'));
    const llave = decodeURIComponent(cookieDe(res)!.split(';')[0].split('=')[1]);
    expect(Buffer.from(llave, 'base64url')).toHaveLength(32);
    const volcado = JSON.stringify([
      db.prepare('SELECT * FROM titulares').all(),
      db.prepare('SELECT * FROM dispositivos').all(),
    ]);
    expect(volcado).not.toContain(llave);
    expect(volcado).not.toContain(normalizeRecoveryCode(res.body.codigoRecuperacion));
    expect(volcado).not.toContain(res.body.codigoRecuperacion);
    const { llave_hash } = db.prepare('SELECT llave_hash FROM dispositivos').get() as { llave_hash: string };
    expect(llave_hash).toBe(crypto.createHash('sha256').update(llave).digest('hex'));
  });

  it('con el teléfono vinculado, el titular consulta su estado', async () => {
    const telefono = request.agent(app);
    await telefono.post('/api/portal/alta').send(datosAlta('4000000013', { estamentoId: docente }));
    const yo = await telefono.get('/api/portal/yo');
    expect(yo.status).toBe(200);
    expect(yo.body).toEqual({
      nombre: 'Titular Sintético',
      estado: 'activo',
      estamento: 'Docente',
      estamentoPendiente: true,
    });
  });

  it('exige la autorización de tratamiento de datos y datos válidos', async () => {
    const enviar = (cambios: object) =>
      request(app).post('/api/portal/alta').send(datosAlta('4000000014', cambios));
    expect((await enviar({ autorizaDatos: false })).status).toBe(400);
    expect((await enviar({ autorizaDatos: undefined })).status).toBe(400);
    expect((await enviar({ correo: 'sin-arroba' })).status).toBe(400);
    expect((await enviar({ documento: '12 34' })).status).toBe(400);
    expect((await enviar({ estamentoId: 9999 })).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM titulares').get()).toEqual({ n: 0 });
  });

  it('un documento repetido queda en revisión, sin vínculo ni código', async () => {
    await request(app).post('/api/portal/alta').send(datosAlta('4000000015'));
    const res = await request(app).post('/api/portal/alta').send(datosAlta('4000000015'));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ estado: 'en_revision' });
    expect(cookieDe(res)).toBeUndefined();
  });
});

describe('separación de sesiones', () => {
  beforeEach(() => prepararEstamentos());

  it('el teléfono del titular no accede a ninguna ruta del personal', async () => {
    const telefono = request.agent(app);
    const alta = await telefono.post('/api/portal/alta').send(datosAlta('4000000020'));
    const cookie = cookieDe(alta)!.split(';')[0];
    for (const ruta of ['/api/registros', '/api/users', '/api/estamentos', '/api/auth/me']) {
      const res = await request(app).get(ruta).set('Cookie', cookie);
      expect(res.status, ruta).toBe(401);
    }
  });

  it('la sesión del personal no sirve en el portal del titular', async () => {
    const personal = request.agent(app);
    await personal.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    expect((await personal.get('/api/portal/yo')).status).toBe(401);
  });

  it('sin cookie o con una llave inventada no hay acceso', async () => {
    expect((await request(app).get('/api/portal/yo')).status).toBe(401);
    const res = await request(app)
      .get('/api/portal/yo')
      .set('Cookie', `sqrid_dispositivo=${crypto.randomBytes(32).toString('base64url')}`);
    expect(res.status).toBe(401);
  });
});

describe('recuperación con código', () => {
  beforeEach(() => prepararEstamentos());

  async function altaConTelefono(documento: string) {
    const telefono = request.agent(app);
    const res = await telefono.post('/api/portal/alta').send(datosAlta(documento));
    return { telefono, codigo: res.body.codigoRecuperacion as string };
  }

  it('vincula un teléfono nuevo, desactiva el anterior y renueva el código', async () => {
    const { telefono: viejo, codigo } = await altaConTelefono('4000000030');
    const nuevo = request.agent(app);
    const res = await nuevo
      .post('/api/portal/recuperar')
      .send({ documento: '4000000030', codigo: codigo.toLowerCase().replace(/-/g, ' ') });
    expect(res.status).toBe(200);
    expect(res.body.codigoRecuperacion).not.toBe(codigo);
    expect((await nuevo.get('/api/portal/yo')).status).toBe(200);
    expect((await viejo.get('/api/portal/yo')).status).toBe(401);
    // El código usado ya no sirve; el nuevo sí.
    expect(
      (await request(app).post('/api/portal/recuperar').send({ documento: '4000000030', codigo })).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/portal/recuperar')
          .send({ documento: '4000000030', codigo: res.body.codigoRecuperacion })
      ).status
    ).toBe(200);
    const estados = (
      db.prepare('SELECT estado FROM dispositivos ORDER BY id').all() as { estado: string }[]
    ).map((d) => d.estado);
    expect(estados).toEqual(['reemplazado', 'reemplazado', 'activo']);
  });

  it('responde igual a un documento inexistente y a un código incorrecto', async () => {
    await altaConTelefono('4000000031');
    const inexistente = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4999999999', codigo: generateRecoveryCode() });
    const incorrecto = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4000000031', codigo: generateRecoveryCode() });
    expect(inexistente.status).toBe(401);
    expect(incorrecto.status).toBe(401);
    expect(inexistente.body).toEqual(incorrecto.body);
  });

  it(`bloquea el documento tras ${MAX_FALLOS_POR_DOCUMENTO} fallos, aunque luego llegue el código correcto`, async () => {
    const { codigo } = await altaConTelefono('4000000032');
    for (let i = 0; i < MAX_FALLOS_POR_DOCUMENTO; i++) {
      const res = await request(app)
        .post('/api/portal/recuperar')
        .send({ documento: '4000000032', codigo: generateRecoveryCode() });
      expect(res.status).toBe(401);
    }
    const bloqueado = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4000000032', codigo });
    expect(bloqueado.status).toBe(429);
  }, 30_000);

  it(`bloquea la IP tras ${MAX_FALLOS_POR_IP} fallos sobre documentos distintos`, async () => {
    const { codigo } = await altaConTelefono('4000000033');
    // Un fallo real revela la IP con la que el servidor ve a supertest; el resto se simula
    // en la tabla para no pagar el costo de bcrypt veinte veces.
    await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4900000000', codigo: generateRecoveryCode() });
    const { ip } = db.prepare('SELECT ip FROM intentos_recuperacion').get() as { ip: string };
    const ahora = new Date().toISOString();
    const insertar = db.prepare(
      'INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES (?, ?, 0, ?)'
    );
    for (let i = 1; i < MAX_FALLOS_POR_IP; i++) insertar.run(`49000000${i}`, ip, ahora);
    const res = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4000000033', codigo });
    expect(res.status).toBe(429);
  });

  it('los fallos antiguos ya no cuentan', async () => {
    const { codigo } = await altaConTelefono('4000000034');
    const haceUnaHora = new Date(Date.now() - 60 * 60_000).toISOString();
    const insertar = db.prepare(
      "INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES ('4000000034', '10.0.0.9', 0, ?)"
    );
    for (let i = 0; i < 10; i++) insertar.run(haceUnaHora);
    const res = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '4000000034', codigo });
    expect(res.status).toBe(200);
  });

  it('consume el mismo código una sola vez ante dos recuperaciones simultáneas', async () => {
    const { codigo } = await altaConTelefono('4000000040');
    const respuestas = await Promise.all(Array.from({ length: 2 }, () =>
      request(app).post('/api/portal/recuperar').send({ documento: '4000000040', codigo })
    ));
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 401]);
    const ganador = respuestas.find((r) => r.status === 200)!;
    expect((await request(app).get('/api/portal/yo').set('Cookie', cookieDe(ganador)!.split(';')[0])).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS n FROM dispositivos WHERE estado = 'activo'").get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM intentos_recuperacion WHERE exito = 1').get()).toEqual({ n: 1 });
  }, 30_000);

  it('reserva la cuota por documento antes de verificar códigos simultáneos', async () => {
    await altaConTelefono('4000000041');
    const respuestas = await Promise.all(Array.from({ length: 8 }, () =>
      request(app).post('/api/portal/recuperar').send({ documento: '4000000041', codigo: generateRecoveryCode() })
    ));
    expect(respuestas.filter((r) => r.status === 401)).toHaveLength(MAX_FALLOS_POR_DOCUMENTO);
    expect(respuestas.filter((r) => r.status === 429)).toHaveLength(8 - MAX_FALLOS_POR_DOCUMENTO);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intentos_recuperacion WHERE exito = 0').get()).toEqual({ n: MAX_FALLOS_POR_DOCUMENTO });
  }, 30_000);

  it('reserva también la última plaza por IP entre documentos distintos', async () => {
    await request(app).post('/api/portal/recuperar').send({ documento: '4900000010', codigo: 'incorrecto' });
    const { ip } = db.prepare('SELECT ip FROM intentos_recuperacion').get() as { ip: string };
    const insertar = db.prepare('INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES (?, ?, 0, ?)');
    for (let i = 1; i < MAX_FALLOS_POR_IP - 1; i++) insertar.run(`49000001${i}`, ip, new Date().toISOString());
    const respuestas = await Promise.all(['4900000041', '4900000042'].map((documento) =>
      request(app).post('/api/portal/recuperar').send({ documento, codigo: generateRecoveryCode() })
    ));
    expect(respuestas.map((r) => r.status).sort()).toEqual([401, 429]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intentos_recuperacion WHERE ip = ? AND exito = 0').get(ip)).toEqual({ n: MAX_FALLOS_POR_IP });
  }, 30_000);
});
