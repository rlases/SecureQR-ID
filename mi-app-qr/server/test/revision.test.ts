import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase, listCambios } from '../src/estamentos/config.js';
import { registrarTitular, historialCredenciales } from '../src/titulares/repository.js';
import { cidsRevocados } from '../src/titulares/gestion.js';
import { consultarCids } from '../src/titulares/consultas.js';
import { verifyAsignaciones } from '../src/titulares/asignaciones.js';
import { linkDevice } from '../src/portal/credencialesTitular.js';
import { anonimizarCierre, FRASE_CIERRE } from '../src/titulares/anonimizacion.js';
import { VIGENCIA_PROVISIONAL_HORAS } from '../src/titulares/revision.js';

// Resolución de altas en revisión (enmienda de 2026-10-24 a ADR-0016, issue #109).
// Datos sintéticos (SECURITY.md).
let testDirectory: string;
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let admin: ReturnType<typeof request.agent>;
let adminId: number;
let estudiante: number;

function alta(documento: string, nombre = 'Titular Sintético') {
  return registrarTitular(
    db,
    { nombre, documento, correo: 't@ejemplo.test', estamentoId: estudiante },
    new Date()
  );
}

/** Un registro activo con teléfono vinculado y, después, un alta repetida en revisión. */
function conflicto(documento: string) {
  const anterior = alta(documento, 'Ana Anterior');
  linkDevice(db, anterior.titular.id, new Date());
  const nuevo = alta(documento, 'Ana Nueva');
  expect(nuevo.titular.estado).toBe('en_revision');
  return { anterior: { id: anterior.titular.id, cid: anterior.cid! }, nuevoId: nuevo.titular.id };
}

function estado(id: number): string {
  return (db.prepare('SELECT estado FROM titulares WHERE id = ?').get(id) as { estado: string }).estado;
}

beforeEach(async () => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-revision-'));
  db = openDatabase(path.join(testDirectory, 'test.sqlite'));
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
});

afterEach(() => {
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('permisos', () => {
  it('un operador no resuelve altas en revisión', async () => {
    const { nuevoId } = conflicto('7100000001');
    const creado = await admin.post('/api/users').send({ username: 'op1', role: 'operador' });
    const operador = request.agent(app);
    await operador.post('/api/auth/login').send({ username: 'op1', password: creado.body.generatedPassword });
    for (const accion of ['rechazar', 'reemplazar', 'aprobar', 'regenerar-codigo']) {
      const res = await operador.post(`/api/titulares/${nuevoId}/${accion}`).send({ motivo: 'misma_persona' });
      expect(res.status).toBe(403);
    }
    expect(estado(nuevoId)).toBe('en_revision');
  });
});

describe('rechazar', () => {
  it('anonimiza el alta de inmediato y deja constancia con el motivo', async () => {
    const { anterior, nuevoId } = conflicto('7100000010');
    const res = await admin.post(`/api/titulares/${nuevoId}/rechazar`).send({ nota: 'documento ajeno' });
    expect(res.status).toBe(200);
    const fila = db.prepare('SELECT nombre, documento, correo, estado FROM titulares WHERE id = ?').get(nuevoId);
    expect(fila).toMatchObject({ nombre: 'Anonimizado', correo: '', estado: 'anonimizado' });
    expect((fila as { documento: string }).documento).toMatch(/^anon-/);
    // El registro anterior no cambia.
    expect(estado(anterior.id)).toBe('activo');
    const cambio = listCambios(db).find((c) => c.accion === 'rechazar_alta')!;
    expect(cambio.valorNuevo).toEqual({
      estado: 'anonimizado',
      motivo: 'documento_de_otra_persona',
      nota: 'documento ajeno',
    });
  });

  it('se resuelve una sola vez', async () => {
    const { nuevoId } = conflicto('7100000011');
    expect((await admin.post(`/api/titulares/${nuevoId}/rechazar`).send({})).status).toBe(200);
    expect((await admin.post(`/api/titulares/${nuevoId}/rechazar`).send({})).status).toBe(404);
    expect((await admin.post(`/api/titulares/${nuevoId}/aprobar`).send({})).status).toBe(404);
  });
});

describe('reemplazar', () => {
  it('misma persona: el anterior queda reemplazado y su cid sigue resolviendo', async () => {
    const { anterior, nuevoId } = conflicto('7100000020');
    const res = await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.codigoProvisional).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);

    expect(estado(anterior.id)).toBe('reemplazado');
    expect(historialCredenciales(db, anterior.id).map((c) => c.estado)).toEqual(['reemplazada']);
    expect(db.prepare("SELECT COUNT(*) AS n FROM dispositivos WHERE titular_id = ? AND estado = 'activo'").get(anterior.id)).toEqual({ n: 0 });
    // «Misma persona» no revoca: el cid anterior no entra en la lista.
    expect(cidsRevocados(db)).not.toContain(anterior.cid);

    expect(estado(nuevoId)).toBe('activo');
    expect(historialCredenciales(db, nuevoId).map((c) => c.estado)).toEqual(['vigente']);

    // El cid anterior sigue atribuido al titular anterior en la consulta auditada.
    const [resultado] = consultarCids(db, adminId, [anterior.cid], null, new Date());
    expect(resultado).toMatchObject({ encontrado: true, anonimizado: false, titularId: anterior.id, nombre: 'Ana Anterior' });
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('registro anterior indebido: la credencial anterior queda revocada', async () => {
    const { anterior, nuevoId } = conflicto('7100000021');
    const res = await admin
      .post(`/api/titulares/${nuevoId}/reemplazar`)
      .send({ motivo: 'registro_anterior_indebido', nota: 'verificado en persona' });
    expect(res.status).toBe(200);
    expect(historialCredenciales(db, anterior.id).map((c) => c.estado)).toEqual(['revocada']);
    expect(cidsRevocados(db)).toContain(anterior.cid);
    const cambios = listCambios(db).filter((c) => c.accion === 'reemplazar' || c.accion === 'reemplazado');
    expect(cambios).toHaveLength(2);
    // Sin cid en el registro de configuración.
    expect(JSON.stringify(cambios)).not.toContain(anterior.cid);
    expect(cambios.find((c) => c.accion === 'reemplazar')!.valorNuevo).toMatchObject({
      motivo: 'registro_anterior_indebido',
      reemplazaA: anterior.id,
    });
  });

  it('rechaza un motivo fuera de la lista cerrada', async () => {
    const { nuevoId } = conflicto('7100000022');
    const res = await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'otro' });
    expect(res.status).toBe(400);
    expect(estado(nuevoId)).toBe('en_revision');
  });

  it('sin registro vigente no hay nada que reemplazar', async () => {
    const { anterior, nuevoId } = conflicto('7100000023');
    db.prepare("UPDATE titulares SET estado = 'anonimizado', documento = 'anon-x' WHERE id = ?").run(anterior.id);
    const res = await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' });
    expect(res.status).toBe(409);
  });

  it('dos resoluciones simultáneas: una sola credencial y un solo código', async () => {
    const { nuevoId } = conflicto('7100000024');
    const respuestas = await Promise.all([
      admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' }),
      admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' }),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(historialCredenciales(db, nuevoId)).toHaveLength(1);
    expect(verifyAsignaciones(db)).toBe(true);
  }, 30_000);

  it('si algo falla a mitad del reemplazo, nada cambia', async () => {
    const { anterior, nuevoId } = conflicto('7100000025');
    db.exec(`CREATE TRIGGER falla_prueba BEFORE INSERT ON credenciales
             BEGIN SELECT RAISE(ABORT, 'falla de prueba'); END;`);
    const res = await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'registro_anterior_indebido' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'no se pudo resolver el alta' });
    db.exec('DROP TRIGGER falla_prueba');
    expect(estado(anterior.id)).toBe('activo');
    expect(estado(nuevoId)).toBe('en_revision');
    expect(historialCredenciales(db, anterior.id).map((c) => c.estado)).toEqual(['vigente']);
    expect(db.prepare("SELECT COUNT(*) AS n FROM dispositivos WHERE titular_id = ? AND estado = 'activo'").get(anterior.id)).toEqual({ n: 1 });
    expect(listCambios(db).filter((c) => c.entidad === 'titular')).toHaveLength(0);
  });
});

describe('aprobar', () => {
  it('sin registro vigente, el alta queda activa con credencial y código', async () => {
    const { anterior, nuevoId } = conflicto('7100000030');
    db.prepare("UPDATE titulares SET estado = 'anonimizado', documento = 'anon-y' WHERE id = ?").run(anterior.id);
    const res = await admin.post(`/api/titulares/${nuevoId}/aprobar`).send({});
    expect(res.status).toBe(200);
    expect(res.body.codigoProvisional).toBeTruthy();
    expect(estado(nuevoId)).toBe('activo');
    expect(listCambios(db).find((c) => c.accion === 'aprobar_alta')!.valorNuevo).toMatchObject({
      motivo: 'sin_registro_anterior',
    });
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('con un registro vigente no se aprueba', async () => {
    const { nuevoId } = conflicto('7100000031');
    expect((await admin.post(`/api/titulares/${nuevoId}/aprobar`).send({})).status).toBe(409);
    expect(estado(nuevoId)).toBe('en_revision');
  });
});

describe('código provisional de entrega', () => {
  async function reemplazado(documento: string) {
    const { nuevoId } = conflicto(documento);
    const res = await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' });
    return { nuevoId, codigo: res.body.codigoProvisional as string, venceEn: res.body.venceEn as string };
  }

  it(`vence a las ${VIGENCIA_PROVISIONAL_HORAS} horas`, async () => {
    const antes = Date.now();
    const { venceEn } = await reemplazado('7100000040');
    const horas = (new Date(venceEn).getTime() - antes) / 3_600_000;
    expect(horas).toBeGreaterThan(VIGENCIA_PROVISIONAL_HORAS - 0.1);
    expect(horas).toBeLessThan(VIGENCIA_PROVISIONAL_HORAS + 0.1);
  }, 30_000);

  it('se canjea una vez en la recuperación y deja un código propio que no vence', async () => {
    const { nuevoId, codigo } = await reemplazado('7100000041');
    const canje = await request(app).post('/api/portal/recuperar').send({ documento: '7100000041', codigo });
    expect(canje.status).toBe(200);
    expect(canje.body.codigoRecuperacion).not.toBe(codigo);
    expect(db.prepare('SELECT provisional_vence_en FROM titulares WHERE id = ?').get(nuevoId)).toEqual({ provisional_vence_en: null });
    const otra = await request(app).post('/api/portal/recuperar').send({ documento: '7100000041', codigo });
    expect(otra.status).toBe(401);
    // El código propio sí funciona.
    const propia = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '7100000041', codigo: canje.body.codigoRecuperacion });
    expect(propia.status).toBe(200);
  }, 30_000);

  it('dos canjes simultáneos: un solo éxito', async () => {
    const { codigo } = await reemplazado('7100000042');
    const respuestas = await Promise.all(
      Array.from({ length: 2 }, () => request(app).post('/api/portal/recuperar').send({ documento: '7100000042', codigo }))
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 401]);
  }, 30_000);

  it('vencido responde igual que uno incorrecto, y regenerarlo invalida el anterior', async () => {
    const { nuevoId, codigo } = await reemplazado('7100000043');
    db.prepare('UPDATE titulares SET provisional_vence_en = ? WHERE id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      nuevoId
    );
    const vencido = await request(app).post('/api/portal/recuperar').send({ documento: '7100000043', codigo });
    expect(vencido.status).toBe(401);
    expect(vencido.body).toEqual({ error: 'documento o código incorrectos' });

    const regenerado = await admin.post(`/api/titulares/${nuevoId}/regenerar-codigo`).send({});
    expect(regenerado.status).toBe(200);
    expect(regenerado.headers['cache-control']).toBe('no-store');
    expect((await request(app).post('/api/portal/recuperar').send({ documento: '7100000043', codigo })).status).toBe(401);
    const nuevo = await request(app)
      .post('/api/portal/recuperar')
      .send({ documento: '7100000043', codigo: regenerado.body.codigoProvisional });
    expect(nuevo.status).toBe(200);
    expect(listCambios(db).some((c) => c.accion === 'regenerar_provisional')).toBe(true);
  }, 30_000);

  it('no se regenera para un titular sin código provisional pendiente', async () => {
    const { anterior } = conflicto('7100000044');
    expect((await admin.post(`/api/titulares/${anterior.id}/regenerar-codigo`).send({})).status).toBe(409);
  });

  it('el listado muestra el registro vigente del alta en revisión y el provisional pendiente', async () => {
    const { anterior, nuevoId } = conflicto('7100000045');
    let lista = (await admin.get('/api/titulares?estado=en_revision')).body.titulares;
    expect(lista).toEqual([
      expect.objectContaining({ id: nuevoId, registroVigenteId: anterior.id, registroVigenteEstado: 'activo' }),
    ]);
    await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' });
    lista = (await admin.get('/api/titulares?estado=activo')).body.titulares;
    expect(lista.find((t: { id: number }) => t.id === nuevoId).provisionalVenceEn).toBeTruthy();
    lista = (await admin.get('/api/titulares?estado=reemplazado')).body.titulares;
    expect(lista.map((t: { id: number }) => t.id)).toEqual([anterior.id]);
  }, 30_000);

  it('el listado avisa si el registro vigente del alta en revisión está suspendido (#132)', async () => {
    const { anterior, nuevoId } = conflicto('7100000046');
    expect((await admin.post(`/api/titulares/${anterior.id}/revocar`).send({ motivo: 'perdió el carné' })).status).toBe(200);
    const lista = (await admin.get('/api/titulares?estado=en_revision')).body.titulares;
    expect(lista).toEqual([
      expect.objectContaining({ id: nuevoId, registroVigenteId: anterior.id, registroVigenteEstado: 'suspendido' }),
    ]);
    const otros = (await admin.get('/api/titulares?estado=suspendido')).body.titulares;
    expect(otros[0].registroVigenteEstado).toBeNull();
  }, 30_000);
});

describe('anonimización', () => {
  it('al cierre también alcanza a los titulares reemplazados', async () => {
    const { nuevoId } = conflicto('7100000050');
    await admin.post(`/api/titulares/${nuevoId}/reemplazar`).send({ motivo: 'misma_persona' });
    anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    const volcado = JSON.stringify(db.prepare('SELECT * FROM titulares').all());
    expect(volcado).not.toContain('Ana Anterior');
    expect(volcado).not.toContain('Ana Nueva');
    expect(volcado).not.toContain('7100000050');
    expect(verifyAsignaciones(db)).toBe(true);
  }, 30_000);
});

describe('migración de la restricción de estados', () => {
  it('reconstruye titulares conservando filas, ref, índices, disparadores y claves foráneas', () => {
    const { anterior, nuevoId } = conflicto('7100000060');
    const antes = db.prepare('SELECT id, ref, nombre, documento, estado FROM titulares ORDER BY id').all();
    // Simula una base anterior a la enmienda: el CHECK sin 'reemplazado' y sin la columna nueva.
    const actual = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'titulares'").get() as { sql: string }).sql;
    const vieja = actual
      .replace("'reemplazado', ", '')
      .replace(/\n\s*-- Solo para el código provisional[^\n]*\n[^\n]*\n\s*provisional_vence_en TEXT,/, '')
      .replace('CREATE TABLE titulares', 'CREATE TABLE titulares_vieja');
    expect(vieja).not.toContain('provisional_vence_en');
    db.pragma('foreign_keys = OFF');
    db.exec(vieja);
    db.exec(`INSERT INTO titulares_vieja SELECT id, ref, nombre, documento, correo, estamento_id,
               estamento_confirmado, estado, codigo_recuperacion_hash, autorizacion_datos_en, creado_en
             FROM titulares`);
    db.exec('DROP TABLE titulares');
    db.exec('ALTER TABLE titulares_vieja RENAME TO titulares');
    db.pragma('foreign_keys = ON');
    expect(() => db.prepare("UPDATE titulares SET estado = 'reemplazado' WHERE id = ?").run(anterior.id)).toThrow();

    runMigrations(db);

    expect(db.prepare('SELECT id, ref, nombre, documento, estado FROM titulares ORDER BY id').all()).toEqual(antes);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const objetos = (db.prepare("SELECT name FROM sqlite_master WHERE tbl_name = 'titulares'").all() as { name: string }[]).map((o) => o.name);
    expect(objetos).toEqual(expect.arrayContaining([
      'titulares_documento_unico',
      'titulares_no_delete',
      'titulares_referencia_fija',
    ]));
    expect(() => db.prepare('DELETE FROM titulares WHERE id = ?').run(nuevoId)).toThrow(/anonimiza/);
    expect(() => db.prepare("UPDATE titulares SET ref = 'otra' WHERE id = ?").run(nuevoId)).toThrow(/referencia/);
    // Y ahora el estado nuevo vale, con la atribución y la cadena intactas.
    db.prepare("UPDATE titulares SET estado = 'reemplazado' WHERE id = ?").run(anterior.id);
    const [r] = consultarCids(db, adminId, [anterior.cid], null, new Date());
    expect(r).toMatchObject({ encontrado: true, titularId: anterior.id });
    expect(verifyAsignaciones(db)).toBe(true);
    // Es idempotente.
    runMigrations(db);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
