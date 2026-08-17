import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegistrosPage from '../src/pages/RegistrosPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrosPage />
    </QueryClientProvider>
  );
}

describe('RegistrosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista los registros existentes', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        { id: 1, nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', creadoPorUsuarioId: 1 },
      ],
    });

    renderPage();

    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay registros', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();

    expect(await screen.findByText(/sin registros/i)).toBeInTheDocument();
  });

  it('crea un registro nuevo y refresca la lista', async () => {
    vi.mocked(apiClient.listRegistros)
      .mockResolvedValueOnce({ registros: [] })
      .mockResolvedValueOnce({
        registros: [
          { id: 1, nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada', timestamp: '2026-01-01 10:05:00', creadoPorUsuarioId: 1 },
        ],
      });
    vi.mocked(apiClient.createRegistro).mockResolvedValue({
      registro: { id: 1, nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada', timestamp: '2026-01-01 10:05:00', creadoPorUsuarioId: 1 },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText(/sin registros/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/nombre/i), 'Luis Gómez');
    await userEvent.type(screen.getByLabelText(/documento/i), '2');
    await userEvent.type(screen.getByLabelText(/rol/i), 'docente');
    await userEvent.click(screen.getByRole('button', { name: /registrar entrada/i }));

    await waitFor(() =>
      expect(apiClient.createRegistro).toHaveBeenCalledWith({
        nombre: 'Luis Gómez',
        documento: '2',
        rol: 'docente',
        tipo: 'entrada',
      })
    );
    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument();
  });

  it('muestra un error de validación si el formulario está incompleto', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();
    await waitFor(() => expect(screen.getByText(/sin registros/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /registrar entrada/i }));

    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
    expect(apiClient.createRegistro).not.toHaveBeenCalled();
  });
});
