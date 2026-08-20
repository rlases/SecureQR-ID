import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { verifyPassword } from '../src/auth/passwords.js';

const TEST_DB_PATH = './data/test-seed.sqlite';

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('seedAdminUser', () => {
  it('crea un usuario admin si no existe ninguno', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);

    await seedAdminUser(db, { username: 'admin', password: 'cambia-esto-ya' });

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get('admin') as { password_hash: string; role: string } | undefined;

    expect(user).toBeDefined();
    expect(user!.role).toBe('admin');
    expect(await verifyPassword('cambia-esto-ya', user!.password_hash)).toBe(true);
    db.close();
  });

  it('no duplica el admin si ya existe', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);

    await seedAdminUser(db, { username: 'admin', password: 'primera' });
    await seedAdminUser(db, { username: 'admin', password: 'segunda' });

    const count = db
      .prepare('SELECT COUNT(*) as c FROM users WHERE username = ?')
      .get('admin') as { c: number };

    expect(count.c).toBe(1);
    db.close();
  });
});
