import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createRegistrosRouter } from './registros/routes.js';

export interface AppDependencies {
  db: Database.Database;
  sessionSecret: string;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware(deps.sessionSecret));
  app.locals.db = deps.db;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/registros', createRegistrosRouter());

  return app;
}
