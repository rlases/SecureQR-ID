import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportCsvModal } from '../src/components/ExportCsvModal';

describe('ExportCsvModal', () => {
  it('no renderiza nada si isOpen es false', () => {
    const { container } = render(
      <ExportCsvModal isOpen={false} onCancel={vi.fn()} onExport={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('llama a onExport con null al hacer clic en Exportar Todos', async () => {
    const onExport = vi.fn();
    render(
      <ExportCsvModal isOpen={true} onCancel={vi.fn()} onExport={onExport} />
    );

    await userEvent.click(screen.getByRole('button', { name: /exportar todos/i }));
    expect(onExport).toHaveBeenCalledWith(null);
  });

  it('llama a onExport con el rol filtrado al escribir y hacer clic en Exportar Filtrados', async () => {
    const onExport = vi.fn();
    render(
      <ExportCsvModal isOpen={true} onCancel={vi.fn()} onExport={onExport} />
    );

    await userEvent.type(screen.getByRole('textbox', { name: /filtrar por rol/i }), 'estudiante');
    await userEvent.click(screen.getByRole('button', { name: /exportar filtrados/i }));
    expect(onExport).toHaveBeenCalledWith('estudiante');
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <ExportCsvModal isOpen={true} onCancel={onCancel} onExport={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

