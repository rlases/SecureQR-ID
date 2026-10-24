import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConsultaCidPage from '../src/pages/ConsultaCidPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/apiClient')>();
  return { ApiError: real.ApiError, consultarCids: vi.fn(), listConsultasCid: vi.fn() };
});

const CID = 'AAAAAAAAAAAAAAAAAAAAAA';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConsultaCidPage />
    </QueryClientProvider>
  );
}

describe('ConsultaCidPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.listConsultasCid).mockResolvedValue({ consultas: [] });
  });

  it('consulta varios cid con su motivo y muestra a quién pertenecen', async () => {
    vi.mocked(apiClient.consultarCids).mockResolvedValue({
      resultados: [
        {
          cid: CID,
          encontrado: true,
          anonimizado: false,
          titularId: 1,
          nombre: 'Titular Sintético',
          documento: '5000000001',
          estamento: 'Estudiante',
          estadoCredencial: 'vigente',
          vigenteDesde: '2026-10-01T00:00:00.000Z',
          vigenteHasta: null,
        },
        { cid: 'BBBBBBBBBBBBBBBBBBBBBA', encontrado: false },
      ],
    });
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cid a consultar/), `${CID}\nBBBBBBBBBBBBBBBBBBBBBA`);
    await user.type(screen.getByLabelText('Motivo (opcional)'), 'revisión semanal');
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await waitFor(() =>
      expect(apiClient.consultarCids).toHaveBeenCalledWith(
        [CID, 'BBBBBBBBBBBBBBBBBBBBBA'],
        'revisión semanal'
      )
    );
    const tabla = within(await screen.findByRole('region', { name: 'Tabla de resultados' }));
    expect(tabla.getByText('Titular Sintético')).toBeInTheDocument();
    expect(tabla.getByText('No corresponde a ninguna credencial.')).toBeInTheDocument();
    // Tras consultar, el registro se vuelve a pedir para mostrar la consulta nueva.
    await waitFor(() => expect(apiClient.listConsultasCid).toHaveBeenCalledTimes(2));
  });

  it('muestra el registro de consultas con quién y cuándo', async () => {
    vi.mocked(apiClient.listConsultasCid).mockResolvedValue({
      consultas: [
        { id: 1, usuario: 'admin', cid: CID, encontrado: true, motivo: null, en: '2026-10-24T15:00:00.000Z' },
      ],
    });
    renderPage();
    const registro = within(await screen.findByRole('region', { name: 'Tabla del registro de consultas' }));
    expect(registro.getByText('admin')).toBeInTheDocument();
    expect(registro.getByText(CID)).toBeInTheDocument();
  });

  it('un 403 se muestra como error', async () => {
    vi.mocked(apiClient.consultarCids).mockRejectedValue(
      new apiClient.ApiError('requiere permiso de administrador', 403)
    );
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/cid a consultar/), CID);
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permiso de administrador/);
  });
});
