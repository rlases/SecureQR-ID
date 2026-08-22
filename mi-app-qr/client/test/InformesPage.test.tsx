import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Registro } from '@mi-app-qr/shared';
import InformesPage from '../src/pages/InformesPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

const registros: Registro[] = [
  {
    id: 1,
    nombre: 'Ana Ríos',
    documento: 'DOC-1',
    rol: 'Recepción',
    tipo: 'entrada',
    timestamp: '2026-08-20 08:00:00',
    creadoPorUsuarioId: 1,
    corrigeRegistroId: null,
    motivo: null,
  },
  {
    id: 2,
    nombre: 'Beatriz Solano',
    documento: 'DOC-2',
    rol: 'Recepción',
    tipo: 'salida',
    timestamp: '2026-08-21 17:00:00',
    creadoPorUsuarioId: 1,
    corrigeRegistroId: null,
    motivo: null,
  },
  {
    id: 3,
    nombre: 'Carlos Mora',
    documento: 'DOC-3',
    rol: 'Proveedor externo',
    tipo: 'salida',
    timestamp: '2026-08-21 18:00:00',
    creadoPorUsuarioId: 1,
    corrigeRegistroId: null,
    motivo: null,
  },
  {
    id: 4,
    nombre: 'Diana López',
    documento: 'DOC-4',
    rol: 'Recepción',
    tipo: 'salida',
    timestamp: '2026-08-22 18:00:00',
    creadoPorUsuarioId: 1,
    corrigeRegistroId: null,
    motivo: null,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <InformesPage />
    </QueryClientProvider>
  );
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('InformesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros });
  });

  it('construye el filtro de rol únicamente con los roles presentes en los registros', async () => {
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Rol' });
    await screen.findByRole('option', { name: 'Recepción' });
    const options = within(select).getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual(['Todos los roles', 'Proveedor externo', 'Recepción']);
    expect(options).not.toContain('Estudiante');
    expect(options).not.toContain('Docente');
  });

  it('filtra inclusivamente por rango de fechas, rol y tipo', async () => {
    renderPage();
    await screen.findByText('Ana Ríos');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-21' } });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), 'Recepción');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'salida');

    expect(await screen.findByText('Beatriz Solano')).toBeInTheDocument();
    expect(screen.queryByText('Ana Ríos')).not.toBeInTheDocument();
    expect(screen.queryByText('Carlos Mora')).not.toBeInTheDocument();
    expect(screen.queryByText('Diana López')).not.toBeInTheDocument();
  });

  it('exporta a CSV solo los registros visibles después de filtrar', async () => {
    let exportedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:informe-prueba';
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderPage();
    await screen.findByText('Ana Ríos');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), 'Proveedor externo');
    await userEvent.click(screen.getByRole('button', { name: /exportar csv/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(exportedBlob).toBeDefined();
    const csv = await readBlob(exportedBlob!);
    expect(csv).toContain('Carlos Mora');
    expect(csv).toContain('Proveedor externo');
    expect(csv).not.toContain('Ana Ríos');
    expect(csv).not.toContain('Beatriz Solano');
  });
});
