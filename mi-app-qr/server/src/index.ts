import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedAdminUser } from './db/seed.js';

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

  const app = createApp({ db, sessionSecret });
  app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
  });
}

main().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
