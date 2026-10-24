import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { estamentoSugerido } from '../src/estamentos/config.js';
import { registrarTitular } from '../src/titulares/repository.js';

const TEST_DB_PATH = './data/test-estamentos.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;

async function crear(nombre: string, requiereConfirmacion = false) {
  const res = await agent.post('/api/estamentos').send({ nombre, requiereConfirmacion });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
});

afterEach(() => {
  db.close();
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + sufijo)) fs.unlinkSync(TEST_DB_PATH + sufijo);
  }
});

describe('autorización', () => {
  it('sin sesión responde 401', async () => {
    expect((await request(app).get('/api/estamentos')).status).toBe(401);
  });

  it('un operador no puede ver ni cambiar la configuración', async () => {
    const creado = await agent.post('/api/users').send({ username: 'op1', role: 'operador' });
    const operador = request.agent(app);
    await operador
      .post('/api/auth/login')
      .send({ username: 'op1', password: creado.body.generatedPassword });
    expect((await operador.get('/api/estamentos')).status).toBe(403);
    expect((await operador.post('/api/estamentos').send({ nombre: 'Docente' })).status).toBe(403);
  });
});

describe('estamentos', () => {
  it('la instalación empieza sin estamentos predefinidos', async () => {
    const res = await agent.get('/api/estamentos');
    expect(res.body).toEqual({ estamentos: [], excepciones: [], dominios: [] });
  });

  it('crea, renombra, elige base y lista con sus ventanas', async () => {
    const id = await crear('Estudiante');
    expect((await agent.patch(`/api/estamentos/${id}`).send({ nombre: 'Estudiantes' })).status).toBe(200);
    expect((await agent.post(`/api/estamentos/${id}/base`)).body.esBase).toBe(true);
    const ventanas = await agent
      .put(`/api/estamentos/${id}/ventanas`)
      .send({ ventanas: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }] });
    expect(ventanas.status).toBe(200);
    const lista = await agent.get('/api/estamentos');
    expect(lista.body.estamentos).toEqual([
      {
        id,
        nombre: 'Estudiantes',
        requiereConfirmacion: false,
        esBase: true,
        ventanas: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }],
      },
    ]);
  });

  it('rechaza nombres repetidos sin importar mayúsculas', async () => {
    await crear('Docente', true);
    expect((await agent.post('/api/estamentos').send({ nombre: 'docente' })).status).toBe(409);
  });

  it('cambiar la base la quita del estamento anterior', async () => {
    const a = await crear('Estudiante');
    const b = await crear('Aprendiz');
    await agent.post(`/api/estamentos/${a}/base`);
    await agent.post(`/api/estamentos/${b}/base`);
    const lista = (await agent.get('/api/estamentos')).body.estamentos as { id: number; esBase: boolean }[];
    expect(lista.filter((e) => e.esBase).map((e) => e.id)).toEqual([b]);
  });

  it('la base no puede requerir confirmación ni borrarse mientras lo sea', async () => {
    const base = await crear('Estudiante');
    const privilegiado = await crear('Docente', true);
    expect((await agent.post(`/api/estamentos/${privilegiado}/base`)).status).toBe(409);
    await agent.post(`/api/estamentos/${base}/base`);
    expect(
      (await agent.patch(`/api/estamentos/${base}`).send({ requiereConfirmacion: true })).status
    ).toBe(409);
    expect((await agent.delete(`/api/estamentos/${base}`)).status).toBe(409);
  });

  it('no borra un estamento con titulares', async () => {
    const id = await crear('Docente', true);
    registrarTitular(
      db,
      { nombre: 'Titular Sintético', documento: '3000000001', correo: 't@ejemplo.test', estamentoId: id },
      new Date()
    );
    expect((await agent.delete(`/api/estamentos/${id}`)).status).toBe(409);
  });

  it('borra un estamento sin titulares junto con sus ventanas', async () => {
    const id = await crear('Temporal');
    await agent
      .put(`/api/estamentos/${id}/ventanas`)
      .send({ ventanas: [{ diaSemana: 2, inicio: '08:00', fin: '09:00' }] });
    expect((await agent.delete(`/api/estamentos/${id}`)).status).toBe(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reglas_horario').get()).toEqual({ n: 0 });
  });

  it('valida las ventanas', async () => {
    const id = await crear('Estudiante');
    const enviar = (ventana: object) =>
      agent.put(`/api/estamentos/${id}/ventanas`).send({ ventanas: [ventana] });
    expect((await enviar({ diaSemana: 0, inicio: '06:00', fin: '08:00' })).status).toBe(400);
    expect((await enviar({ diaSemana: 1, inicio: '6:00', fin: '08:00' })).status).toBe(400);
    expect((await enviar({ diaSemana: 1, inicio: '18:00', fin: '08:00' })).status).toBe(400);
    expect((await enviar({ diaSemana: 1, inicio: '24:00', fin: '24:00' })).status).toBe(400);
    expect((await enviar({ diaSemana: 1, inicio: '22:00', fin: '24:00' })).status).toBe(200);
  });
});

describe('excepciones y dominios', () => {
  it('crea y borra una excepción de calendario', async () => {
    const res = await agent.post('/api/estamentos/excepciones').send({
      fechaDesde: '2026-12-08',
      fechaHasta: '2026-12-08',
      tipo: 'cierre',
      estamentoId: null,
      descripcion: 'Festivo',
    });
    expect(res.status).toBe(201);
    expect(res.body.ventanas).toEqual([]);
    expect((await agent.delete(`/api/estamentos/excepciones/${res.body.id}`)).status).toBe(204);
    expect((await agent.delete(`/api/estamentos/excepciones/${res.body.id}`)).status).toBe(404);
  });

  it('el dominio solo asigna directo un estamento sin confirmación', async () => {
    const estudiante = await crear('Estudiante');
    const docente = await crear('Docente', true);
    expect(
      (await agent.post('/api/estamentos/dominios').send({ dominio: '@estudiantes.ejemplo.edu.co', estamentoId: estudiante })).body.dominio
    ).toBe('estudiantes.ejemplo.edu.co');
    await agent.post('/api/estamentos/dominios').send({ dominio: 'docentes.ejemplo.edu.co', estamentoId: docente });
    expect(estamentoSugerido(db, 'ana@Estudiantes.Ejemplo.edu.co')).toEqual({
      estamentoId: estudiante,
      asignaDirecto: true,
    });
    expect(estamentoSugerido(db, 'luis@docentes.ejemplo.edu.co')).toEqual({
      estamentoId: docente,
      asignaDirecto: false,
    });
    expect(estamentoSugerido(db, 'otro@correo.test')).toBeNull();
  });

  it('rechaza dominios inválidos o repetidos', async () => {
    const id = await crear('Estudiante');
    const enviar = (dominio: string) =>
      agent.post('/api/estamentos/dominios').send({ dominio, estamentoId: id });
    expect((await enviar('sin-punto')).status).toBe(400);
    expect((await enviar('ana@ejemplo.edu.co')).status).toBe(400);
    expect((await enviar('ejemplo.edu.co')).status).toBe(201);
    expect((await enviar('EJEMPLO.edu.co')).status).toBe(409);
  });
});

describe('registro de cambios', () => {
  it('guarda quién, cuándo, el valor anterior y el nuevo de cada cambio', async () => {
    const id = await crear('Estudiante');
    await agent
      .put(`/api/estamentos/${id}/ventanas`)
      .send({ ventanas: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }] });
    await agent
      .put(`/api/estamentos/${id}/ventanas`)
      .send({ ventanas: [{ diaSemana: 1, inicio: '07:00', fin: '18:00' }] });
    const { cambios } = (await agent.get('/api/estamentos/cambios')).body;
    expect(cambios[0]).toMatchObject({
      usuario: 'admin',
      entidad: 'ventanas',
      entidadId: id,
      accion: 'reemplazar',
      valorAnterior: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }],
      valorNuevo: [{ diaSemana: 1, inicio: '07:00', fin: '18:00' }],
    });
    expect(Number.isNaN(Date.parse(cambios[0].en))).toBe(false);
    expect(cambios.map((c: { accion: string }) => c.accion)).toEqual(['reemplazar', 'reemplazar', 'crear']);
  });

  it('un cambio rechazado no deja registro', async () => {
    const id = await crear('Estudiante');
    await agent.post(`/api/estamentos/${id}/base`);
    await agent.delete(`/api/estamentos/${id}`);
    const acciones = (await agent.get('/api/estamentos/cambios')).body.cambios.map(
      (c: { accion: string }) => c.accion
    );
    expect(acciones).toEqual(['elegir_base', 'crear']);
  });

  it('el registro es de solo agregar', async () => {
    await crear('Estudiante');
    expect(() => db.prepare('DELETE FROM cambios_configuracion').run()).toThrow(/solo agregar/);
    expect(() => db.prepare("UPDATE cambios_configuracion SET accion = 'otra'").run()).toThrow(
      /solo agregar/
    );
  });

  it('confirmar el estamento de un titular queda registrado', async () => {
    const base = await crear('Estudiante');
    const docente = await crear('Docente', true);
    await agent.post(`/api/estamentos/${base}/base`);
    const { titular } = registrarTitular(
      db,
      { nombre: 'Titular Sintético', documento: '3000000002', correo: 't@ejemplo.test', estamentoId: docente },
      new Date()
    );
    expect(titular.estamentoConfirmado).toBe(false);
    const res = await agent.put(`/api/estamentos/titulares/${titular.id}`).send({ estamentoId: docente });
    expect(res.body).toEqual({ estamentoId: docente, estamentoConfirmado: true });
    const [ultimo] = (await agent.get('/api/estamentos/cambios')).body.cambios;
    expect(ultimo).toMatchObject({
      entidad: 'titular_estamento',
      entidadId: titular.id,
      valorAnterior: { estamentoId: docente, estamentoConfirmado: false },
      valorNuevo: { estamentoId: docente, estamentoConfirmado: true },
    });
  });
});
