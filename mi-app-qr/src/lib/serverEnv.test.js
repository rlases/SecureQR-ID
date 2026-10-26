const path = require('path');
const { buildServerEnv, ISSUER_URL_POR_DEFECTO } = require('./serverEnv');

const userDataPath = path.join('/datos', 'registro-qr');
const secrets = {
  sessionSecret: 's'.repeat(64),
  asignacionesKey: 'a'.repeat(64),
  adminUsername: 'admin',
  adminPassword: 'clave',
};
const tls = { certPath: '/tls/cert.pem', keyPath: '/tls/key.pem' };

function armar(opciones = {}) {
  return buildServerEnv({ userDataPath, secrets, tls, port: 4000, existe: () => true, ...opciones });
}

describe('buildServerEnv (issue #131)', () => {
  test('pasa el emisor, la cabeza, los compromisos, los revocados y la zona horaria', () => {
    const { env, avisos } = armar();

    expect(avisos).toEqual([]);
    expect(env).toMatchObject({
      PORT: '4000',
      ASIGNACIONES_KEY: secrets.asignacionesKey,
      DB_PATH: path.join(userDataPath, 'server-data', 'app.db'),
      TLS_CERT_PATH: '/tls/cert.pem',
      ISSUER_SERVICE_URL: ISSUER_URL_POR_DEFECTO,
      SQRID_ISSUER_SECRET_FILE: path.join(userDataPath, 'issuer.secret'),
      ASIGNACIONES_CABEZA_PATH: path.join(userDataPath, 'anclaje', 'cabeza-asignaciones.json'),
      ASIGNACIONES_COMPROMISOS_PATH: path.join(userDataPath, 'anclaje', 'compromisos.json'),
      REVOCADOS_EXPORT_PATH: path.join(userDataPath, 'anclaje', 'revocados.txt'),
      SITE_TIME_ZONE: 'America/Bogota',
    });
  });

  test('la cabeza y los compromisos quedan fuera de server-data/', () => {
    const { env } = armar();
    for (const ruta of [env.ASIGNACIONES_CABEZA_PATH, env.ASIGNACIONES_COMPROMISOS_PATH]) {
      expect(ruta.startsWith(path.join(userDataPath, 'server-data'))).toBe(false);
    }
  });

  test('config.json cambia las rutas y la URL del emisor', () => {
    const { env } = armar({
      config: {
        emisor: { url: 'http://[::1]:9000', archivoSecreto: '/srv/issuer/issuer.secret' },
        anclaje: { cabeza: '/srv/anclaje/cabeza.json', compromisos: '/srv/anclaje/compromisos.json' },
        revocadosPath: '/srv/custodio/revocados.txt',
        zonaHoraria: 'America/Lima',
      },
    });
    expect(env).toMatchObject({
      ISSUER_SERVICE_URL: 'http://[::1]:9000',
      SQRID_ISSUER_SECRET_FILE: '/srv/issuer/issuer.secret',
      ASIGNACIONES_CABEZA_PATH: '/srv/anclaje/cabeza.json',
      ASIGNACIONES_COMPROMISOS_PATH: '/srv/anclaje/compromisos.json',
      REVOCADOS_EXPORT_PATH: '/srv/custodio/revocados.txt',
      SITE_TIME_ZONE: 'America/Lima',
    });
  });

  test('una variable de entorno ya definida gana sobre config.json', () => {
    const { env } = armar({
      config: { emisor: { url: 'http://127.0.0.1:9000' } },
      baseEnv: { ISSUER_SERVICE_URL: 'http://127.0.0.1:8800' },
    });
    expect(env.ISSUER_SERVICE_URL).toBe('http://127.0.0.1:8800');
  });

  test('sin el archivo del secreto no lo pasa y avisa, en vez de impedir el arranque', () => {
    const { env, avisos } = armar({ existe: () => false });
    expect(env.SQRID_ISSUER_SECRET_FILE).toBeUndefined();
    expect(env.ISSUER_SERVICE_URL).toBe(ISSUER_URL_POR_DEFECTO);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/no entregará QR/);
  });

  test('conserva el resto del entorno pero nunca pasa la contraseña de la clave de emisión', () => {
    const { env } = armar({ baseEnv: { PATH: '/usr/bin', SQRID_PRIVATE_KEY_PASSWORD: 'no-debe-pasar' } });
    expect(env.PATH).toBe('/usr/bin');
    expect(Object.keys(env)).not.toContain('SQRID_PRIVATE_KEY_PASSWORD');
  });
});
