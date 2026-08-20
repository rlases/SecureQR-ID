import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, getMe, logout, createRegistro, listRegistros, ApiError } from '../src/lib/apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login() envía credenciales y devuelve el usuario', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' } }),
    });

    const result = await login({ username: 'admin', password: 'x' });

    expect(result.user.username).toBe('admin');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username: 'admin', password: 'x' }),
      })
    );
  });

  it('login() lanza ApiError con el mensaje del servidor si falla', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'usuario o contraseña incorrectos' }),
    });

    await expect(login({ username: 'admin', password: 'mal' })).rejects.toThrow(ApiError);
    await expect(login({ username: 'admin', password: 'mal' })).rejects.toThrow(
      'usuario o contraseña incorrectos'
    );
  });

  it('getMe() consulta /api/auth/me con credenciales incluidas', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' } }),
    });

    await getMe();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('logout() hace POST a /api/auth/logout', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await logout();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('createRegistro() envía el registro y devuelve el creado', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        registro: { id: 1, nombre: 'Ana Ríos', documento: '123', rol: 'estudiante', tipo: 'entrada', timestamp: '2026-01-01', creadoPorUsuarioId: 1 },
      }),
    });

    const result = await createRegistro({ nombre: 'Ana Ríos', documento: '123', rol: 'estudiante', tipo: 'entrada' });

    expect(result.registro.nombre).toBe('Ana Ríos');
  });

  it('listRegistros() devuelve la lista', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ registros: [] }),
    });

    const result = await listRegistros();

    expect(result.registros).toEqual([]);
  });
});
