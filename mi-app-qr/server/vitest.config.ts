import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Sin esto, Vite busca postcss.config.js hacia arriba en el árbol de
  // carpetas y encuentra el de mi-app-qr/ (la app CRA), que requiere
  // "tailwindcss" — una dependencia que este paquete no instala. Un objeto
  // inline evita esa búsqueda por completo.
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Clave sintética solo para pruebas; en uso real la genera Electron o se pone en .env.
    env: { ASIGNACIONES_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' },
  },
});
