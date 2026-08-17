import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';

const createRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
});

interface RegistroRow {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: string;
  timestamp: string;
  creado_por_usuario_id: number;
}

function toPublicRegistro(row: RegistroRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    documento: row.documento,
    rol: row.rol,
    tipo: row.tipo,
    timestamp: row.timestamp,
    creadoPorUsuarioId: row.creado_por_usuario_id,
  };
}

export function createRegistrosRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const parsed = createRegistroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de registro inválidos' });
    }
    const { nombre, documento, rol, tipo } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const result = db
      .prepare(
        `INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(nombre, documento, rol, tipo, req.session.userId);

    const row = db
      .prepare('SELECT * FROM registros WHERE id = ?')
      .get(result.lastInsertRowid) as RegistroRow;

    res.status(201).json({ registro: toPublicRegistro(row) });
  });

  router.get('/', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    const rows = db
      .prepare('SELECT * FROM registros ORDER BY timestamp DESC, id DESC')
      .all() as RegistroRow[];

    res.json({ registros: rows.map(toPublicRegistro) });
  });

  return router;
}
