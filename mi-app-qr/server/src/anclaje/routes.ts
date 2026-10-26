import { Router } from 'express';
import { requireAdmin } from '../auth/requireAdmin.js';
import { leerEstadoAnclaje } from './estado.js';

// Estado del anclaje para el panel del admin (issue #139). Solo resúmenes: cantidades,
// fechas y el loteId, nunca eventos ni datos personales.
export function createAnclajeRouter(opciones: { estadoPath?: string } = {}): Router {
  const router = Router();
  router.use(requireAdmin);
  router.get('/estado', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(leerEstadoAnclaje(opciones.estadoPath, new Date()));
  });
  return router;
}
