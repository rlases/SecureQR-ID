import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Registro } from '@mi-app-qr/shared';
import { AuthProvider } from '../src/auth/AuthContext';
import RegistrosPage from '../src/pages/RegistrosPage';
import * as api from '../src/lib/apiClient';
import * as csv from '../src/lib/registrosCsv';

vi.mock('../src/lib/apiClient');
vi.mock('../src/lib/registrosCsv', async (original) => ({
  ...await original<typeof csv>(), downloadCsv: vi.fn(),
}));

const entrada: Registro = {
  id: 1, nombre: 'Ana Ríos', documento: '12345678', rol: 'Investigadora visitante',
  tipo: 'entrada', timestamp: '2026-01-01 10:00:00', creadoPorUsuarioId: 1,
  corrigeRegistroId: null, motivo: null,
};
let queryClient: QueryClient;

function renderPage() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><AuthProvider><RegistrosPage /></AuthProvider></QueryClientProvider>);
}

async function fillForm() {
  await screen.findByText('Ana Ríos');
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: entrada.nombre } });
  fireEvent.change(screen.getByLabelText('Documento'), { target: { value: entrada.documento } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: entrada.rol } });
}

async function openWarning() {
  await fillForm();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
  return within(await screen.findByRole('dialog', { name: 'Posible salida olvidada' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getMe).mockResolvedValue({ user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '' } });
  vi.mocked(api.listRegistros).mockResolvedValue({ registros: [entrada] });
  vi.mocked(api.createRegistro).mockResolvedValue({ registro: { ...entrada, id: 2 } });
});
afterEach(() => queryClient?.clear());

describe('componentes integrados en RegistrosPage', () => {
  it('rellena desde el parser real y solo guarda tras confirmar el formulario', async () => {
    vi.mocked(api.listRegistros).mockResolvedValue({ registros: [] });
    renderPage();
    await screen.findByText(/sin registros/i);
    fireEvent.change(screen.getByLabelText('Texto del QR'), { target: { value: 'Ana Ríos12345678Ingeniería de SistemasBogotáVálido hasta 31 de Diciembre de 2026' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cargar datos del QR' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Ríos');
    expect(screen.getByLabelText('Documento')).toHaveValue('12345678');
    expect(screen.getByLabelText('Rol')).toHaveValue('Ingeniería de Sistemas');
    expect(api.createRegistro).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    await waitFor(() => expect(api.createRegistro).toHaveBeenCalledWith({
      nombre: 'Ana Ríos', documento: '12345678', rol: 'Ingeniería de Sistemas', tipo: 'entrada',
    }));
  });

  it('muestra el error del QR sin sobrescribir el formulario ni crear registros', async () => {
    renderPage();
    await fillForm();
    fireEvent.change(screen.getByLabelText('Texto del QR'), { target: { value: 'QR inválido' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cargar datos del QR' }));
    expect(screen.getByRole('status')).toHaveTextContent(/código QR inválido/i);
    expect(screen.getByLabelText('Nombre')).toHaveValue(entrada.nombre);
    expect(api.createRegistro).not.toHaveBeenCalled();
  });

  it('exporta todos o el rol exacto, incluido un rol llamado all, y reinicia el filtro', async () => {
    const other = { ...entrada, id: 2, nombre: 'Luis', rol: 'all' };
    vi.mocked(api.listRegistros).mockResolvedValue({ registros: [entrada, other] });
    renderPage();
    await screen.findByText('Ana Ríos');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Todos' }));
    expect(csv.downloadCsv).toHaveBeenLastCalledWith([entrada, other]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await userEvent.type(screen.getByLabelText('Filtrar por rol'), 'all');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Filtrados' }));
    expect(csv.downloadCsv).toHaveBeenLastCalledWith([other]);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(screen.getByLabelText('Filtrar por rol')).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toHaveFocus();
  });

  it('cancelar la advertencia no escribe; continuar crea únicamente una nueva entrada', async () => {
    renderPage();
    let dialog = await openWarning();
    expect(api.createRegistro).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Documento')).toHaveValue(entrada.documento);
    dialog = await openWarning();
    await userEvent.click(dialog.getByRole('button', { name: /registrar nueva entrada/i }));
    await waitFor(() => expect(api.createRegistro).toHaveBeenCalledTimes(1));
    expect(api.createRegistro).toHaveBeenCalledWith({ nombre: entrada.nombre, documento: entrada.documento, rol: entrada.rol, tipo: 'entrada' });
    expect(api.correctRegistro).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.listRegistros).toHaveBeenCalledTimes(2);
  });

  it('revisar abre la corrección append-only con motivo y no registra automáticamente otra entrada', async () => {
    vi.mocked(api.correctRegistro).mockResolvedValue({ registro: { ...entrada, id: 3, corrigeRegistroId: 1, motivo: 'Nombre incompleto' } });
    renderPage();
    const warning = await openWarning();
    await userEvent.click(warning.getByRole('button', { name: 'Revisar registro anterior' }));
    const dialog = within(screen.getByRole('dialog', { name: /corregir registro/i }));
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar corrección' }));
    expect(await dialog.findByText('El motivo es obligatorio')).toBeInTheDocument();
    expect(api.correctRegistro).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText('Motivo de la corrección'), 'Nombre incompleto');
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar corrección' }));
    await waitFor(() => expect(api.correctRegistro).toHaveBeenCalledWith(1, expect.objectContaining({ motivo: 'Nombre incompleto' })));
    expect(api.createRegistro).not.toHaveBeenCalled();
  });

  it('un operador puede confirmar otra entrada pero no abrir correcciones', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ user: { id: 2, username: 'operador', role: 'operador', cargo: null, createdAt: '' } });
    renderPage();
    const dialog = await openWarning();
    expect(dialog.queryByRole('button', { name: 'Revisar registro anterior' })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: /registrar nueva entrada/i }));
    await waitFor(() => expect(api.createRegistro).toHaveBeenCalledTimes(1));
    expect(api.correctRegistro).not.toHaveBeenCalled();
  });

  it('conserva la confirmación al fallar y bloquea doble envío mientras guarda', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.createRegistro).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    renderPage();
    const dialog = await openWarning();
    await userEvent.click(dialog.getByRole('button', { name: /registrar nueva entrada/i }));
    expect(dialog.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    reject(new Error('Sin conexión'));
    expect(await dialog.findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);
    await userEvent.click(dialog.getByRole('button', { name: /registrar nueva entrada/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createRegistro).toHaveBeenCalledTimes(2);
  });

  it('registra una salida sin convertirla en entrada ni mostrar la advertencia', async () => {
    renderPage();
    await fillForm();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de registro'), 'salida');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(api.createRegistro).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'salida' })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('impide crear y exportar si falla la consulta y permite reintentar', async () => {
    vi.mocked(api.listRegistros).mockRejectedValueOnce(new Error('Sin conexión'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no fue posible cargar/i);
    expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Ana Ríos');
    expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeEnabled();
  });
});
