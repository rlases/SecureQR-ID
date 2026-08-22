import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, getMe, logout, createRegistro, listRegistros, getRegistroHistory, createUser, listUsers, correctRegistro, ApiError } from '../src/lib/apiClient';

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

  it('getRegistroHistory() consulta la cadena completa con credenciales incluidas', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        historial: [
          {
            id: 7,
            nombre: 'Ana Ríos',
            documento: '1',
            rol: 'Investigadora visitante',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:00:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: null,
            motivo: null,
          },
        ],
      }),
    });

    const result = await getRegistroHistory(7);

    expect(result.historial).toHaveLength(1);
    expect(result.historial[0].rol).toBe('Investigadora visitante');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/registros/7/historial',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('createUser() envía los datos y devuelve el usuario más la contraseña generada', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
        generatedPassword: 'xJ3-generada',
      }),
    });

    const result = await createUser({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });

    expect(result.user.username).toBe('operador1');
    expect(result.generatedPassword).toBe('xJ3-generada');
  });

  it('listUsers() devuelve la lista de usuarios', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    });

    const result = await listUsers();

    expect(result.users).toEqual([]);
  });

  it('correctRegistro() envía la corrección al endpoint anidado y devuelve el registro corregido', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        registro: {
          id: 2,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: 1,
          motivo: 'faltaba la tilde',
        },
      }),
    });

    const result = await correctRegistro(1, {
      nombre: 'Ana Ríos',
      documento: '1',
      rol: 'estudiante',
      tipo: 'entrada',
      timestamp: '2026-01-01 10:00:00',
      motivo: 'faltaba la tilde',
    });

    expect(result.registro.corrigeRegistroId).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/registros/1/correcciones',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          motivo: 'faltaba la tilde',
        }),
      })
    );
  });
});
