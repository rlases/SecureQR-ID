// tls.js
//
// Genera y persiste el certificado autofirmado que mi-app-qr/server usa para
// servirse por HTTPS en la red del CCAV (ADR-0008, docs/DECISIONS.md). El
// mecanismo elegido es un certificado autofirmado por instalación, generado en
// el primer arranque y reutilizado después, sin autoridad certificadora
// externa: el equipo que actúa como servidor es también quien lo emite.
//
// Se regenera si las IP de la red local cambiaron desde la última vez (DHCP),
// para que el certificado siga cubriendo la dirección real por la que los
// demás equipos del CCAV acceden al servidor, no solo localhost.

const fs = require('fs');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');

const CERT_VALIDITY_YEARS = 10;

function currentLanIPv4s() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips.sort();
}

async function generateCertificate(ips) {
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];

  const pems = selfsigned.generate(
    [{ name: 'commonName', value: 'mi-app-qr (red institucional)' }],
    {
      keySize: 2048,
      days: CERT_VALIDITY_YEARS * 365,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames },
      ],
    }
  );

  return { cert: pems.cert, key: pems.private, fingerprint: pems.fingerprint };
}

// tlsDir: carpeta donde persistir cert.pem/key.pem/meta.json — normalmente
// dentro de app.getPath('userData'), pasada desde main.js.
async function loadOrCreateCertificate(tlsDir) {
  const certPath = path.join(tlsDir, 'cert.pem');
  const keyPath = path.join(tlsDir, 'key.pem');
  const metaPath = path.join(tlsDir, 'meta.json');
  const ips = currentLanIPv4s();

  let meta = null;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch (error) {
    meta = null;
  }

  const coveredIps = new Set(meta ? meta.ips : []);
  const ipsChanged = ips.some((ip) => !coveredIps.has(ip));
  const filesExist = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (filesExist && meta && !ipsChanged) {
    return {
      certPath,
      keyPath,
      cert: fs.readFileSync(certPath, 'utf-8'),
      fingerprint: meta.fingerprint,
      regenerated: false,
    };
  }

  fs.mkdirSync(tlsDir, { recursive: true });
  const { cert, key, fingerprint } = await generateCertificate(ips);
  fs.writeFileSync(certPath, cert, 'utf-8');
  fs.writeFileSync(keyPath, key, 'utf-8');
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ ips, fingerprint, generatedAt: Date.now() }, null, 2),
    'utf-8'
  );

  return { certPath, keyPath, cert, fingerprint, regenerated: true };
}

module.exports = { loadOrCreateCertificate, currentLanIPv4s, generateCertificate };
