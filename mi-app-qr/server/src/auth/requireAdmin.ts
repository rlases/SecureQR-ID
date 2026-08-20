import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

interface UserRoleRow {
  role: string;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'no autenticado' });
    return;
  }

  const db = req.app.locals.db as Database.Database;
  const user = db
    .prepare('SELECT role FROM users WHERE id = ?')
    .get(req.session.userId) as UserRoleRow | undefined;

  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'requiere permiso de administrador' });
    return;
  }

  next();
}
