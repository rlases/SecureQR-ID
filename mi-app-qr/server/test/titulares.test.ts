import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  generateCid,
  generateTitularRef,
  isCanonicalCid,
} from '../src/titulares/identificadores.js';
import {
  ClaveAsignacionesError,
  GENESIS_HASH,
  appendAsignacion,
  claveAsignaciones,
  hashAsignacion,
  headAsignaciones,
  listAsignaciones,
  titularRefForCid,
  verifyAsignaciones,
} from '../src/titulares/asignaciones.js';
import {
  EstamentoInexistenteError,
  credencialVigente,
  historialCredenciales,
  registrarTitular,
} from '../src/titulares/repository.js';

// Datos sintéticos (SECURITY.md): ningún documento ni correo real.
const AHORA = new Date('2026-10-24T15:00:00.000Z');
let db: Database.Database;
let baseId: number;
let docenteId: number;

function crearEstamento(nombre: string, opciones: { base?: boolean; confirmacion?: boolean }) {
  return Number(
    db
      .prepare(
        `INSERT INTO estamentos (nombre, requiere_confirmacion, es_base, creado_en)
         VALUES (?, ?, ?, ?)`
      )
      .run(nombre, opciones.confirmacion ? 1 : 0, opciones.base ? 1 : 0, AHORA.toISOString())
      .lastInsertRowid
  );
}

function alta(documento: string, estamentoId = baseId) {
  return registrarTitular(
    db,
    { nombre: 'Titular Sintético', documento, correo: 'titular@ejemplo.test', estamentoId },
    AHORA
  );
}

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  baseId = crearEstamento('Estudiante', { base: true });
  docenteId = crearEstamento('Docente', { confirmacion: true });
});

afterEach(() => {
  db.close();
});

describe('identificadores', () => {
  it('genera cid canónicos de 128 bits que no empiezan por «-»', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const cid = generateCid();
      expect(isCanonicalCid(cid)).toBe(true);
      expect(cid.startsWith('-')).toBe(false);
      expect(Buffer.from(cid, 'base64url')).toHaveLength(16);
      vistos.add(cid);
    }
    expect(vistos.size).toBe(2000);
  });

  it('rechaza formas no canónicas del cid', () => {
    expect(isCanonicalCid('A'.repeat(21))).toBe(false);
    expect(isCanonicalCid('A'.repeat(22) + '=')).toBe(false);
    expect(isCanonicalCid('A'.repeat(21) + '+')).toBe(false);
    // El último carácter solo aporta 2 bits: «B» deja bits de relleno distintos de cero.
    expect(isCanonicalCid('A'.repeat(21) + 'B')).toBe(false);
    expect(isCanonicalCid('A'.repeat(22))).toBe(true);
  });

  it('el identificador interno del titular es opaco y distinto en cada alta', () => {
    expect(generateTitularRef()).not.toBe(generateTitularRef());
  });
});

describe('migración', () => {
  it('crea las tablas del registro de credenciales', () => {
    const tablas = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    for (const nombre of [
      'estamentos',
      'titulares',
      'credenciales',
      'dispositivos',
      'asignaciones_cid',
    ]) {
      expect(tablas).toContain(nombre);
    }
  });

  it('es idempotente sobre una base existente', () => {
    alta('1000000001');
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM titulares').get()).toEqual({ n: 1 });
  });

  it('ninguna columna guarda llaves o códigos en claro, solo hashes', () => {
    const columnas = (tabla: string) =>
      (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map(
        (c) => c.name
      );
    const todas = ['titulares', 'credenciales', 'dispositivos', 'asignaciones_cid'].flatMap(
      columnas
    );
    const sensibles = todas.filter((c) => /llave|codigo|clave|secreto|password|token/.test(c));
    expect(sensibles.sort()).toEqual(['codigo_recuperacion_hash', 'llave_hash']);
  });

  it('admite como mucho un estamento base', () => {
    expect(() => crearEstamento('Otro', { base: true })).toThrow();
  });

  it('el estamento base no puede requerir confirmación', () => {
    db.prepare('UPDATE estamentos SET es_base = 0 WHERE id = ?').run(baseId);
    expect(() => crearEstamento('Base con confirmación', { base: true, confirmacion: true })).toThrow();
  });
});

describe('alta de titulares', () => {
  it('crea titular activo con una credencial vigente y su asignación', () => {
    const { titular, cid } = alta('1000000001');
    expect(titular.estado).toBe('activo');
    expect(titular.estamentoConfirmado).toBe(true);
    expect(cid).not.toBeNull();
    expect(isCanonicalCid(cid!)).toBe(true);
    expect(credencialVigente(db, titular.id)?.cid).toBe(cid);
    expect(titularRefForCid(db, cid!)).toBe(titular.ref);
  });

  it('un estamento que requiere confirmación queda pendiente', () => {
    const { titular } = alta('1000000002', docenteId);
    expect(titular.estamentoId).toBe(docenteId);
    expect(titular.estamentoConfirmado).toBe(false);
  });

  it('rechaza un estamento que no existe sin dejar nada a medias', () => {
    expect(() => alta('1000000003', 9999)).toThrow(EstamentoInexistenteError);
    expect(db.prepare('SELECT COUNT(*) AS n FROM titulares').get()).toEqual({ n: 0 });
    expect(listAsignaciones(db)).toHaveLength(0);
  });

  it('un documento repetido deja el alta en revisión y sin credencial', () => {
    alta('1000000004');
    const segunda = alta('1000000004');
    expect(segunda.titular.estado).toBe('en_revision');
    expect(segunda.cid).toBeNull();
    expect(credencialVigente(db, segunda.titular.id)).toBeNull();
  });

  it('el índice impide dos registros vigentes con el mismo documento', () => {
    alta('1000000005');
    const enRevision = alta('1000000005');
    expect(() =>
      db.prepare("UPDATE titulares SET estado = 'activo' WHERE id = ?").run(enRevision.titular.id)
    ).toThrow();
  });

  it('el correo no es único: no bloquea el alta de otra persona', () => {
    alta('1000000006');
    expect(alta('1000000007').titular.estado).toBe('activo');
  });
});

describe('historial de credenciales', () => {
  it('una credencial nunca se borra ni cambia de cid o titular', () => {
    const { titular, cid } = alta('1000000010');
    expect(() => db.prepare('DELETE FROM credenciales WHERE cid = ?').run(cid)).toThrow(
      /nunca se borra/
    );
    expect(() =>
      db.prepare('UPDATE credenciales SET cid = ? WHERE titular_id = ?').run(generateCid(), titular.id)
    ).toThrow();
    expect(() =>
      db.prepare('UPDATE credenciales SET titular_id = 999 WHERE cid = ?').run(cid)
    ).toThrow();
  });

  it('una credencial reemplazada no vuelve a vigente y conserva su historial', () => {
    const { titular, cid } = alta('1000000011');
    db.prepare(
      "UPDATE credenciales SET estado = 'reemplazada', vigente_hasta = ? WHERE cid = ?"
    ).run(AHORA.toISOString(), cid);
    expect(() =>
      db
        .prepare("UPDATE credenciales SET estado = 'vigente', vigente_hasta = NULL WHERE cid = ?")
        .run(cid)
    ).toThrow(/no vuelve atrás/);
    expect(historialCredenciales(db, titular.id).map((c) => c.cid)).toEqual([cid]);
  });

  it('impide dos credenciales vigentes para un mismo titular', () => {
    const { titular } = alta('1000000012');
    expect(() =>
      db
        .prepare(
          "INSERT INTO credenciales (cid, titular_id, estado, vigente_desde) VALUES (?, ?, 'vigente', ?)"
        )
        .run(generateCid(), titular.id, AHORA.toISOString())
    ).toThrow();
  });

  it('un titular se anonimiza, no se borra', () => {
    const { titular } = alta('1000000013');
    expect(() => db.prepare('DELETE FROM titulares WHERE id = ?').run(titular.id)).toThrow(
      /anonimiza/
    );
  });
});

describe('dispositivos', () => {
  const llave = (n: number) => n.toString(16).padStart(64, '0');

  it('solo un dispositivo activo por titular y nunca se borra', () => {
    const { titular } = alta('1000000020');
    const vincular = db.prepare(
      "INSERT INTO dispositivos (titular_id, llave_hash, estado, vinculado_en) VALUES (?, ?, 'activo', ?)"
    );
    vincular.run(titular.id, llave(1), AHORA.toISOString());
    expect(() => vincular.run(titular.id, llave(2), AHORA.toISOString())).toThrow();
    expect(() => db.prepare('DELETE FROM dispositivos').run()).toThrow(/nunca se borra/);
  });

  it('solo guarda un hash SHA-256 y un dispositivo desactivado no vuelve', () => {
    const { titular } = alta('1000000021');
    expect(() =>
      db
        .prepare(
          "INSERT INTO dispositivos (titular_id, llave_hash, estado, vinculado_en) VALUES (?, ?, 'activo', ?)"
        )
        .run(titular.id, 'llave-en-claro', AHORA.toISOString())
    ).toThrow();
    db.prepare(
      "INSERT INTO dispositivos (titular_id, llave_hash, estado, vinculado_en) VALUES (?, ?, 'activo', ?)"
    ).run(titular.id, llave(3), AHORA.toISOString());
    db.prepare(
      "UPDATE dispositivos SET estado = 'revocado', desactivado_en = ? WHERE llave_hash = ?"
    ).run(AHORA.toISOString(), llave(3));
    expect(() =>
      db
        .prepare(
          "UPDATE dispositivos SET estado = 'activo', desactivado_en = NULL WHERE llave_hash = ?"
        )
        .run(llave(3))
    ).toThrow(/no vuelve/);
  });
});

describe('historial encadenado cid → titular', () => {
  it('encadena cada asignación desde el génesis y verifica', () => {
    alta('1000000030');
    alta('1000000031');
    const cadena = listAsignaciones(db);
    expect(cadena).toHaveLength(2);
    expect(cadena[0].hashAnterior).toBe(GENESIS_HASH);
    expect(cadena[1].hashAnterior).toBe(cadena[0].hash);
    expect(headAsignaciones(db)).toBe(cadena[1].hash);
    expect(verifyAsignaciones(db)).toBe(true);
  });

  it('no guarda datos personales, solo el identificador opaco', () => {
    const { titular } = alta('1000000032');
    const fila = JSON.stringify(db.prepare('SELECT * FROM asignaciones_cid').get());
    expect(fila).not.toContain(titular.documento);
    expect(fila).not.toContain(titular.nombre);
    expect(fila).not.toContain(titular.correo);
    expect(fila).toContain(titular.ref);
  });

  it('los disparadores impiden reescribir o borrar asignaciones', () => {
    alta('1000000033');
    expect(() => db.prepare("UPDATE asignaciones_cid SET titular_ref = 'otro'").run()).toThrow(
      /solo agregar/
    );
    expect(() => db.prepare('DELETE FROM asignaciones_cid').run()).toThrow(/solo agregar/);
  });

  it('detecta una reasignación aunque se quiten los disparadores', () => {
    const { cid } = alta('1000000034');
    alta('1000000035');
    // Quien tiene el archivo puede quitar los disparadores, pero no recalcular la cadena
    // sin que se note.
    db.exec('DROP TRIGGER asignaciones_cid_no_update');
    db.prepare('UPDATE asignaciones_cid SET titular_ref = ? WHERE cid = ?').run(
      generateTitularRef(),
      cid
    );
    expect(verifyAsignaciones(db)).toBe(false);
  });

  // Hallazgo P1 de #102: con SHA-256 sin clave, quien tiene el archivo reescribía la fila
  // y recalculaba todos los eslabones siguientes, y la verificación seguía dando verdadero.
  function reescribirCadena(
    cid: string,
    otraRef: string,
    sello: (anterior: string, a: { titularRef: string; cid: string; motivo: 'alta' | 'reseteo' | 'reactivacion'; asignadoEn: string }) => string
  ) {
    db.exec('DROP TRIGGER asignaciones_cid_no_update');
    let anterior = GENESIS_HASH;
    for (const a of listAsignaciones(db)) {
      const titularRef = a.cid === cid ? otraRef : a.titularRef;
      const hash = sello(anterior, { ...a, titularRef });
      db.prepare(
        'UPDATE asignaciones_cid SET titular_ref = ?, hash_anterior = ?, hash = ? WHERE seq = ?'
      ).run(titularRef, anterior, hash, a.seq);
      anterior = hash;
    }
  }

  it('detecta una reasignación con la cadena recalculada sin la clave', () => {
    const { cid } = alta('1000000040');
    alta('1000000041');
    reescribirCadena(cid!, generateTitularRef(), (anterior, a) =>
      crypto
        .createHash('sha256')
        .update(JSON.stringify([anterior, a.titularRef, a.cid, a.motivo, a.asignadoEn]), 'utf8')
        .digest('hex')
    );
    expect(verifyAsignaciones(db)).toBe(false);
  });

  it('detecta una reasignación con la cadena recalculada con otra clave', () => {
    const { cid } = alta('1000000042');
    alta('1000000043');
    const otraClave = crypto.randomBytes(32);
    reescribirCadena(cid!, generateTitularRef(), (anterior, a) =>
      hashAsignacion(anterior, a.titularRef, a.cid, a.motivo, a.asignadoEn, otraClave)
    );
    expect(verifyAsignaciones(db)).toBe(false);
    // Control: con la clave correcta la misma reescritura sí pasaría; por eso la clave
    // vive fuera de la base.
    expect(verifyAsignaciones(db, otraClave)).toBe(true);
  });

  it('exige una clave de 32 bytes en hexadecimal', () => {
    expect(() => claveAsignaciones({})).toThrow(ClaveAsignacionesError);
    expect(() => claveAsignaciones({ ASIGNACIONES_KEY: 'ab'.repeat(16) })).toThrow(ClaveAsignacionesError);
    expect(() => claveAsignaciones({ ASIGNACIONES_KEY: 'zz'.repeat(32) })).toThrow(ClaveAsignacionesError);
    expect(claveAsignaciones({ ASIGNACIONES_KEY: 'ab'.repeat(32) })).toHaveLength(32);
  });

  it('detecta un eslabón quitado del medio', () => {
    alta('1000000036');
    alta('1000000037');
    alta('1000000038');
    db.exec('DROP TRIGGER asignaciones_cid_no_delete');
    db.prepare('DELETE FROM asignaciones_cid WHERE seq = 2').run();
    expect(verifyAsignaciones(db)).toBe(false);
  });

  it('resuelve un cid antiguo aunque el titular ya tenga otro', () => {
    const { titular, cid } = alta('1000000039');
    db.transaction(() => {
      db.prepare(
        "UPDATE credenciales SET estado = 'reemplazada', vigente_hasta = ? WHERE cid = ?"
      ).run(AHORA.toISOString(), cid);
      const nuevo = generateCid();
      db.prepare(
        "INSERT INTO credenciales (cid, titular_id, estado, vigente_desde) VALUES (?, ?, 'vigente', ?)"
      ).run(nuevo, titular.id, AHORA.toISOString());
      appendAsignacion(db, titular.ref, nuevo, 'reseteo', AHORA.toISOString());
    })();
    expect(titularRefForCid(db, cid!)).toBe(titular.ref);
    expect(verifyAsignaciones(db)).toBe(true);
  });
});
