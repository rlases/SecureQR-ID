import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
