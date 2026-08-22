import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

const TEST_DB_PATH = './data/test-db.sqlite';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('migraciones', () => {
  it('crea las tablas users y registros', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain('users');
    expect(tables).toContain('registros');
  });

  it('fuerza UNIQUE en username', () => {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);

    insertUser.run('user1', 'hash1', 'admin');
    expect(() => {
      insertUser.run('user1', 'hash2', 'operador');
    }).toThrow();
  });

  it("fuerza CHECK (role IN ('admin', 'operador'))", () => {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);

    expect(() => {
      insertUser.run('user1', 'hash1', 'docente');
    }).toThrow();
  });

  it('fuerza CHECK (tipo IN (\'entrada\', \'salida\'))', () => {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);
    const insertRegistro = db.prepare(`
      INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const userResult = insertUser.run('user1', 'hash1', 'admin');
    const userId = (userResult.lastInsertRowid as number);

    expect(() => {
      insertRegistro.run('Juan', '123456', 'admin', 'invalido', userId);
    }).toThrow();
  });

  it('fuerza FOREIGN KEY en creado_por_usuario_id', () => {
    const insertRegistro = db.prepare(`
      INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    expect(() => {
      insertRegistro.run('Juan', '123456', 'admin', 'entrada', 9999);
    }).toThrow();
  });

  it('fuerza el CHECK entre corrige_registro_id y motivo', () => {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);
    const insertRegistro = db.prepare(`
      INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const userResult = insertUser.run('user1', 'hash1', 'admin');
    const userId = userResult.lastInsertRowid as number;
    const original = insertRegistro.run('Juan', '123456', 'estudiante', 'entrada', userId);
    const originalId = original.lastInsertRowid as number;

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, corrige_registro_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, originalId);
    }).toThrow();

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, motivo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, 'typo en el nombre');
    }).toThrow();

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, corrige_registro_id, motivo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, originalId, 'typo en el nombre');
    }).not.toThrow();
  });
});
