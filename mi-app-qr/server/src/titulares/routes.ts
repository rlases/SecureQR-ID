import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import { ConsultaError, IntegridadConsultaError, MAX_CIDS_POR_CONSULTA, consultarCids, listConsultas } from './consultas.js';

// Rutas de admin sobre el registro de titulares. Ninguna está disponible para el
// operador: traducir un cid a una persona es solo del admin (ADR-0016, punto 7).

const consultaSchema = z.object({
  cids: z.array(z.string().max(64)).min(1).max(MAX_CIDS_POR_CONSULTA),
  motivo: z.string().trim().max(200).optional(),
});

export function createTitularesRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.post('/consultas', (req, res) => {
    const parsed = consultaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'escribe entre 1 y 200 cid' });
    }
    const db = req.app.locals.db as Database.Database;
    try {
      const resultados = consultarCids(
        db,
        req.session.userId!,
        parsed.data.cids,
        parsed.data.motivo || null,
        new Date()
      );
      // Datos personales: que no queden en ninguna caché intermedia.
      res.set('Cache-Control', 'no-store');
      return res.json({ resultados });
    } catch (error) {
      if (error instanceof IntegridadConsultaError) {
        res.set('Cache-Control', 'no-store');
        return res.status(503).json({ error: error.message });
      }
      if (error instanceof ConsultaError) return res.status(400).json({ error: error.message });
      throw error;
    }
  });

  router.get('/consultas', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    res.json({ consultas: listConsultas(db) });
  });

  return router;
}
