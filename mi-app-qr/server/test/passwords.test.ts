import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';

describe('passwords', () => {
  it('verifica correctamente una contraseña contra su hash', async () => {
    const hash = await hashPassword('correcto-caballo-batería-grapadora');
    expect(await verifyPassword('correcto-caballo-batería-grapadora', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('correcto-caballo-batería-grapadora');
    expect(await verifyPassword('otra-cosa', hash)).toBe(false);
  });

  it('nunca guarda la contraseña en texto plano dentro del hash', async () => {
    const hash = await hashPassword('mi-secreto');
    expect(hash).not.toContain('mi-secreto');
  });
});
