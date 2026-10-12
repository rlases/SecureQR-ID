import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Registro } from '@mi-app-qr/shared';
import { ForgottenOutModal } from '../src/components/ForgottenOutModal';

const mockRegistro: Registro = {
  id: 2,
  nombre: 'Ana Ríos',
  documento: '12345678',
  rol: 'estudiante',
  tipo: 'entrada',
  timestamp: '2026-01-01 10:00:00',
  creadoPorUsuarioId: 1,
  corrigeRegistroId: null,
  motivo: null,
};

describe('ForgottenOutModal', () => {
  it('no renderiza nada si isOpen es false o registro es null', () => {
    const { container } = render(
      <ForgottenOutModal canCorrect={true} isOpen={false} registro={null} onCancel={vi.fn()} onCorrect={vi.fn()} onForce={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('llama a onCorrect al revisar el registro anterior', async () => {
    const onCorrect = vi.fn();
    render(
      <ForgottenOutModal canCorrect={true} isOpen={true} registro={mockRegistro} onCancel={vi.fn()} onCorrect={onCorrect} onForce={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /revisar registro anterior/i }));
    expect(onCorrect).toHaveBeenCalled();
  });

  it('llama a onForce al confirmar una nueva entrada', async () => {
    const onForce = vi.fn();
    render(
      <ForgottenOutModal canCorrect={true} isOpen={true} registro={mockRegistro} onCancel={vi.fn()} onCorrect={vi.fn()} onForce={onForce} />
    );

    await userEvent.click(screen.getByRole('button', { name: /registrar nueva entrada de todos modos/i }));
    expect(onForce).toHaveBeenCalled();
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <ForgottenOutModal canCorrect={true} isOpen={true} registro={mockRegistro} onCancel={onCancel} onCorrect={vi.fn()} onForce={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

