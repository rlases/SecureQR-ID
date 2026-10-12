import fs from 'node:fs';

export interface TlsOptions {
  cert: Buffer;
  key: Buffer;
}

/**
 * Lee el certificado y la llave que mi-app-qr (proceso Electron) generó para
 * esta instalación (ADR-0008, docs/DECISIONS.md) y le pasó al servidor por
 * variables de entorno. Sin ambas variables, el servidor sigue sirviendo por
 * HTTP plano — el caso de `npm run dev`/`start` fuera de Electron, donde no
 * hay red institucional que proteger.
 */
export function loadTlsOptionsFromEnv(): TlsOptions | null {
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;

  if (!certPath || !keyPath) {
    return null;
  }

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}
