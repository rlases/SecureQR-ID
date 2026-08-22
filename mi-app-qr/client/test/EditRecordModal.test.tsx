import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditRecordModal } from '../src/components/EditRecordModal';

const mockRegistro = {
  Nombre: 'Ana Ríos',
  Entrada: '2026-01-01T10:00:00',
  Salida: '2026-01-01T12:00:00',
  Rol: 'estudiante'
};

describe('EditRecordModal', () => {
  it('no renderiza nada si isOpen es false', () => {
    const { container } = render(
      <EditRecordModal isOpen={false} record={mockRegistro} onCancel={vi.fn()} onSave={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('precarga los campos del registro que se va a editar', () => {
    render(
      <EditRecordModal isOpen={true} record={mockRegistro} onCancel={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByLabelText(/entrada/i)).toHaveValue('2026-01-01T10:00');
    expect(screen.getByLabelText(/salida/i)).toHaveValue('2026-01-01T12:00');
    expect(screen.getByLabelText(/rol/i)).toHaveValue('estudiante');
  });

  it('exige la fecha de entrada antes de enviar', async () => {
    const onSave = vi.fn();
    render(
      <EditRecordModal isOpen={true} record={mockRegistro} onCancel={vi.fn()} onSave={onSave} />
    );

    await userEvent.clear(screen.getByLabelText(/entrada/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText(/la fecha de entrada es obligatoria/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('llama a onSave con los nuevos datos al guardar', async () => {
    const onSave = vi.fn();
    render(
      <EditRecordModal isOpen={true} record={mockRegistro} onCancel={vi.fn()} onSave={onSave} />
    );

    await userEvent.clear(screen.getByLabelText(/rol/i));
    await userEvent.type(screen.getByLabelText(/rol/i), 'profesor');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(
      mockRegistro,
      '2026-01-01 10:00:00', // El formato que devuelva (o el que se decida)
      '2026-01-01 12:00:00',
      'profesor'
    );
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <EditRecordModal isOpen={true} record={mockRegistro} onCancel={onCancel} onSave={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
