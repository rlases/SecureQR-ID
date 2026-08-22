import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Registro } from '@mi-app-qr/shared';
import { EditRecordModal } from '../src/components/EditRecordModal';

const mockRegistro: Registro = {
  id: 1,
  nombre: 'Ana Ríos',
  documento: '123',
  rol: 'estudiante',
  tipo: 'entrada',
  timestamp: '2026-01-01 10:00:00',
  creadoPorUsuarioId: 1,
  corrigeRegistroId: null,
  motivo: null,
};

describe('EditRecordModal', () => {
  it('no renderiza nada si isOpen es false', () => {
    const { container } = render(
      <EditRecordModal isOpen={false} registro={mockRegistro} onCancel={vi.fn()} onSave={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('precarga los campos del registro que se va a editar', () => {
    render(
      <EditRecordModal isOpen={true} registro={mockRegistro} onCancel={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByLabelText(/fecha y hora/i)).toHaveValue('2026-01-01T10:00');
    expect(screen.getByLabelText(/tipo/i)).toHaveValue('entrada');
    expect(screen.getByLabelText(/rol/i)).toHaveValue('estudiante');
  });

  it('exige la fecha y hora antes de enviar', async () => {
    const onSave = vi.fn();
    render(
      <EditRecordModal isOpen={true} registro={mockRegistro} onCancel={vi.fn()} onSave={onSave} />
    );

    await userEvent.clear(screen.getByLabelText(/fecha y hora/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText(/la fecha y hora es obligatoria/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('llama a onSave con los nuevos datos al guardar', async () => {
    const onSave = vi.fn();
    render(
      <EditRecordModal isOpen={true} registro={mockRegistro} onCancel={vi.fn()} onSave={onSave} />
    );

    await userEvent.selectOptions(screen.getByLabelText(/tipo/i), 'salida');
    await userEvent.clear(screen.getByLabelText(/rol/i));
    await userEvent.type(screen.getByLabelText(/rol/i), 'profesor');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(
      mockRegistro,
      {
        timestamp: '2026-01-01 10:00:00',
        tipo: 'salida',
        rol: 'profesor'
      }
    );
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <EditRecordModal isOpen={true} registro={mockRegistro} onCancel={onCancel} onSave={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
