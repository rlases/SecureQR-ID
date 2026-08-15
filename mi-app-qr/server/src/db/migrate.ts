import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      documento TEXT NOT NULL,
      rol TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      creado_por_usuario_id INTEGER NOT NULL,
      FOREIGN KEY (creado_por_usuario_id) REFERENCES users(id)
    );
  `);
}
