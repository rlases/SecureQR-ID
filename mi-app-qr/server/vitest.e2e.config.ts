import { defineConfig } from 'vitest/config';

// Prueba de punta a punta contra el servicio real de issuer/ (issue #85). La ejecuta el
// trabajo `emision-e2e` de CI, que levanta `secureqr-issuer serve`; en local, define
// ISSUER_E2E_URL y ISSUER_E2E_SECRET_FILE. No forma parte de `npm test`.
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['test-e2e/**/*.e2e.test.ts'],
    env: { ASIGNACIONES_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' },
  },
});
