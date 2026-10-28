import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AltaPage from '../src/pages/portal/AltaPage';
import RecuperarPage from '../src/pages/portal/RecuperarPage';
import PortalPage from '../src/pages/portal/PortalPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/apiClient')>();
  return {
    ApiError: real.ApiError,
    getInfoAlta: vi.fn(),
    getSugerenciaEstamento: vi.fn(),
    altaTitular: vi.fn(),
    recuperarTelefono: vi.fn(),
    getEstadoPortal: vi.fn(),
    pedirQr: vi.fn(async () => ({ tipo: 'sin_qr', motivo: 'fuera_de_ventana', mensaje: 'Estás fuera de tu horario de ingreso.' })),
  };
});

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>
  );
}

const infoAbierta = {
  abierta: true,
  estamentos: [
    { id: 1, nombre: 'Estudiante', requiereConfirmacion: false },
    { id: 2, nombre: 'Docente', requiereConfirmacion: true },
  ],
  huella: { sha256: 'AA:BB:CC', desde: '2026-10-01T00:00:00.000Z' },
};

describe('AltaPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getSugerenciaEstamento).mockResolvedValue({ estamentoId: null });
  });

  it('si el registro no está abierto, lo dice y no muestra el formulario', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue({ ...infoAbierta, abierta: false });
    renderPage(<AltaPage />);
    expect(await screen.findByText(/todavía no está abierto/)).toHaveAttribute('role', 'status');
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
  });

  it('muestra la huella del certificado para compararla', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue(infoAbierta);
    renderPage(<AltaPage />);
    expect(await screen.findByText('AA:BB:CC')).toBeInTheDocument();
    expect(screen.getByText(/compara su huella SHA-256/)).toBeInTheDocument();
  });

  it('liga cada error a su campo y exige la autorización', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue(infoAbierta);
    renderPage(<AltaPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Registrarme/ }));
    const documento = screen.getByLabelText('Número de documento');
    expect(documento).toHaveAttribute('aria-invalid', 'true');
    expect(documento).toHaveAccessibleDescription(/sin puntos, espacios ni guiones/);
    expect(screen.getByText(/debes autorizar el tratamiento/)).toBeInTheDocument();
    expect(apiClient.altaTitular).not.toHaveBeenCalled();
  });

  it('preselecciona el estamento por el dominio del correo', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue(infoAbierta);
    vi.mocked(apiClient.getSugerenciaEstamento).mockResolvedValue({ estamentoId: 2 });
    renderPage(<AltaPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correo de contacto'), 'luis@docentes.ejemplo.test');
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText('Estamento')).toHaveValue('2'));
  });

  it('completa el alta y muestra el código una sola vez', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue(infoAbierta);
    vi.mocked(apiClient.altaTitular).mockResolvedValue({
      estado: 'activo',
      codigoRecuperacion: 'ABCD-EFGH-IJKL-MNOP',
      estamentoPendiente: true,
    });
    renderPage(<AltaPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre completo'), 'Titular Sintético');
    await user.type(screen.getByLabelText('Número de documento'), '4000000001');
    await user.type(screen.getByLabelText('Correo de contacto'), 'titular@ejemplo.test');
    await user.selectOptions(screen.getByLabelText('Estamento'), '2');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Registrarme/ }));
    await waitFor(() =>
      expect(apiClient.altaTitular).toHaveBeenCalledWith({
        nombre: 'Titular Sintético',
        documento: '4000000001',
        correo: 'titular@ejemplo.test',
        estamentoId: 2,
        autorizaDatos: true,
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('ABCD-EFGH-IJKL-MNOP');
    expect(screen.getByText(/debe confirmar tu estamento/)).toBeInTheDocument();
  });

  it('un documento repetido queda en revisión', async () => {
    vi.mocked(apiClient.getInfoAlta).mockResolvedValue(infoAbierta);
    vi.mocked(apiClient.altaTitular).mockResolvedValue({ estado: 'en_revision' });
    renderPage(<AltaPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre completo'), 'Titular Sintético');
    await user.type(screen.getByLabelText('Número de documento'), '4000000001');
    await user.type(screen.getByLabelText('Correo de contacto'), 'titular@ejemplo.test');
    await user.selectOptions(screen.getByLabelText('Estamento'), '1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Registrarme/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(/revisión de un\s+administrador/);
  });
});

describe('RecuperarPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('vincula el teléfono y muestra el código nuevo', async () => {
    vi.mocked(apiClient.recuperarTelefono).mockResolvedValue({
      codigoRecuperacion: 'QRST-UVWX-YZ23-4567',
    });
    renderPage(<RecuperarPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Número de documento'), '4000000001');
    await user.type(screen.getByLabelText('Código de recuperación'), 'abcd-efgh-ijkl-mnop');
    await user.click(screen.getByRole('button', { name: 'Vincular este teléfono' }));
    expect(await screen.findByRole('status')).toHaveTextContent('QRST-UVWX-YZ23-4567');
  });

  it('explica el bloqueo por intentos', async () => {
    vi.mocked(apiClient.recuperarTelefono).mockRejectedValue(
      new apiClient.ApiError('demasiados intentos', 429)
    );
    renderPage(<RecuperarPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Número de documento'), '4000000001');
    await user.type(screen.getByLabelText('Código de recuperación'), 'abcd');
    await user.click(screen.getByRole('button', { name: 'Vincular este teléfono' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Espera 15 minutos/);
  });
});

describe('PortalPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sin vínculo ofrece registrarse o recuperar', async () => {
    vi.mocked(apiClient.getEstadoPortal).mockRejectedValue(new apiClient.ApiError('no', 401));
    renderPage(<PortalPage />);
    expect(await screen.findByRole('link', { name: 'Registrarme' })).toHaveAttribute('href', '/portal/alta');
    expect(screen.getByRole('link', { name: /vincular con mi código/ })).toHaveAttribute(
      'href',
      '/portal/recuperar'
    );
  });

  it('avisa si la credencial está suspendida', async () => {
    vi.mocked(apiClient.getEstadoPortal).mockResolvedValue({
      nombre: 'Titular Sintético',
      estado: 'suspendido',
      estamento: 'Estudiante',
      estamentoPendiente: false,
    });
    renderPage(<PortalPage />);
    expect(await screen.findByText(/suspendida/)).toHaveAttribute('role', 'status');
  });
});
