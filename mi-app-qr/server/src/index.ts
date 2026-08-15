import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';

const PORT = Number(process.env.PORT ?? 4000);
const db = openDatabase('./data/app.db');
runMigrations(db);

const app = createApp({ db, sessionSecret: 'secreto-interino-hasta-task-10' });
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
