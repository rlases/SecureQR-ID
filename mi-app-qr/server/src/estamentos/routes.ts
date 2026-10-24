import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import {
  ConfigError,
  actualizarEstamento,
  borrarDominio,
  borrarEstamento,
  borrarExcepcion,
  cambiarEstamentoTitular,
  crearDominio,
  crearEstamento,
  crearExcepcion,
  elegirBase,
  listCambios,
  listDominios,
  listEstamentos,
  listExcepciones,
  reemplazarVentanas,
} from './config.js';

// Panel de admin para estamentos, ventanas, excepciones y dominios (issue #89). Todo
// cambio queda registrado con quién lo hizo; ver config.ts.

const id = z.coerce.number().int().positive();
const hora = z.string();

const crearEstamentoSchema = z.object({
  nombre: z.string().min(1).max(60),
  requiereConfirmacion: z.boolean().default(false),
});
const actualizarEstamentoSchema = z
  .object({
    nombre: z.string().min(1).max(60).optional(),
    requiereConfirmacion: z.boolean().optional(),
  })
  .refine((v) => v.nombre !== undefined || v.requiereConfirmacion !== undefined);
const ventanasSchema = z.object({
  ventanas: z
    .array(z.object({ diaSemana: z.number().int(), inicio: hora, fin: hora }))
    .max(70),
});
const excepcionSchema = z.object({
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  tipo: z.enum(['cierre', 'reemplazo']),
  estamentoId: id.nullable(),
  descripcion: z.string().min(1).max(120),
  ventanas: z.array(z.object({ inicio: hora, fin: hora })).max(10).default([]),
});
const dominioSchema = z.object({ dominio: z.string().min(1).max(253), estamentoId: id });
const estamentoTitularSchema = z.object({ estamentoId: id });

type Handler = (db: Database.Database, usuarioId: number, req: Request) => unknown;

// Envuelve cada operación: valida, ejecuta y traduce ConfigError a su estado HTTP.
function handle(status: number, fn: Handler) {
  return (req: Request, res: Response) => {
    const db = req.app.locals.db as Database.Database;
    try {
      const body = fn(db, req.session.userId!, req);
      if (status === 204) return res.status(204).end();
      return res.status(status).json(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'datos inválidos' });
      }
      if (error instanceof ConfigError) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }
  };
}

export function createEstamentosRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get(
    '/',
    handle(200, (db) => ({
      estamentos: listEstamentos(db),
      excepciones: listExcepciones(db),
      dominios: listDominios(db),
    }))
  );

  router.post(
    '/',
    handle(201, (db, usuario, req) =>
      crearEstamento(db, usuario, crearEstamentoSchema.parse(req.body), new Date())
    )
  );

  router.patch(
    '/:id',
    handle(200, (db, usuario, req) =>
      actualizarEstamento(
        db,
        usuario,
        id.parse(req.params.id),
        actualizarEstamentoSchema.parse(req.body),
        new Date()
      )
    )
  );

  router.post(
    '/:id/base',
    handle(200, (db, usuario, req) => elegirBase(db, usuario, id.parse(req.params.id), new Date()))
  );

  router.delete(
    '/:id',
    handle(204, (db, usuario, req) =>
      borrarEstamento(db, usuario, id.parse(req.params.id), new Date())
    )
  );

  router.put(
    '/:id/ventanas',
    handle(200, (db, usuario, req) => ({
      ventanas: reemplazarVentanas(
        db,
        usuario,
        id.parse(req.params.id),
        ventanasSchema.parse(req.body).ventanas,
        new Date()
      ),
    }))
  );

  router.post(
    '/excepciones',
    handle(201, (db, usuario, req) =>
      crearExcepcion(db, usuario, excepcionSchema.parse(req.body), new Date())
    )
  );

  router.delete(
    '/excepciones/:id',
    handle(204, (db, usuario, req) =>
      borrarExcepcion(db, usuario, id.parse(req.params.id), new Date())
    )
  );

  router.post(
    '/dominios',
    handle(201, (db, usuario, req) =>
      crearDominio(db, usuario, dominioSchema.parse(req.body), new Date())
    )
  );

  router.delete(
    '/dominios/:id',
    handle(204, (db, usuario, req) => borrarDominio(db, usuario, id.parse(req.params.id), new Date()))
  );

  router.get(
    '/cambios',
    handle(200, (db) => ({ cambios: listCambios(db) }))
  );

  // Asignar o confirmar el estamento de un titular.
  router.put(
    '/titulares/:id',
    handle(200, (db, usuario, req) =>
      cambiarEstamentoTitular(
        db,
        usuario,
        id.parse(req.params.id),
        estamentoTitularSchema.parse(req.body).estamentoId,
        new Date()
      )
    )
  );

  return router;
}
