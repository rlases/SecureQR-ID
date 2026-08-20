import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function TestConsumer() {
  const { user, isLoading, login, logout } = useAuth();

  if (isLoading) return <p>Cargando...</p>;

  return (
    <div>
      <p>{user ? `Sesión: ${user.username}` : 'Sin sesión'}</p>
      <button onClick={() => login({ username: 'admin', password: 'x' })}>Entrar</button>
      <button onClick={() => logout()}>Salir</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('empieza sin sesión si /api/auth/me devuelve 401', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());
  });

  it('carga el usuario si ya hay sesión activa', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());
  });

  it('login() actualiza el usuario tras autenticar', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));
    vi.mocked(apiClient.login).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());
  });

  it('logout() limpia el usuario', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.logout).mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Salir'));

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());
  });
});
