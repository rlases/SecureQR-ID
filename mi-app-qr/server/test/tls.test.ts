import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import selfsigned from 'selfsigned';
import { loadTlsOptionsFromEnv } from '../src/tls.js';

const ENV_KEYS = ['TLS_CERT_PATH', 'TLS_KEY_PATH'] as const;
const originalEnv: Record<string, string | undefined> = {};

function clearTlsEnv() {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreTlsEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

describe('loadTlsOptionsFromEnv', () => {
  afterEach(() => {
    restoreTlsEnv();
  });

  it('devuelve null si faltan TLS_CERT_PATH o TLS_KEY_PATH', () => {
    clearTlsEnv();
    expect(loadTlsOptionsFromEnv()).toBeNull();

    process.env.TLS_CERT_PATH = '/tmp/no-existe-cert.pem';
    expect(loadTlsOptionsFromEnv()).toBeNull();
  });

  it('lee cert y key reales cuando ambas variables están presentes', () => {
    clearTlsEnv();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-app-qr-server-tls-'));
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      days: 1,
    });
    const certPath = path.join(dir, 'cert.pem');
    const keyPath = path.join(dir, 'key.pem');
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);

    process.env.TLS_CERT_PATH = certPath;
    process.env.TLS_KEY_PATH = keyPath;

    const tls = loadTlsOptionsFromEnv();
    expect(tls).not.toBeNull();
    expect(tls?.cert.toString('utf-8')).toContain('BEGIN CERTIFICATE');
    expect(tls?.key.toString('utf-8')).toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });

  it('las opciones resultantes sirven para levantar un servidor https real', async () => {
    clearTlsEnv();
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      days: 1,
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-app-qr-server-tls-'));
    const certPath = path.join(dir, 'cert.pem');
    const keyPath = path.join(dir, 'key.pem');
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    process.env.TLS_CERT_PATH = certPath;
    process.env.TLS_KEY_PATH = keyPath;

    const tls = loadTlsOptionsFromEnv();
    const server = https.createServer(tls!, (_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const body = await new Promise<string>((resolve, reject) => {
      https
        .get(`https://localhost:${port}`, { ca: pems.cert }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });

    expect(body).toBe('ok');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
