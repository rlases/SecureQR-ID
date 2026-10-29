import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EstamentosPage from '../src/pages/EstamentosPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/apiClient')>();
  return {
    ApiError: real.ApiError,
    getConfiguracionEstamentos: vi.fn(),
    listCambiosConfiguracion: vi.fn(),
    createEstamento: vi.fn(),
    updateEstamento: vi.fn(),
    setEstamentoBase: vi.fn(),
    deleteEstamento: vi.fn(),
    replaceVentanas: vi.fn(),
    createExcepcion: vi.fn(),
    deleteExcepcion: vi.fn(),
    createDominio: vi.fn(),
    deleteDominio: vi.fn(),
  };
});

const estudiante = {
  id: 1,
  nombre: 'Estudiante',
  requiereConfirmacion: false,
  esBase: true,
  ventanas: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }],
};
const docente = {
  id: 2,
  nombre: 'Docente',
  requiereConfirmacion: true,
  esBase: false,
  ventanas: [],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EstamentosPage />
    </QueryClientProvider>
  );
}

describe('EstamentosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.listCambiosConfiguracion).mockResolvedValue({ cambios: [] });
  });

  it('en una instalación nueva avisa que sin base no hay altas', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [],
      excepciones: [],
      dominios: [],
    });
    renderPage();
    expect(await screen.findByText(/no admite altas/)).toHaveAttribute('role', 'status');
    expect(screen.getByText(/Todavía no hay estamentos/)).toBeInTheDocument();
  });

  it('crea un estamento con la marca de confirmación', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [],
      excepciones: [],
      dominios: [],
    });
    vi.mocked(apiClient.createEstamento).mockResolvedValue({
      id: 3,
      nombre: 'Externo',
      requiereConfirmacion: true,
      esBase: false,
    });
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre'), 'Externo');
    await user.click(screen.getByLabelText('Requiere confirmación del admin'));
    await user.click(screen.getByRole('button', { name: 'Crear estamento' }));
    await waitFor(() =>
      expect(apiClient.createEstamento).toHaveBeenCalledWith({
        nombre: 'Externo',
        requiereConfirmacion: true,
      })
    );
  });

  it('lista estamentos, marca la base y no ofrece elegir como base uno con confirmación', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [docente, estudiante],
      excepciones: [],
      dominios: [],
    });
    renderPage();
    expect(await screen.findByText('Base')).toBeInTheDocument();
    expect(screen.queryByText(/no admite altas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir Docente como base' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Borrar Estudiante' })).not.toBeInTheDocument();
    expect(screen.getByText(/sin ventanas: no recibe QR/)).toBeInTheDocument();
  });

  it('agrega una ventana y guarda la lista completa', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [estudiante],
      excepciones: [],
      dominios: [],
    });
    vi.mocked(apiClient.replaceVentanas).mockResolvedValue({ ventanas: [] });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('06:00 a 18:00');
    await user.selectOptions(screen.getByLabelText('Día'), '6');
    await user.clear(screen.getByLabelText('Hora de inicio'));
    await user.type(screen.getByLabelText('Hora de inicio'), '08:00');
    await user.clear(screen.getByLabelText('Hora de fin'));
    await user.type(screen.getByLabelText('Hora de fin'), '12:00');
    await user.click(screen.getByRole('button', { name: 'Agregar ventana' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ventanas de Estudiante' }));
    await waitFor(() =>
      expect(apiClient.replaceVentanas).toHaveBeenCalledWith(1, [
        { diaSemana: 1, inicio: '06:00', fin: '18:00' },
        { diaSemana: 6, inicio: '08:00', fin: '12:00' },
      ])
    );
  });

  it('muestra el error del servidor con role="alert"', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [estudiante],
      excepciones: [],
      dominios: [],
    });
    vi.mocked(apiClient.replaceVentanas).mockRejectedValue(
      new apiClient.ApiError('Cada ventana debe terminar después de empezar, el mismo día.', 400)
    );
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Guardar ventanas de Estudiante' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/terminar después de empezar/);
  });

  it('crea un festivo para todos los estamentos', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [estudiante],
      excepciones: [],
      dominios: [],
    });
    vi.mocked(apiClient.createExcepcion).mockResolvedValue({
      id: 1,
      fechaDesde: '2026-12-08',
      fechaHasta: '2026-12-08',
      tipo: 'cierre',
      estamentoId: null,
      descripcion: 'Festivo',
      ventanas: [],
    });
    renderPage();
    const user = userEvent.setup();
    const seccion = within(
      (await screen.findByRole('heading', { name: 'Excepciones de calendario' })).closest('section')!
    );
    await user.type(seccion.getByLabelText('Desde'), '2026-12-08');
    await user.type(seccion.getByLabelText('Descripción'), 'Festivo');
    await user.click(seccion.getByRole('button', { name: 'Agregar excepción' }));
    await waitFor(() =>
      expect(apiClient.createExcepcion).toHaveBeenCalledWith({
        fechaDesde: '2026-12-08',
        fechaHasta: '2026-12-08',
        tipo: 'cierre',
        estamentoId: null,
        descripcion: 'Festivo',
        ventanas: [],
      })
    );
  });

  it('muestra el registro de cambios con quién y cuándo', async () => {
    vi.mocked(apiClient.getConfiguracionEstamentos).mockResolvedValue({
      estamentos: [estudiante],
      excepciones: [],
      dominios: [],
    });
    vi.mocked(apiClient.listCambiosConfiguracion).mockResolvedValue({
      cambios: [
        {
          id: 1,
          usuario: 'admin',
          entidad: 'ventanas',
          entidadId: 1,
          accion: 'reemplazar',
          valorAnterior: [],
          valorNuevo: [{ diaSemana: 1, inicio: '06:00', fin: '18:00' }],
          en: '2026-10-24T15:00:00.000Z',
        },
      ],
    });
    renderPage();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('admin')).toBeInTheDocument();
    expect(within(tabla).getByText('ventanas · reemplazar')).toBeInTheDocument();
  });
});
