import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import { ConsultaError, IntegridadConsultaError, MAX_CIDS_POR_CONSULTA, consultarCids, listConsultas } from './consultas.js';
import {
  GestionError,
  archivoRevocados,
  desvincularDispositivo,
  exportarRevocados,
  listTitulares,
  reactivarTitular,
  revocarCredencial,
} from './gestion.js';
import { getPlazoConservacion, setPlazoConservacion } from './anonimizacion.js';
import {
  type CodigoProvisional,
  aprobarAlta,
  rechazarAlta,
  reemplazarRegistro,
  regenerarProvisional,
} from './revision.js';

// Rutas de admin sobre el registro de titulares. Ninguna está disponible para el
// operador: traducir un cid a una persona es solo del admin (ADR-0016, punto 7).

const consultaSchema = z.object({
  cids: z.array(z.string().max(64)).min(1).max(MAX_CIDS_POR_CONSULTA),
  motivo: z.string().trim().max(200).optional(),
});

const id = z.coerce.number().int().positive();
const motivoSchema = z.object({ motivo: z.string().trim().min(3).max(200) });
const estadoSchema = z.enum(['activo', 'en_revision', 'suspendido', 'reemplazado']).optional();
// Nota libre opcional y corta: la interfaz pide no escribir datos personales en ella.
const notaSchema = z.object({ nota: z.string().trim().max(200).optional() });
const reemplazoSchema = notaSchema.extend({
  motivo: z.enum(['misma_persona', 'registro_anterior_indebido']),
});

export function createTitularesRouter(opciones: { revocadosPath?: string } = {}): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const estado = estadoSchema.safeParse(req.query.estado || undefined);
    if (!estado.success) return res.status(400).json({ error: 'estado inválido' });
    const db = req.app.locals.db as Database.Database;
    res.set('Cache-Control', 'no-store');
    return res.json({ titulares: listTitulares(db, estado.data) });
  });

  // Revocar, desvincular y reactivar exigen un motivo, que queda en el registro de cambios.
  const acciones = {
    revocar: revocarCredencial,
    desvincular: desvincularDispositivo,
    reactivar: reactivarTitular,
  } as const;
  for (const [nombre, accion] of Object.entries(acciones)) {
    router.post(`/:id/${nombre}`, (req, res) => {
      const titularId = id.safeParse(req.params.id);
      const cuerpo = motivoSchema.safeParse(req.body);
      if (!titularId.success || !cuerpo.success) {
        return res.status(400).json({ error: 'escribe el motivo (al menos 3 caracteres)' });
      }
      const db = req.app.locals.db as Database.Database;
      try {
        accion(db, req.session.userId!, titularId.data, cuerpo.data.motivo, new Date());
        return res.json({ ok: true });
      } catch (error) {
        if (error instanceof GestionError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }
    });
  }

  // Resolución de altas en revisión (enmienda de 2026-10-24 a ADR-0016, issue #109).
  router.post('/:id/rechazar', (req, res) => {
    const titularId = id.safeParse(req.params.id);
    const cuerpo = notaSchema.safeParse(req.body ?? {});
    if (!titularId.success || !cuerpo.success) return res.status(400).json({ error: 'datos inválidos' });
    const db = req.app.locals.db as Database.Database;
    try {
      rechazarAlta(db, req.session.userId!, titularId.data, cuerpo.data.nota || null, new Date());
      return res.json({ ok: true });
    } catch (error) {
      if (error instanceof GestionError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  });

  // Las respuestas con código provisional: no-store, y el código no se registra en ningún lado.
  function conCodigo(
    accion: (db: Database.Database, usuarioId: number, titularId: number, body: unknown) => Promise<CodigoProvisional>
  ) {
    return async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      const titularId = id.safeParse(req.params.id);
      if (!titularId.success) return res.status(400).json({ error: 'datos inválidos' });
      const db = req.app.locals.db as Database.Database;
      try {
        return res.json(await accion(db, req.session.userId!, titularId.data, req.body ?? {}));
      } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'datos inválidos' });
        if (error instanceof GestionError) return res.status(error.status).json({ error: error.message });
        return res.status(500).json({ error: 'no se pudo resolver el alta' });
      }
    };
  }

  router.post(
    '/:id/reemplazar',
    conCodigo((db, usuarioId, titularId, body) => {
      const { motivo, nota } = reemplazoSchema.parse(body);
      return reemplazarRegistro(db, usuarioId, titularId, motivo, nota || null, new Date());
    })
  );

  router.post(
    '/:id/aprobar',
    conCodigo((db, usuarioId, titularId, body) => {
      const { nota } = notaSchema.parse(body);
      return aprobarAlta(db, usuarioId, titularId, nota || null, new Date());
    })
  );

  router.post(
    '/:id/regenerar-codigo',
    conCodigo((db, usuarioId, titularId) => regenerarProvisional(db, usuarioId, titularId, new Date()))
  );

  // Plazo de conservación de registros y consultas para un uso institucional posterior
  // (ADR-0016, punto 10). null = se conservan hasta el cierre del piloto.
  router.get('/conservacion', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    res.json({ plazoDias: getPlazoConservacion(db) });
  });

  router.put('/conservacion', (req, res) => {
    const parsed = z
      .object({ plazoDias: z.number().int().min(30).max(3650).nullable() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'el plazo va de 30 a 3650 días, o vacío' });
    }
    const db = req.app.locals.db as Database.Database;
    setPlazoConservacion(db, parsed.data.plazoDias, req.session.userId!, new Date());
    return res.json({ plazoDias: parsed.data.plazoDias });
  });

  // Archivo de cid revocados, sin firmar, para que el custodio lo firme (#81).
  router.get('/revocados.txt', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    res.set('Cache-Control', 'no-store');
    res.type('text/plain; charset=utf-8');
    res.attachment('revocados.txt');
    res.send(archivoRevocados(db, new Date()));
  });

  // «Exportar ahora» para casos urgentes: escribe el mismo archivo de la exportación diaria.
  router.post('/revocados/exportar', (req, res) => {
    if (!opciones.revocadosPath) {
      return res
        .status(409)
        .json({ error: 'no hay una ruta de exportación configurada; descarga el archivo' });
    }
    const db = req.app.locals.db as Database.Database;
    const cantidad = exportarRevocados(db, opciones.revocadosPath, new Date());
    return res.json({ cantidad, ruta: opciones.revocadosPath });
  });

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
