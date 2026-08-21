import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Registro } from '@mi-app-qr/shared';
import { CorregirRegistroModal } from '../src/components/CorregirRegistroModal';

const registro: Registro = {
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

describe('CorregirRegistroModal', () => {
  it('no renderiza nada si registro es null', () => {
    const { container } = render(
      <CorregirRegistroModal registro={null} onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('precarga los campos del registro que se va a corregir', () => {
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue('Ana Ríos');
    expect(screen.getByLabelText(/^documento$/i)).toHaveValue('123');
    expect(screen.getByLabelText(/^rol$/i)).toHaveValue('estudiante');
    expect(screen.getByLabelText(/fecha y hora/i)).toHaveValue('2026-01-01T10:00');
    expect(screen.getByLabelText(/motivo/i)).toHaveValue('');
  });

  it('exige motivo antes de enviar', async () => {
    const onSubmit = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />
    );

    await userEvent.click(screen.getByRole('button', { name: /guardar corrección/i }));

    expect(await screen.findByText(/motivo es obligatorio/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía los datos corregidos con el timestamp convertido de vuelta al formato del servidor', async () => {
    const onSubmit = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />
    );

    await userEvent.clear(screen.getByLabelText(/^nombre$/i));
    await userEvent.type(screen.getByLabelText(/^nombre$/i), 'Ana María Ríos');
    await userEvent.type(screen.getByLabelText(/motivo/i), 'corrigiendo el nombre completo');
    await userEvent.click(screen.getByRole('button', { name: /guardar corrección/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: 'Ana María Ríos',
      documento: '123',
      rol: 'estudiante',
      tipo: 'entrada',
      timestamp: '2026-01-01 10:00:00',
      motivo: 'corrigiendo el nombre completo',
    });
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={onCancel} onSubmit={vi.fn()} isSubmitting={false} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
