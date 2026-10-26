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
import { crearEstamento } from '../src/estamentos/config.js';
import { registrarTitular } from '../src/titulares/repository.js';
import { claveAsignaciones, hashAsignacion, listAsignaciones } from '../src/titulares/asignaciones.js';
import {
  FUENTE,
  cabezaAsignaciones,
  escribirCabeza,
  verificarContraCompromisos,
} from '../src/titulares/compromiso.js';

// Compromiso externo de la cabeza de asignaciones_cid (#119). El archivo de compromisos
// que aquí se escribe a mano es el que produce `evidence-log export-commitments`
// (evidence-log/tests/test_compromisos.py cubre ese lado). Datos sintéticos.
let dir: string;
let db: Database.Database;
let estamento: number;

function alta(documento: string) {
  return registrarTitular(
    db,
    { nombre: 'Titular Sintético', documento, correo: 't@ejemplo.test', estamentoId: estamento },
    new Date()
  );
}

let archivos = 0;
function compromisos(lista: { seq: number; hash: string; anclado: boolean }[], cadenaValida = true) {
  const archivo = path.join(dir, `compromisos-${++archivos}.json`);
  fs.writeFileSync(
    archivo,
    JSON.stringify({
      version: 1,
      cadena_valida: cadenaValida,
      compromisos: lista.map((c, i) => ({
        fuente: FUENTE,
        ...c,
        evento: 100 + i,
        batch_id: c.anclado ? `ccav:seq-${100 + i}` : null,
        transaction_id: c.anclado ? `tx-${i}` : null,
        block_number: c.anclado ? 7 + i : null,
      })),
    })
  );
  return archivo;
}

/**
 * Lo que puede hacer quien controla el servidor completo: quitar los disparadores,
 * reasignar un cid a otra persona y recalcular toda la cadena con la clave HMAC real.
 */
function reescribirConLaClave(seqReasignado: number, nuevoRef: string) {
  db.exec('DROP TRIGGER asignaciones_cid_no_update');
  const clave = claveAsignaciones();
  let anterior = '0'.repeat(64);
  for (const a of listAsignaciones(db)) {
    const ref = a.seq === seqReasignado ? nuevoRef : a.titularRef;
    const hash = hashAsignacion(anterior, ref, a.cid, a.motivo, a.asignadoEn, clave);
    db.prepare('UPDATE asignaciones_cid SET titular_ref = ?, hash_anterior = ?, hash = ? WHERE seq = ?').run(
      ref,
      anterior,
      hash,
      a.seq
    );
    anterior = hash;
  }
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureqr-compromiso-'));
  db = openDatabase(path.join(dir, 'test.sqlite'));
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  estamento = crearEstamento(db, adminId, { nombre: 'Estudiante', requiereConfirmacion: false }, new Date()).id;
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cabeza de la cadena', () => {
  it('sin asignaciones es seq 0 con el hash génesis', () => {
    expect(cabezaAsignaciones(db)).toEqual({ seq: 0, hash: '0'.repeat(64) });
  });

  it('se escribe con solo seq y hash, sin datos personales', () => {
    alta('9200000001');
    alta('9200000002');
    const destino = path.join(dir, 'anclaje', 'cabeza.json');
    const cabeza = escribirCabeza(db, destino, new Date('2026-10-25T12:00:00Z'));
    const archivo = JSON.parse(fs.readFileSync(destino, 'utf8'));
    expect(archivo).toEqual({
      version: 1,
      fuente: 'asignaciones_cid',
      seq: 2,
      hash: cabeza.hash,
      generado_en: '2026-10-25T12:00:00.000Z',
    });
    expect(archivo.hash).toMatch(/^[0-9a-f]{64}$/);
    const texto = fs.readFileSync(destino, 'utf8');
    expect(texto).not.toContain('9200000001');
    expect(texto).not.toContain('Sintético');
    // Ni el cid ni la referencia del titular salen en el archivo.
    for (const a of listAsignaciones(db)) {
      expect(texto).not.toContain(a.cid);
      expect(texto).not.toContain(a.titularRef);
    }
  });
});

describe('verificación contra los compromisos anclados', () => {
  it('sin archivo de compromisos rige solo el HMAC', () => {
    expect(verificarContraCompromisos(db, path.join(dir, 'no-existe.json'))).toEqual({ estado: 'sin_compromisos' });
  });

  it('un historial intacto coincide con lo anclado', () => {
    alta('9200000010');
    const comprometida = cabezaAsignaciones(db);
    alta('9200000011'); // posterior al compromiso: no lo contradice
    const archivo = compromisos([
      { ...comprometida, anclado: true },
      { ...cabezaAsignaciones(db), anclado: false },
    ]);
    expect(verificarContraCompromisos(db, archivo)).toEqual({
      estado: 'ok',
      ultimoAnclado: { seq: comprometida.seq, transactionId: 'tx-0', blockNumber: 7 },
    });
  });

  it('detecta una reescritura con la clave real, anterior al compromiso anclado', () => {
    const victima = alta('9200000020');
    alta('9200000021');
    const archivo = compromisos([{ ...cabezaAsignaciones(db), anclado: true }]);
    const intrusa = alta('9200000022').titular.ref;
    reescribirConLaClave(1, intrusa);
    // El HMAC no lo nota: la cadena se recalculó con la clave.
    expect(verificarContraCompromisos(db, compromisos([]))).toMatchObject({ estado: 'ok' });
    const r = verificarContraCompromisos(db, archivo);
    expect(r).toEqual({ estado: 'alerta', detalle: expect.stringContaining('no coincide') });
    expect(victima.titular.ref).not.toBe(intrusa);
  });

  it('detecta el truncamiento de asignaciones ya comprometidas', () => {
    alta('9200000030');
    alta('9200000031');
    const archivo = compromisos([{ ...cabezaAsignaciones(db), anclado: true }]);
    db.exec('DROP TRIGGER asignaciones_cid_no_delete');
    db.prepare('DELETE FROM asignaciones_cid WHERE seq = 2').run();
    expect(verificarContraCompromisos(db, archivo)).toEqual({
      estado: 'alerta',
      detalle: expect.stringContaining('Falta la asignación 2'),
    });
  });

  it('un compromiso que todavía no está anclado no basta para dar por buena la cadena', () => {
    alta('9200000040');
    const archivo = compromisos([{ seq: 1, hash: 'f'.repeat(64), anclado: false }]);
    expect(verificarContraCompromisos(db, archivo)).toEqual({ estado: 'ok', ultimoAnclado: null });
  });

  it('si evidence-log dice que su bitácora no verifica, es alerta', () => {
    alta('9200000050');
    const archivo = compromisos([{ ...cabezaAsignaciones(db), anclado: true }], false);
    expect(verificarContraCompromisos(db, archivo)).toMatchObject({ estado: 'alerta' });
  });

  it('un archivo ilegible o de otro formato es alerta, no se ignora', () => {
    const archivo = path.join(dir, 'roto.json');
    fs.writeFileSync(archivo, '{no es json');
    expect(verificarContraCompromisos(db, archivo)).toMatchObject({ estado: 'alerta' });
    fs.writeFileSync(archivo, JSON.stringify({ version: 2, compromisos: [] }));
    expect(verificarContraCompromisos(db, archivo)).toMatchObject({ estado: 'alerta' });
  });
});

describe('GET /api/titulares/integridad', () => {
  it('solo admin, sin caché, con la cabeza y la verificación', async () => {
    alta('9200000060');
    const archivo = compromisos([{ ...cabezaAsignaciones(db), anclado: true }]);
    const app = createApp({ db, sessionSecret: 'test-secret', compromisosPath: archivo });
    expect((await request(app).get('/api/titulares/integridad')).status).toBe(401);
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
    const res = await admin.get('/api/titulares/integridad');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.cabeza.seq).toBe(1);
    expect(res.body.verificacion.estado).toBe('ok');
  });
});
