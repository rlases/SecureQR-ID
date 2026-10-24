import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TitularesPage from '../src/pages/TitularesPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/apiClient')>();
  return {
    ApiError: real.ApiError,
    URL_REVOCADOS: real.URL_REVOCADOS,
    listTitulares: vi.fn(),
    accionTitular: vi.fn(),
    confirmarEstamentoTitular: vi.fn(),
    exportarRevocadosAhora: vi.fn(),
  };
});

const ana = {
  id: 1,
  nombre: 'Ana Sintética',
  documento: '6000000001',
  correo: 'ana@ejemplo.test',
  estado: 'activo' as const,
  estamentoId: 2,
  estamento: 'Docente',
  estamentoConfirmado: false,
  dispositivoActivo: true,
  creadoEn: '2026-10-24T15:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TitularesPage />
    </QueryClientProvider>
  );
}

describe('TitularesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.listTitulares).mockResolvedValue({ titulares: [ana] });
  });

  it('revocar pide un motivo en un diálogo con el foco adentro', async () => {
    vi.mocked(apiClient.accionTitular).mockResolvedValue({ ok: true });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revocar credencial de Ana Sintética' }));
    const dialogo = screen.getByRole('dialog', { name: /Revocar credencial: Ana Sintética/ });
    const motivo = within(dialogo).getByLabelText('Motivo');
    expect(motivo).toHaveFocus();
    expect(within(dialogo).getByRole('button', { name: 'Revocar' })).toBeDisabled();
    await user.type(motivo, 'Teléfono robado');
    await user.click(within(dialogo).getByRole('button', { name: 'Revocar' }));
    await waitFor(() => expect(apiClient.accionTitular).toHaveBeenCalledWith(1, 'revocar', 'Teléfono robado'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Escape cierra el diálogo y devuelve el foco al botón', async () => {
    renderPage();
    const user = userEvent.setup();
    const boton = await screen.findByRole('button', { name: 'Desvincular teléfono de Ana Sintética' });
    await user.click(boton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('confirma el estamento pendiente', async () => {
    vi.mocked(apiClient.confirmarEstamentoTitular).mockResolvedValue({ estamentoId: 2, estamentoConfirmado: true });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Confirmar Docente de Ana Sintética' }));
    await waitFor(() => expect(apiClient.confirmarEstamentoTitular).toHaveBeenCalledWith(1, 2));
  });

  it('un suspendido se puede reactivar y no se puede revocar otra vez', async () => {
    vi.mocked(apiClient.listTitulares).mockResolvedValue({
      titulares: [{ ...ana, estado: 'suspendido', estamentoConfirmado: true, dispositivoActivo: false }],
    });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reactivar a Ana Sintética' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revocar credencial/ })).not.toBeInTheDocument();
  });

  it('filtra por estado', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Ana Sintética');
    await user.selectOptions(screen.getByLabelText('Estado'), 'suspendido');
    await waitFor(() => expect(apiClient.listTitulares).toHaveBeenLastCalledWith('suspendido'));
  });

  it('exportar ahora informa cuántos cid exportó', async () => {
    vi.mocked(apiClient.exportarRevocadosAhora).mockResolvedValue({ cantidad: 3, ruta: './data/revocados.txt' });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Exportar ahora' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Exportados 3 cid');
    expect(screen.getByRole('link', { name: /Descargar archivo de revocados/ })).toHaveAttribute(
      'href',
      '/api/titulares/revocados.txt'
    );
  });
});
