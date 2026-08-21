import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsuariosPage from '../src/pages/UsuariosPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsuariosPage />
    </QueryClientProvider>
  );
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista los usuarios existentes', async () => {
    vi.mocked(apiClient.listUsers).mockResolvedValue({
      users: [
        { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
      ],
    });

    renderPage();

    // 'admin' aparece dos veces (columna Usuario y columna Permiso, porque el
    // usuario semilla tiene username y role iguales) — findAllByText, no findByText.
    expect(await screen.findAllByText('admin')).not.toHaveLength(0);
  });

  it('crea un usuario y muestra la contraseña generada una sola vez', async () => {
    vi.mocked(apiClient.listUsers)
      .mockResolvedValueOnce({ users: [{ id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' }] })
      .mockResolvedValueOnce({
        users: [
          { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
          { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-02' },
        ],
      });
    vi.mocked(apiClient.createUser).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-02' },
      generatedPassword: 'xJ3-generada-de-prueba',
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByText('admin').length).toBeGreaterThan(0));

    await userEvent.type(screen.getByLabelText(/usuario/i), 'operador1');
    await userEvent.type(screen.getByLabelText(/cargo/i), 'vigilancia');
    await userEvent.selectOptions(screen.getByLabelText(/permiso/i), 'operador');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() =>
      expect(apiClient.createUser).toHaveBeenCalledWith({
        username: 'operador1',
        role: 'operador',
        cargo: 'vigilancia',
      })
    );

    expect(await screen.findByText(/xJ3-generada-de-prueba/)).toBeInTheDocument();
    // 'operador1' aparece dos veces: en el banner de contraseña generada y en la
    // fila nueva de la tabla — findAllByText, no findByText.
    expect(await screen.findAllByText('operador1')).not.toHaveLength(0);
  });

  it('muestra un error de validación si el usuario está vacío', async () => {
    vi.mocked(apiClient.listUsers).mockResolvedValue({ users: [] });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /crear usuario/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    // 'obligatorio' aparece dos veces: username y cargo están vacíos a la vez.
    expect(await screen.findAllByText(/obligatorio/i)).not.toHaveLength(0);
    expect(apiClient.createUser).not.toHaveBeenCalled();
  });
});
