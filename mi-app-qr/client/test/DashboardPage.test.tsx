import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Registro } from '@mi-app-qr/shared';
import DashboardPage from '../src/pages/DashboardPage';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function registro(overrides: Partial<Registro>): Registro {
  return {
    id: 1,
    nombre: 'Persona de prueba',
    documento: 'DOC-1',
    rol: 'Visitante',
    tipo: 'entrada',
    timestamp: '2026-01-01 08:00:00',
    creadoPorUsuarioId: 1,
    corrigeRegistroId: null,
    motivo: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </QueryClientProvider>
  );
}

async function metric(name: string) {
  const heading = await screen.findByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error(`No se encontró la tarjeta ${name}`);
  return within(card);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getEstadoAnclaje).mockResolvedValue({ estado: 'sin_configurar' });
  });

  it('calcula registros vigentes, entradas y salidas de hoy', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        registro({ id: 1, nombre: 'Ana', tipo: 'entrada', timestamp: `${today} 08:00:00` }),
        registro({ id: 2, nombre: 'Bruno', tipo: 'entrada', timestamp: `${today} 09:00:00` }),
        registro({ id: 3, nombre: 'Carla', tipo: 'salida', timestamp: `${today} 10:00:00` }),
        registro({ id: 4, nombre: 'Diego', tipo: 'salida', timestamp: '2000-01-01 10:00:00' }),
      ],
    });
    vi.mocked(apiClient.listUsers).mockResolvedValue({
      users: [
        { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
        { id: 2, username: 'operador1', role: 'operador', cargo: 'Recepción', createdAt: '2026-01-02' },
      ],
    });

    renderPage();

    const totalCard = await metric('Registros vigentes');
    const entryCard = await metric('Entradas de hoy');
    const exitCard = await metric('Salidas de hoy');
    const usersCard = await metric('Usuarios activos');

    await waitFor(() => expect(totalCard.getByText('4')).toBeInTheDocument());
    expect(entryCard.getByText('2')).toBeInTheDocument();
    expect(exitCard.getByText('1')).toBeInTheDocument();
    expect(usersCard.getByText('2')).toBeInTheDocument();
    expect(await screen.findByText('Carla')).toBeInTheDocument();
  });

  it('consulta y muestra el total de usuarios solo para admin', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: {
        id: 2,
        username: 'operador1',
        role: 'operador',
        cargo: 'Recepción',
        createdAt: '2026-01-01',
      },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();

    await metric('Registros vigentes');
    await waitFor(() => expect(apiClient.getMe).toHaveBeenCalledOnce());
    expect(screen.queryByRole('heading', { name: 'Usuarios activos' })).not.toBeInTheDocument();
    expect(apiClient.listUsers).not.toHaveBeenCalled();
  });

  it('avisa al admin cuando el anclaje está atrasado (#139)', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });
    vi.mocked(apiClient.listUsers).mockResolvedValue({ users: [] });
    vi.mocked(apiClient.getEstadoAnclaje).mockResolvedValue({
      estado: 'alerta',
      detalle: 'Hay eventos sin anclar desde hace más de 2 horas: Fabric no responde o el anclaje está fallando.',
      resumen: {
        eventosPendientes: 12,
        pendienteMasAntiguo: '2026-10-26T08:00:00.000Z',
        ultimoLote: 'ccav-pitalito-porteria-1:seq-000001-000040',
        ultimoAnclaje: null,
        escritoEn: '2026-10-26T11:55:00.000Z',
      },
    });

    renderPage();

    const alerta = await screen.findByRole('alert', { name: 'El anclaje de la bitácora está atrasado' });
    expect(alerta).toHaveTextContent(/sin anclar desde hace más de 2 horas/);
    expect(alerta).toHaveTextContent(/12 eventos pendientes · último anclaje: ninguno/);
  });

  it('sin alerta de anclaje no muestra aviso, y un operador ni la consulta', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'Recepción', createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();

    await metric('Registros vigentes');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiClient.getEstadoAnclaje).not.toHaveBeenCalled();
  });
});
