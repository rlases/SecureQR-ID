import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Registro } from '@mi-app-qr/shared';
import { HistorialCorreccionesModal } from '../src/components/HistorialCorreccionesModal';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

const original: Registro = {
  id: 1,
  nombre: 'Ana Rios',
  documento: '123',
  rol: 'Investigadora visitante',
  tipo: 'entrada',
  timestamp: '2026-01-01 10:00:00',
  creadoPorUsuarioId: 1,
  corrigeRegistroId: null,
  motivo: null,
};

const vigente: Registro = {
  ...original,
  id: 2,
  nombre: 'Ana Ríos',
  corrigeRegistroId: 1,
  motivo: 'faltaba la tilde',
};

function renderModal(registro: Registro | null, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <HistorialCorreccionesModal registro={registro} onClose={onClose} />
      </QueryClientProvider>
    ),
  };
}

describe('HistorialCorreccionesModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getRegistroHistory).mockResolvedValue({ historial: [original, vigente] });
  });

  it('no renderiza ni consulta si no hay registro seleccionado', () => {
    const { container } = renderModal(null);

    expect(container).toBeEmptyDOMElement();
    expect(apiClient.getRegistroHistory).not.toHaveBeenCalled();
  });

  it('muestra la cadena cronológica como una vista de solo lectura', async () => {
    renderModal(vigente);

    expect(screen.getByText(/cargando historial/i)).toBeInTheDocument();
    expect(await screen.findByText('Registro original')).toBeInTheDocument();
    expect(screen.getByText('Corrección 1')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getAllByText('Investigadora visitante')).toHaveLength(2);
    expect(screen.getByText('faltaba la tilde')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cierra con Escape y devuelve el foco al control que lo abrió', async () => {
    function Harness() {
      const [seleccionado, setSeleccionado] = useState<Registro | null>(null);
      return (
        <>
          <button type="button" onClick={() => setSeleccionado(vigente)}>
            Abrir historial
          </button>
          <HistorialCorreccionesModal
            registro={seleccionado}
            onClose={() => setSeleccionado(null)}
          />
        </>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    );
    const trigger = screen.getByRole('button', { name: /abrir historial/i });
    await userEvent.click(trigger);

    const closeButton = await screen.findByRole('button', { name: /cerrar historial/i });
    await waitFor(() => expect(closeButton).toHaveFocus());
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
