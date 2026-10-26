import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  setPlazoConservacion,
} from '../src/titulares/anonimizacion.js';
import { canonicalCidSql, generateCid, isCanonicalCid } from '../src/titulares/identificadores.js';

let testDirectory: string;
let testDbPath: string;
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
  db.prepare("INSERT INTO intentos_alta (ip, en) VALUES ('10.0.0.5', ?)").run(new Date().toISOString());
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
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-anonimizacion-'));
  testDbPath = path.join(testDirectory, 'test.sqlite');
  db = openDatabase(testDbPath);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estudiante = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
  elegirBase(db, adminId, estudiante, new Date());
});

afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('cierre del piloto', () => {
  it('el predicado SQL preserva exactamente los cid que acepta el validador', () => {
    const sql = db.prepare(`SELECT ${canonicalCidSql()} AS valido FROM (SELECT ? AS cid)`);
    const muestras = [
      ...Array.from({ length: 32 }, () => generateCid()),
      '', 'ana@ejemplo.test', '8000000001', 'anon-1',
      'AAAAAAAAAAAAAAAAAAAAAA\0ana@ejemplo.test', '\0',
      'AAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAB',
      'AAAAAAAAAAAAAAAAAAAAAQ', 'AAAAAAAAAAAAAAAAAAAAAg',
      'AAAAAAAAAAAAAAAAAAAAAw', 'AAAAAAAAAAAAAAAAAAAAA=',
    ];
    for (const cid of muestras) {
      expect(Boolean((sql.get(cid) as { valido: number }).valido), cid).toBe(isCanonicalCid(cid));
    }
  });

  it.each(['cierre', 'vencimiento'])('elimina el sufijo personal tras NUL en %s', (modo) => {
    poblar();
    const malformado = 'AAAAAAAAAAAAAAAAAAAAAA\0ana@ejemplo.test';
    consultarCids(db, adminId, [malformado], null, new Date('2024-01-01T00:00:00Z'));
    const antes = db.prepare('SELECT id, usuario_id, titular_id, en FROM consultas_cid WHERE id = 3').get();
    if (modo === 'cierre') anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    else {
      setPlazoConservacion(db, 365, adminId, new Date());
      anonimizarVencidos(db, new Date());
    }
    expect(db.prepare('SELECT cid FROM consultas_cid WHERE id = 3').get()).toEqual({ cid: 'anon-3' });
    expect(db.prepare('SELECT id, usuario_id, titular_id, en FROM consultas_cid WHERE id = 3').get()).toEqual(antes);
    expect(verifyAsignaciones(db)).toBe(true);
  });

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
    // Las IP de los intentos de alta y de recuperación tampoco sobreviven.
    expect(todo).not.toContain('10.0.0.5');
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

  it('limpia datos personales en motivos de correcciones y cid mal formados', () => {
    const cids = poblar();
    db.prepare("INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id, corrige_registro_id, motivo) VALUES (?, ?, 'estudiante', 'entrada', ?, 1, ?)")
      .run(PERSONAS[0].nombre, PERSONAS[0].documento, adminId, `Corregir ${PERSONAS[0].nombre}, ${PERSONAS[0].documento}, ${PERSONAS[0].correo}`);
    consultarCids(db, adminId, [PERSONAS[0].correo, PERSONAS[0].documento], null, new Date());
    const auditoria = db.prepare('SELECT id, usuario_id, titular_id, en FROM consultas_cid ORDER BY id').all();
    anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date());
    for (const p of PERSONAS) {
      expect(volcado()).not.toContain(p.nombre);
      expect(volcado()).not.toContain(p.documento);
      expect(volcado()).not.toContain(p.correo);
    }
    expect(db.prepare('SELECT motivo, corrige_registro_id FROM registros WHERE id = 3').get()).toEqual({ motivo: 'Anonimizado', corrige_registro_id: 1 });
    expect(db.prepare('SELECT cid FROM consultas_cid ORDER BY id').all()).toEqual([...cids.map((cid) => ({ cid })), { cid: 'anon-3' }, { cid: 'anon-4' }]);
    expect(db.prepare('SELECT id, usuario_id, titular_id, en FROM consultas_cid ORDER BY id').all()).toEqual(auditoria);
    expect(verifyAsignaciones(db)).toBe(true);
    expect(anonimizarCierre(db, FRASE_CIERRE, 'prueba', new Date())).toEqual({ titulares: 0, registros: 0, consultas: 0 });
  });

  it('solo permite sustituir un cid mal formado por la marca opaca de su fila', () => {
    const [cid] = poblar();
    consultarCids(db, adminId, [PERSONAS[0].correo, generateCid()], null, new Date());
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'anon-1', motivo = NULL WHERE id = 1").run()).toThrow(/solo agregar/);
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'anon-4', motivo = NULL WHERE id = 4").run()).toThrow(/solo agregar/);
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'anon-999', motivo = NULL WHERE id = 3").run()).toThrow(/solo agregar/);
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'anon-3', motivo = NULL, usuario_id = 999 WHERE id = 3").run()).toThrow();
    expect(() => db.prepare("UPDATE consultas_cid SET cid = 'anon-3', motivo = NULL WHERE id = 3").run()).not.toThrow();
    expect(db.prepare('SELECT cid FROM consultas_cid WHERE id = 1').get()).toEqual({ cid });
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
          out: execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/anonimizar.ts', ...args], {
            env: { ...process.env, DB_PATH: testDbPath },
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
    db = openDatabase(testDbPath);
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

  it('limpia motivos y búsquedas inválidas vencidas sin tocar las recientes', () => {
    poblar();
    const anterior = '2024-01-10 08:00:00';
    db.prepare("INSERT INTO registros (nombre, documento, rol, tipo, timestamp, creado_por_usuario_id, corrige_registro_id, motivo) VALUES ('Anonimizado', 'anon-3', 'estudiante', 'entrada', ?, ?, 1, ?)")
      .run(anterior, adminId, 'Dato antiguo sintético');
    const insertar = db.prepare('INSERT INTO consultas_cid (usuario_id, cid, motivo, en) VALUES (?, ?, ?, ?)');
    insertar.run(adminId, 'antiguo@ejemplo.test', 'Dato antiguo sintético', '2024-01-10T08:00:00.000Z');
    insertar.run(adminId, 'reciente@ejemplo.test', 'Dato reciente sintético', new Date().toISOString());
    setPlazoConservacion(db, 365, adminId, new Date());
    const r = anonimizarVencidos(db, new Date());
    expect(r).toEqual({ titulares: 0, registros: 1, consultas: 1 });
    expect(db.prepare('SELECT motivo FROM registros WHERE id = 3').get()).toEqual({ motivo: 'Anonimizado' });
    expect(db.prepare('SELECT cid, motivo FROM consultas_cid WHERE id = 3').get()).toEqual({ cid: 'anon-3', motivo: null });
    expect(db.prepare('SELECT cid, motivo FROM consultas_cid WHERE id = 4').get()).toEqual({ cid: 'reciente@ejemplo.test', motivo: 'Dato reciente sintético' });
  });
});
