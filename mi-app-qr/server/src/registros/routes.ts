import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireAdmin } from '../auth/requireAdmin.js';

const createRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
});

const corregirRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
  timestamp: z.string().min(1),
  motivo: z.string().min(1),
});

interface RegistroRow {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: string;
  timestamp: string;
  creado_por_usuario_id: number;
  corrige_registro_id: number | null;
  motivo: string | null;
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
    corrigeRegistroId: row.corrige_registro_id,
    motivo: row.motivo,
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
      .prepare(
        `SELECT * FROM registros
         WHERE id NOT IN (
           SELECT corrige_registro_id FROM registros WHERE corrige_registro_id IS NOT NULL
         )
         ORDER BY timestamp DESC, id DESC`
      )
      .all() as RegistroRow[];

    res.json({ registros: rows.map(toPublicRegistro) });
  });

  router.get('/:id/historial', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id de registro inválido' });
    }

    const db = req.app.locals.db as Database.Database;
    const findRegistro = db.prepare('SELECT * FROM registros WHERE id = ?');
    const historial: RegistroRow[] = [];
    const visitados = new Set<number>();
    let currentId: number | null = id;

    while (currentId !== null) {
      if (visitados.has(currentId)) {
        return res.status(409).json({ error: 'cadena de correcciones inconsistente' });
      }
      visitados.add(currentId);

      const row = findRegistro.get(currentId) as RegistroRow | undefined;
      if (!row) {
        if (historial.length === 0) {
          return res.status(404).json({ error: 'registro no encontrado' });
        }
        return res.status(409).json({ error: 'cadena de correcciones inconsistente' });
      }

      historial.push(row);
      currentId = row.corrige_registro_id;
    }

    res.json({ historial: historial.reverse().map(toPublicRegistro) });
  });

  router.post('/:id/correcciones', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id de registro inválido' });
    }

    const parsed = corregirRegistroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de corrección inválidos' });
    }

    const db = req.app.locals.db as Database.Database;

    const original = db.prepare('SELECT id FROM registros WHERE id = ?').get(id);
    if (!original) {
      return res.status(404).json({ error: 'registro no encontrado' });
    }

    const yaCorregido = db
      .prepare('SELECT id FROM registros WHERE corrige_registro_id = ?')
      .get(id);
    if (yaCorregido) {
      return res.status(409).json({
        error: 'este registro ya tiene una corrección más reciente; corrige esa en su lugar',
      });
    }

    const { nombre, documento, rol, tipo, timestamp, motivo } = parsed.data;
    const result = db
      .prepare(
        `INSERT INTO registros
           (nombre, documento, rol, tipo, timestamp, creado_por_usuario_id, corrige_registro_id, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nombre, documento, rol, tipo, timestamp, req.session.userId, id, motivo);

    const row = db
      .prepare('SELECT * FROM registros WHERE id = ?')
      .get(result.lastInsertRowid) as RegistroRow;

    res.status(201).json({ registro: toPublicRegistro(row) });
  });

  return router;
}
