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
    getConservacion: vi.fn(),
    setConservacion: vi.fn(),
    rechazarAlta: vi.fn(),
    reemplazarRegistro: vi.fn(),
    aprobarAlta: vi.fn(),
    regenerarCodigoProvisional: vi.fn(),
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
  provisionalVenceEn: null,
  registroVigenteId: null,
  registroVigenteEstado: null,
  creadoEn: '2026-10-24T15:00:00.000Z',
};

// Alta en revisión por documento repetido (issue #109).
const anaNueva = {
  ...ana,
  id: 5,
  nombre: 'Ana Nueva',
  estado: 'en_revision' as const,
  estamentoConfirmado: true,
  dispositivoActivo: false,
  registroVigenteId: 1,
  registroVigenteEstado: 'activo' as const,
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
    vi.mocked(apiClient.getConservacion).mockResolvedValue({ plazoDias: null });
  });

  it('guarda el plazo de conservación', async () => {
    vi.mocked(apiClient.setConservacion).mockResolvedValue({ plazoDias: 365 });
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText(/sin plazo \(hasta el cierre\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Plazo en días/), '365');
    await user.click(screen.getByRole('button', { name: 'Guardar plazo' }));
    await waitFor(() => expect(apiClient.setConservacion).toHaveBeenCalledWith(365));
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

  it('reemplaza un alta en revisión con un motivo de la lista y muestra el código una sola vez', async () => {
    vi.mocked(apiClient.listTitulares).mockResolvedValue({ titulares: [ana, anaNueva] });
    vi.mocked(apiClient.reemplazarRegistro).mockResolvedValue({
      codigoProvisional: 'ABCD-EFGH-IJKL-MNOP',
      venceEn: '2026-10-28T15:00:00.000Z',
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reemplazar registro con el alta de Ana Nueva' }));
    const dialogo = screen.getByRole('dialog', { name: /Reemplazar registro: Ana Nueva/ });
    const enviar = within(dialogo).getByRole('button', { name: 'Reemplazar' });
    expect(enviar).toBeDisabled();
    await user.click(within(dialogo).getByLabelText(/El registro anterior era indebido/));
    expect(within(dialogo).getByText(/se revoca y entra en la próxima lista/)).toBeInTheDocument();
    expect(within(dialogo).queryByRole('note', { name: 'Registro vigente suspendido' })).not.toBeInTheDocument();
    await user.click(enviar);
    await waitFor(() =>
      expect(apiClient.reemplazarRegistro).toHaveBeenCalledWith(5, 'registro_anterior_indebido', '')
    );
    expect(await within(dialogo).findByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument();
    expect(within(dialogo).getByRole('status')).toHaveTextContent(/una sola vez/);
    await user.click(within(dialogo).getByRole('button', { name: 'Ya lo entregué, cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('ABCD-EFGH-IJKL-MNOP')).not.toBeInTheDocument();
  });

  it('advierte que reemplazar un registro suspendido levanta la suspensión (#132)', async () => {
    const anaSuspendida = { ...ana, estado: 'suspendido' as const };
    const conSuspendido = { ...anaNueva, registroVigenteEstado: 'suspendido' as const };
    vi.mocked(apiClient.listTitulares).mockResolvedValue({ titulares: [anaSuspendida, conSuspendido] });
    vi.mocked(apiClient.reemplazarRegistro).mockResolvedValue({
      codigoProvisional: 'ABCD-EFGH-IJKL-MNOP',
      venceEn: '2026-10-28T15:00:00.000Z',
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reemplazar registro con el alta de Ana Nueva' }));
    const dialogo = screen.getByRole('dialog', { name: /Reemplazar registro: Ana Nueva/ });
    const aviso = within(dialogo).getByRole('note', { name: 'Registro vigente suspendido' });
    expect(aviso).toHaveTextContent(/se levanta la suspensión/);
    await user.click(within(dialogo).getByLabelText(/Es la misma persona/));
    await user.click(within(dialogo).getByRole('button', { name: 'Reemplazar' }));
    await waitFor(() => expect(apiClient.reemplazarRegistro).toHaveBeenCalledWith(5, 'misma_persona', ''));
  });

  it('rechaza un alta en revisión con una nota opcional', async () => {
    vi.mocked(apiClient.listTitulares).mockResolvedValue({ titulares: [ana, anaNueva] });
    vi.mocked(apiClient.rechazarAlta).mockResolvedValue({ ok: true });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rechazar alta de Ana Nueva' }));
    const dialogo = screen.getByRole('dialog', { name: /Rechazar alta: Ana Nueva/ });
    await user.type(within(dialogo).getByLabelText('Nota (opcional)'), 'verificado');
    await user.click(within(dialogo).getByRole('button', { name: 'Rechazar alta' }));
    await waitFor(() => expect(apiClient.rechazarAlta).toHaveBeenCalledWith(5, 'verificado'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sin registro vigente ofrece aprobar, y regenera el código provisional pendiente', async () => {
    const sinAnterior = { ...anaNueva, registroVigenteId: null, registroVigenteEstado: null };
    const pendiente = { ...ana, id: 7, nombre: 'Luis Sintético', provisionalVenceEn: '2026-10-28T15:00:00.000Z' };
    vi.mocked(apiClient.listTitulares).mockResolvedValue({ titulares: [sinAnterior, pendiente] });
    vi.mocked(apiClient.regenerarCodigoProvisional).mockResolvedValue({
      codigoProvisional: 'QRST-UVWX-YZ23-4567',
      venceEn: '2026-10-29T15:00:00.000Z',
    });
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Aprobar alta de Ana Nueva' })).toBeInTheDocument();
    expect(screen.getByText(/Sin registro vigente con este documento/)).toBeInTheDocument();
    expect(screen.getByText(/Código provisional sin canjear/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nuevo código provisional para Luis Sintético' }));
    const dialogo = screen.getByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Generar código' }));
    expect(await within(dialogo).findByText('QRST-UVWX-YZ23-4567')).toBeInTheDocument();
    expect(apiClient.regenerarCodigoProvisional).toHaveBeenCalledWith(7);
  });
});
