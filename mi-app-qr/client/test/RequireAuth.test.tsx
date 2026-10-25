import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as renderUI, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from '../src/auth/RequireAuth';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

function render(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderUI(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
vi.mock('../src/lib/apiClient');

function renderWithRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Página de login</p>} />
          <Route path="/admin" element={<RequireAuth role="admin"><p>Solo administradores</p></RequireAuth>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <p>Contenido protegido</p>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirige a /login si no hay sesión', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));

    renderWithRoute('/');

    await waitFor(() => expect(screen.getByText('Página de login')).toBeInTheDocument());
  });

  it('muestra el contenido protegido si hay sesión', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });

    renderWithRoute('/');

    await waitFor(() => expect(screen.getByText('Contenido protegido')).toBeInTheDocument());
  });

  it('el operador no monta una pantalla de administrador', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({ user: { id: 2, username: 'operador', role: 'operador', cargo: null, createdAt: '' } });
    renderWithRoute('/admin');
    await screen.findByText('Contenido protegido');
    expect(screen.queryByText('Solo administradores')).not.toBeInTheDocument();
  });
});
