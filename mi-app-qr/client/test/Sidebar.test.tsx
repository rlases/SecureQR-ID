import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../src/components/Sidebar';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('NO muestra el link a Usuarios si el usuario es operador', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('operador1')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /registros/i })).toHaveAttribute('href', '/registros');
    expect(screen.getByRole('link', { name: /informes/i })).toHaveAttribute('href', '/informes');
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  it('muestra el link a Usuarios si el usuario es admin', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });
});
