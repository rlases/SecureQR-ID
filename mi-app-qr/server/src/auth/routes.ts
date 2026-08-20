import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { verifyPassword } from './passwords.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  cargo: string | null;
  failed_attempts: number;
  locked_until: string | null;
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

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'usuario y contraseña son obligatorios' });
    }
    const { username, password } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;

    if (!user) {
      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'cuenta bloqueada temporalmente por intentos fallidos' });
    }

    const validPassword = await verifyPassword(password, user.password_hash);

    if (!validPassword) {
      const attempts = user.failed_attempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
          : null;

      db.prepare(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'
      ).run(attempts, lockedUntil, user.id);

      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
    ).run(user.id);

    req.session.userId = user.id;
    res.json({ user: toPublicUser(user) });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'no autenticado' });
    }
    const db = req.app.locals.db as Database.Database;
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(req.session.userId) as UserRow | undefined;

    if (!user) {
      return res.status(401).json({ error: 'no autenticado' });
    }
    res.json({ user: toPublicUser(user) });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  return router;
}
