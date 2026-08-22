import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgottenOutModal } from '../src/components/ForgottenOutModal';

const mockRegistro = {
  Nombre: 'Ana Ríos',
  Entrada: '2026-01-01 10:00:00'
};

describe('ForgottenOutModal', () => {
  it('no renderiza nada si isOpen es false o record es null', () => {
    const { container } = render(
      <ForgottenOutModal isOpen={false} record={null} onCancel={vi.fn()} onCorrect={vi.fn()} onForce={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('llama a onCorrect al hacer clic en Corregir Salida', async () => {
    const onCorrect = vi.fn();
    render(
      <ForgottenOutModal isOpen={true} record={mockRegistro} onCancel={vi.fn()} onCorrect={onCorrect} onForce={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /corregir salida/i }));
    expect(onCorrect).toHaveBeenCalled();
  });

  it('llama a onForce al hacer clic en Forzar Nueva Entrada', async () => {
    const onForce = vi.fn();
    render(
      <ForgottenOutModal isOpen={true} record={mockRegistro} onCancel={vi.fn()} onCorrect={vi.fn()} onForce={onForce} />
    );

    await userEvent.click(screen.getByRole('button', { name: /forzar nueva entrada/i }));
    expect(onForce).toHaveBeenCalled();
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <ForgottenOutModal isOpen={true} record={mockRegistro} onCancel={onCancel} onCorrect={vi.fn()} onForce={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
