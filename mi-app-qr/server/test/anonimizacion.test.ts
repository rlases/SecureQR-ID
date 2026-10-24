import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { crearEstamento, elegirBase } from '../src/estamentos/config.js';
import { registrarTitular } from '../src/titulares/repository.js';
import { consultarCids } from '../src/titulares/consultas.js';
import { verifyAsignaciones, listAsignaciones } from '../src/titulares/asignaciones.js';
import {
  FRASE_CIERRE,
  anonimizarCierre,
  anonimizarVencidos,
} from '../src/titulares/anonimizacion.js';

const TEST_DB_PATH = './data/test-anonimizacion.sqlite';
let db: Database.Database;
let adminId: number;
let estudiante: number;

const PERSONAS = [
  { nombre: 'Ana Sintética', documento: '8000000001', correo: 'ana@ejemplo.test' },
  { nombre: 'Luis Sintético', documento: '8000000002', correo: 'luis@ejemplo.test' },
];

function poblar() {
  const cids: string[] = [];
  for (const p of PERSONAS) {
    const r = registrarTitular(db, { ...p, estamentoId: estudiante }, new Date());
    cids.push(r.cid!);
    db.prepare(
      "INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id) VALUES (?, ?, 'estudiante', 'entrada', ?)"
    ).run(p.nombre, p.documento, adminId);
  }
  consultarCids(db, adminId, cids, 'Revisión de Ana Sintética', new Date());
  db.prepare(
    "INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES ('8000000001', '10.0.0.5', 0, ?)"
  ).run(new Date().toISOString());
  return cids;
}

/** Todo el contenido de la base como texto, para buscar datos personales. */
function volcado(): string {
  const tablas = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string;
    }[]
  ).map((t) => t.name);
  return JSON.stringify(tablas.map((t) => db.prepare(`SELECT * FROM ${t}`).all()));
}

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
});

afterEach(() => {
  if (db.open) db.close();
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + sufijo)) fs.unlinkSync(TEST_DB_PATH + sufijo);
  }
});

describe('cierre del piloto', () => {
  it('después, ningún cid puede atribuirse a una persona', () => {
    const cids = poblar();
    expect(volcado()).toContain('Ana Sintética');
    const r = anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    expect(r).toEqual({ titulares: 2, registros: 2, consultas: 2 });
    const todo = volcado();
    for (const p of PERSONAS) {
      expect(todo).not.toContain(p.nombre);
      expect(todo).not.toContain(p.documento);
      expect(todo).not.toContain(p.correo);
    }
    // La consulta auditada ya no devuelve a nadie.
    const resultados = consultarCids(db, adminId, cids, null, new Date());
    expect(resultados.every((x) => x.encontrado && x.anonimizado)).toBe(true);
  });

  it('la cadena del historial sigue verificando y conserva los cid', () => {
    const cids = poblar();
    const antes = listAsignaciones(db);
    anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    expect(listAsignaciones(db)).toEqual(antes);
    expect(listAsignaciones(db).map((a) => a.cid)).toEqual(cids);
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('sin la frase exacta no hace nada', () => {
    poblar();
    expect(() => anonimizarCierre(db, 'anonimizar todo', 'prueba', new Date())).toThrow(/exactamente/);
    expect(volcado()).toContain('Ana Sintética');
  });

  it('queda registrado y es idempotente', () => {
    poblar();
    anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    expect(anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date())).toEqual({
      titulares: 0,
      registros: 0,
      consultas: 0,
    });
    const filas = db.prepare('SELECT alcance, titulares, ejecutado_por FROM anonimizaciones').all();
    expect(filas).toEqual([
      { alcance: 'cierre', titulares: 2, ejecutado_por: 'prueba' },
      { alcance: 'cierre', titulares: 0, ejecutado_por: 'prueba' },
    ]);
  });

  it('el registro de consultas solo admite anonimizar el motivo', () => {
    poblar();
    expect(() => db.prepare('UPDATE consultas_cid SET motivo = ?').run('otro motivo')).toThrow(/solo agregar/);
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'x', motivo = NULL").run()).toThrow(/solo agregar/);
    expect(() => db.prepare('UPDATE consultas_cid SET motivo = NULL').run()).not.toThrow();
  });
});

describe('comando de línea de comandos', () => {
  it('sin confirmación no anonimiza; con la frase, sí', () => {
    poblar();
    db.close();
    const ejecutar = (args: string[]) => {
      try {
        return {
          code: 0,
          out: execFileSync('npx', ['tsx', 'src/cli/anonimizar.ts', ...args], {
            env: { ...process.env, DB_PATH: TEST_DB_PATH },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        };
      } catch (error) {
        const e = error as { status: number; stderr: string };
        return { code: e.status, out: e.stderr };
      }
    };
    expect(ejecutar(['--cierre']).code).toBe(1);
    expect(ejecutar(['--cierre', '--confirmar', 'si']).code).toBe(1);
    const ok = ejecutar(['--cierre', '--confirmar', FRASE_CIERRE]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/2 titulares, 2 registros y 2 consultas/);
    db = openDatabase(TEST_DB_PATH);
    expect(volcado()).not.toContain('Ana Sintética');
  }, 60_000);
});

describe('plazo de conservación', () => {
  it('sin plazo no anonimiza nada', () => {
    poblar();
    expect(anonimizarVencidos(db, new Date())).toBeNull();
    expect(volcado()).toContain('Ana Sintética');
  });

  it('anonimiza registros y consultas más antiguos que el plazo, no los recientes ni los titulares', async () => {
    poblar();
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    expect((await admin.put('/api/titulares/conservacion').send({ plazoDias: 10 })).status).toBe(400);
    expect((await admin.put('/api/titulares/conservacion').send({ plazoDias: 365 })).body).toEqual({ plazoDias: 365 });
    expect((await admin.get('/api/titulares/conservacion')).body).toEqual({ plazoDias: 365 });
    // Un registro de hace dos años y uno de hoy.
    db.prepare(
      "INSERT INTO registros (nombre, documento, rol, tipo, timestamp, creado_por_usuario_id) VALUES ('Viejo Sintético', '8000000009', 'estudiante', 'entrada', '2024-01-10 08:00:00', ?)"
    ).run(adminId);
    const r = anonimizarVencidos(db, new Date());
    expect(r).toEqual({ titulares: 0, registros: 1, consultas: 0 });
    const todo = volcado();
    expect(todo).not.toContain('Viejo Sintético');
    expect(todo).toContain('Ana Sintética');
    const [cambio] = (await admin.get('/api/estamentos/cambios')).body.cambios;
    expect(cambio).toMatchObject({ entidad: 'conservacion', valorAnterior: null, valorNuevo: 365 });
  });
});
