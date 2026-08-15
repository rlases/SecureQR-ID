import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

const TEST_DB_PATH = './data/test-health.sqlite';

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('GET /api/health', () => {
  it('responde 200 con status ok', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);
    const app = createApp({ db, sessionSecret: 'test-secret' });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    db.close();
  });
});
