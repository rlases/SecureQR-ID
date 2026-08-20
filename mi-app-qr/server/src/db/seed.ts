import type Database from 'better-sqlite3';
import { hashPassword } from '../auth/passwords.js';

interface SeedAdminOptions {
  username: string;
  password: string;
}

export async function seedAdminUser(
  db: Database.Database,
  options: SeedAdminOptions
): Promise<void> {
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(options.username);

  if (existing) return;

  const passwordHash = await hashPassword(options.password);

  db.prepare(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`
  ).run(options.username, passwordHash, 'admin');
}
