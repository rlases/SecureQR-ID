// Entorno con el que Electron arranca el servidor de mi-app-qr (issue #131).
//
// Electron no arranca `secureqr-issuer serve`: lo arranca el custodio con la cuenta propia
// del emisor y escribe la contraseña de la clave una sola vez (ADR-0016, punto 6). Si
// Electron lo lanzara como proceso hijo, correría con la cuenta de mi-app-qr y tendría que
// conocer esa contraseña. Aquí solo se le dice al servidor dónde está el servicio y con qué
// secreto compartido pedirle tokens.
const fs = require('fs');
const path = require('path');

const ISSUER_URL_POR_DEFECTO = 'http://127.0.0.1:8765';
const ZONA_POR_DEFECTO = 'America/Bogota';

// Rutas por defecto dentro de userData. Las de anclaje/ las lee el ciclo de evidence-log
// (`cycle --head-file` y `--commitments-file`) y el custodio (revocados).
function rutasPorDefecto(userDataPath) {
    const anclaje = path.join(userDataPath, 'anclaje');
    return {
        db: path.join(userDataPath, 'server-data', 'app.db'),
        cabeza: path.join(anclaje, 'cabeza-asignaciones.json'),
        compromisos: path.join(anclaje, 'compromisos.json'),
        revocados: path.join(anclaje, 'revocados.txt'),
        secretoEmisor: path.join(userDataPath, 'issuer.secret'),
    };
}

/**
 * Arma las variables del servidor. Prioridad: variable de entorno ya definida, luego
 * config.json (`emisor.url`, `emisor.archivoSecreto`, `anclaje.cabeza`,
 * `anclaje.compromisos`, `revocadosPath`, `zonaHoraria`), luego el valor por defecto.
 *
 * El secreto del emisor solo se pasa si el archivo existe: el servidor lo lee al arrancar
 * y, sin él, falla. Sin secreto el portal funciona pero no entrega QR, y se avisa.
 *
 * Devuelve el entorno completo del proceso hijo (baseEnv más estas variables), sin la
 * contraseña de la clave de emisión aunque esté en el entorno de Electron.
 */
function buildServerEnv({ userDataPath, secrets, config = {}, baseEnv = {}, tls, port, existe = fs.existsSync }) {
    const rutas = rutasPorDefecto(userDataPath);
    const emisor = config.emisor || {};
    const anclaje = config.anclaje || {};
    const elegir = (nombre, valorConfig, porDefecto) => baseEnv[nombre] || valorConfig || porDefecto;

    const env = {
        ...baseEnv,
        PORT: String(port),
        SESSION_SECRET: secrets.sessionSecret,
        ASIGNACIONES_KEY: secrets.asignacionesKey,
        DB_PATH: rutas.db,
        SEED_ADMIN_USERNAME: secrets.adminUsername,
        SEED_ADMIN_PASSWORD: secrets.adminPassword,
        TLS_CERT_PATH: tls.certPath,
        TLS_KEY_PATH: tls.keyPath,
        SITE_TIME_ZONE: elegir('SITE_TIME_ZONE', config.zonaHoraria, ZONA_POR_DEFECTO),
        REVOCADOS_EXPORT_PATH: elegir('REVOCADOS_EXPORT_PATH', config.revocadosPath, rutas.revocados),
        ASIGNACIONES_CABEZA_PATH: elegir('ASIGNACIONES_CABEZA_PATH', anclaje.cabeza, rutas.cabeza),
        ASIGNACIONES_COMPROMISOS_PATH: elegir('ASIGNACIONES_COMPROMISOS_PATH', anclaje.compromisos, rutas.compromisos),
        ISSUER_SERVICE_URL: elegir('ISSUER_SERVICE_URL', emisor.url, ISSUER_URL_POR_DEFECTO),
    };
    delete env.SQRID_PRIVATE_KEY_PASSWORD;
    const avisos = [];
    const secreto = elegir('SQRID_ISSUER_SECRET_FILE', emisor.archivoSecreto, rutas.secretoEmisor);
    if (existe(secreto)) {
        env.SQRID_ISSUER_SECRET_FILE = secreto;
    } else {
        delete env.SQRID_ISSUER_SECRET_FILE;
        avisos.push(
            `No existe el secreto compartido del emisor (${secreto}): el portal no entregará QR. ` +
                'Créalo con `secureqr-issuer generate-secret` o indica su ruta en config.json (emisor.archivoSecreto).'
        );
    }
    return { env, avisos };
}

module.exports = { buildServerEnv, rutasPorDefecto, ISSUER_URL_POR_DEFECTO };
