import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from '../src/auth/RequireAuth';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderWithRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Página de login</p>} />
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
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    renderWithRoute('/');

    await waitFor(() => expect(screen.getByText('Contenido protegido')).toBeInTheDocument());
  });
});
