import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createRegistrosRouter } from './registros/routes.js';
import { createUsersRouter } from './users/routes.js';
import { createEstamentosRouter } from './estamentos/routes.js';
import { createPortalRouter, huellaDeCertificado } from './portal/routes.js';
import { createTitularesRouter } from './titulares/routes.js';
import type { ClienteEmisor } from './emision/clienteEmisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_PATH = path.resolve(__dirname, '../../client/dist');

export interface AppDependencies {
  db: Database.Database;
  sessionSecret: string;
  secureCookies?: boolean;
  // Certificado TLS del servidor (ADR-0008): su huella se muestra en el portal del
  // titular para que la compare con la que muestra el navegador (ADR-0016).
  certificate?: Buffer;
  // Archivo donde se exportan, sin firmar, los cid revocados (ADR-0016, punto 9).
  revocadosExportPath?: string;
  // Altas permitidas por IP y hora en el portal del titular (issue #120).
  altaMaxPorIp?: number;
  // Cliente del servicio local de emisión de issuer/ (#85). Sin él, el portal no da QR.
  emisor?: ClienteEmisor;
  // Zona horaria de la sede (SITE_TIME_ZONE), la misma del reseteo trimestral.
  timeZone?: string;
  // Tokens por minuto que puede pedir un mismo teléfono.
  maxTokensPorMinuto?: number;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware(deps.sessionSecret, deps.secureCookies ?? false));
  app.locals.db = deps.db;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/registros', createRegistrosRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/estamentos', createEstamentosRouter());
  app.use('/api/titulares', createTitularesRouter({ revocadosPath: deps.revocadosExportPath }));
  app.use(
    '/api/portal',
    createPortalRouter({
      secureCookies: deps.secureCookies ?? false,
      huella: huellaDeCertificado(deps.certificate),
      altaMaxPorIp: deps.altaMaxPorIp,
      emisor: deps.emisor,
      timeZone: deps.timeZone,
      maxTokensPorMinuto: deps.maxTokensPorMinuto,
    })
  );

  // 404 explícito para cualquier ruta de /api que no exista — debe ir ANTES del
  // fallback estático, o el fallback SPA le devolvería HTML a una API rota.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'no encontrado' });
  });

  if (fs.existsSync(CLIENT_DIST_PATH)) {
    app.use(express.static(CLIENT_DIST_PATH));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
    });
  }

  return app;
}
