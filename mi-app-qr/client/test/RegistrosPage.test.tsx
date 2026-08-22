import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegistrosPage from '../src/pages/RegistrosPage';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegistrosPage />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('RegistrosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });
  });

  it('lista los registros existentes', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        {
          id: 1,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: null,
          motivo: null,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
  });

  it('abre el historial completo desde el registro vigente', async () => {
    const original = {
      id: 1,
      nombre: 'Ana Rios',
      documento: '1',
      rol: 'Investigadora visitante',
      tipo: 'entrada' as const,
      timestamp: '2026-01-01 10:00:00',
      creadoPorUsuarioId: 1,
      corrigeRegistroId: null,
      motivo: null,
    };
    const vigente = {
      ...original,
      id: 2,
      nombre: 'Ana Ríos',
      corrigeRegistroId: 1,
      motivo: 'faltaba la tilde',
    };
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [vigente] });
    vi.mocked(apiClient.getRegistroHistory).mockResolvedValue({ historial: [original, vigente] });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /ver historial de ana ríos/i }));

    expect(await screen.findByRole('dialog', { name: /historial de correcciones de ana ríos/i })).toBeInTheDocument();
    expect(apiClient.getRegistroHistory).toHaveBeenCalledWith(2);
    expect(screen.getByText('Registro original')).toBeInTheDocument();
    expect(screen.getByText('Corrección 1')).toBeInTheDocument();
    expect(screen.getByText('faltaba la tilde')).toBeInTheDocument();
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
          {
            id: 1,
            nombre: 'Luis Gómez',
            documento: '2',
            rol: 'docente',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:05:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: null,
            motivo: null,
          },
        ],
      });
    vi.mocked(apiClient.createRegistro).mockResolvedValue({
      registro: {
        id: 1,
        nombre: 'Luis Gómez',
        documento: '2',
        rol: 'docente',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:05:00',
        creadoPorUsuarioId: 1,
        corrigeRegistroId: null,
        motivo: null,
      },
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

  it('permite al operador ver el historial pero no muestra el botón Corregir', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        {
          id: 1,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: null,
          motivo: null,
        },
      ],
    });

    renderPage();

    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: /^corregir$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver historial de ana ríos/i })).toBeInTheDocument();
  });

  it('corrige un registro y refresca la lista con la versión corregida', async () => {
    vi.mocked(apiClient.listRegistros)
      .mockResolvedValueOnce({
        registros: [
          {
            id: 1,
            nombre: 'Ana Rios',
            documento: '1',
            rol: 'estudiante',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:00:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: null,
            motivo: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        registros: [
          {
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
        ],
      });
    vi.mocked(apiClient.correctRegistro).mockResolvedValue({
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
    });

    renderPage();
    await screen.findByText('Ana Rios');

    await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }));

    const dialog = within(screen.getByRole('dialog'));
    await userEvent.clear(dialog.getByLabelText(/^nombre$/i));
    await userEvent.type(dialog.getByLabelText(/^nombre$/i), 'Ana Ríos');
    await userEvent.type(dialog.getByLabelText(/motivo/i), 'faltaba la tilde');
    await userEvent.click(dialog.getByRole('button', { name: /guardar corrección/i }));

    await waitFor(() =>
      expect(apiClient.correctRegistro).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ nombre: 'Ana Ríos', motivo: 'faltaba la tilde' })
      )
    );
    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
  });
});
