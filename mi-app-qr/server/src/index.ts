import https from 'node:https';
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedAdminUser } from './db/seed.js';
import { loadTlsOptionsFromEnv } from './tls.js';
import { exportarRevocados } from './titulares/gestion.js';
import { aplicarReseteoSiCorresponde } from './titulares/reseteo.js';
import { anonimizarVencidos } from './titulares/anonimizacion.js';

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error(
      'SESSION_SECRET no está definido. Copia .env.example a .env y ponle un valor real.'
    );
  }

  const dbPath = process.env.DB_PATH ?? './data/app.db';
  const port = Number(process.env.PORT ?? 4000);

  const db = openDatabase(dbPath);
  runMigrations(db);

  const seedUsername = process.env.SEED_ADMIN_USERNAME;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (seedUsername && seedPassword) {
    await seedAdminUser(db, { username: seedUsername, password: seedPassword });
  }

  // Transporte cifrado en la red del CCAV (ADR-0008): si mi-app-qr (Electron)
  // generó un certificado y pasó su ruta, se sirve por HTTPS y la cookie de
  // sesión se marca `secure`. Sin esas variables (dev/pruebas sin Electron) se
  // sigue sirviendo por HTTP plano, sin romper `npm run dev`.
  const tls = loadTlsOptionsFromEnv();
  const app = createApp({
    db,
    sessionSecret,
    secureCookies: tls !== null,
    certificate: tls?.cert,
    revocadosExportPath: process.env.REVOCADOS_EXPORT_PATH,
  });

  // Exportación diaria de cid revocados para el refirmado del custodio (ADR-0015 y
  // ADR-0016, punto 9). Se exporta al arrancar y luego cada 24 horas; el panel tiene
  // además «exportar ahora».
  const revocadosPath = process.env.REVOCADOS_EXPORT_PATH;
  if (revocadosPath) {
    const exportar = () => {
      try {
        const cantidad = exportarRevocados(db, revocadosPath, new Date());
        console.log(`Revocados exportados: ${cantidad}`);
      } catch (error) {
        console.error('No se pudo exportar la lista de revocados:', error);
      }
    };
    exportar();
    setInterval(exportar, UN_DIA_MS).unref();
  }

  // Reseteo trimestral del cid (ADR-0016, punto 8). Se comprueba al arrancar y cada seis
  // horas; solo actúa la primera vez en un trimestre nuevo, en la hora local de la sede.
  const zona = process.env.SITE_TIME_ZONE;
  const reseteo = () => {
    try {
      const r = aplicarReseteoSiCorresponde(db, new Date(), zona);
      if (r.accion === 'reseteo') console.log(`Reseteo de cid ${r.trimestre}: ${r.cantidad} titulares`);
    } catch (error) {
      console.error('No se pudo aplicar el reseteo trimestral del cid:', error);
    }
  };
  reseteo();
  setInterval(reseteo, SEIS_HORAS_MS).unref();

  // Plazo de conservación (ADR-0016, punto 10): si el admin lo configuró, cada día se
  // anonimizan los registros y consultas más antiguos.
  const conservacion = () => {
    try {
      const r = anonimizarVencidos(db, new Date());
      if (r && (r.registros > 0 || r.consultas > 0)) {
        console.log(`Anonimizados por plazo: ${r.registros} registros y ${r.consultas} consultas`);
      }
    } catch (error) {
      console.error('No se pudo aplicar el plazo de conservación:', error);
    }
  };
  conservacion();
  setInterval(conservacion, UN_DIA_MS).unref();

  if (tls) {
    https.createServer(tls, app).listen(port, () => {
      console.log(`Servidor escuchando en https://localhost:${port}`);
    });
  } else {
    app.listen(port, () => {
      console.log(`Servidor escuchando en http://localhost:${port}`);
    });
  }
}

main().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
