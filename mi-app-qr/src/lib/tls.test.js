const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { loadOrCreateCertificate, currentLanIPv4s } = require('./tls');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mi-app-qr-tls-'));
}

describe('loadOrCreateCertificate', () => {
  test('genera cert.pem, key.pem y meta.json en el primer arranque', async () => {
    const dir = makeTmpDir();

    const result = await loadOrCreateCertificate(dir);

    expect(result.regenerated).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cert.pem'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'key.pem'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'meta.json'))).toBe(true);
    expect(result.cert).toContain('BEGIN CERTIFICATE');
  });

  test('reutiliza el certificado existente si las IP no cambiaron', async () => {
    const dir = makeTmpDir();

    const first = await loadOrCreateCertificate(dir);
    const second = await loadOrCreateCertificate(dir);

    expect(second.regenerated).toBe(false);
    expect(second.cert).toBe(first.cert);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  test('regenera el certificado si aparece una IP nueva no cubierta', async () => {
    const dir = makeTmpDir();

    const first = await loadOrCreateCertificate(dir);
    // Simula que meta.json quedó de una red anterior, sin la IP actual.
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify({ ips: ['203.0.113.9'], fingerprint: first.fingerprint }),
      'utf-8'
    );

    const second = await loadOrCreateCertificate(dir);

    expect(second.regenerated).toBe(true);
    expect(second.cert).not.toBe(first.cert);
  });

  test('el certificado generado es utilizable por un servidor https real', async () => {
    const dir = makeTmpDir();
    const { certPath, keyPath, cert } = await loadOrCreateCertificate(dir);

    const server = https.createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      (_req, res) => {
        res.writeHead(200);
        res.end('ok');
      }
    );

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const body = await new Promise((resolve, reject) => {
      https
        .get(`https://localhost:${port}`, { ca: cert }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });

    expect(body).toBe('ok');
    await new Promise((resolve) => server.close(resolve));
  });

  test('incluye localhost, 127.0.0.1 y las IP LAN actuales como Subject Alternative Name', async () => {
    const { X509Certificate } = require('crypto');
    const dir = makeTmpDir();
    const { cert } = await loadOrCreateCertificate(dir);
    const ips = currentLanIPv4s();

    const parsed = new X509Certificate(cert);
    expect(parsed.subjectAltName).toContain('DNS:localhost');
    expect(parsed.subjectAltName).toContain('IP Address:127.0.0.1');
    ips.forEach((ip) => {
      expect(parsed.subjectAltName).toContain(`IP Address:${ip}`);
    });
  });
});
