import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Sin esto, Vite busca postcss.config.js hacia arriba en el árbol de carpetas.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Extraer la etiqueta con git y cargar el parser con tsx toma unos segundos.
    testTimeout: 30_000,
  },
});
