import { Router } from 'express';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import { hashPassword } from '../auth/passwords.js';

const createUserSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['admin', 'operador']),
  cargo: z.string().min(1).optional(),
});

interface UserRow {
  id: number;
  username: string;
  role: string;
  cargo: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    cargo: row.cargo,
    createdAt: row.created_at,
  };
}

function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function createUsersRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.post('/', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de usuario inválidos' });
    }
    const { username, role, cargo } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const generatedPassword = generatePassword();
    const passwordHash = await hashPassword(generatedPassword);

    let result;
    try {
      result = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, cargo) VALUES (?, ?, ?, ?)`
        )
        .run(username, passwordHash, role, cargo ?? null);
    } catch (error) {
      return res.status(409).json({ error: 'ese nombre de usuario ya existe' });
    }

    const row = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(result.lastInsertRowid) as UserRow;

    res.status(201).json({ user: toPublicUser(row), generatedPassword });
  });

  router.get('/', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    const rows = db
      .prepare('SELECT id, username, role, cargo, created_at FROM users ORDER BY created_at DESC')
      .all() as UserRow[];

    res.json({ users: rows.map(toPublicUser) });
  });

  return router;
}
