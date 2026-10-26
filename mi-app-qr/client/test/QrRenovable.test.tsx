import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import QrRenovable from '../src/pages/portal/QrRenovable';
import * as apiClient from '../src/lib/apiClient';

// Página del QR que se renueva (issue #85). Datos sintéticos.

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (texto: string) => `data:image/png;base64,${btoa(texto)}`) },
}));

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/apiClient')>();
  return { ApiError: real.ApiError, pedirQr: vi.fn() };
});

function qr(token: string, renovarEnSegundos = 45) {
  return {
    tipo: 'qr' as const,
    token,
    expiraEn: new Date(Date.now() + 60_000).toISOString(),
    renovarEnSegundos,
  };
}

/** Deja correr las promesas pendientes (fetch simulado, generación del QR). */
async function vaciar() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe('QrRenovable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('muestra el QR y pide uno nuevo cuando lo indica el servidor', async () => {
    vi.mocked(apiClient.pedirQr).mockResolvedValueOnce(qr('token-A')).mockResolvedValueOnce(qr('token-B'));
    render(<QrRenovable />);
    await vaciar();
    const imagen = screen.getByRole('img', { name: 'Tu código QR de ingreso' });
    expect(imagen).toHaveAttribute('src', `data:image/png;base64,${btoa('token-A')}`);
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);

    // Justo antes de los 45 s no pide; a los 45 s, sí.
    await act(async () => vi.advanceTimersByTime(44_000));
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1_000));
    await vaciar();
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('img')).toHaveAttribute('src', `data:image/png;base64,${btoa('token-B')}`);
  });

  it('no guarda el token en ningún almacenamiento del navegador', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    vi.mocked(apiClient.pedirQr).mockResolvedValue(qr('token-secreto'));
    render(<QrRenovable />);
    await vaciar();
    await act(async () => vi.advanceTimersByTime(45_000));
    await vaciar();
    expect(setItem).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('token-secreto');
  });

  it('fuera del horario muestra el mensaje del servidor y no programa renovaciones', async () => {
    vi.mocked(apiClient.pedirQr).mockResolvedValue({
      tipo: 'sin_qr',
      motivo: 'fuera_de_ventana',
      mensaje: 'Estás fuera de tu horario de ingreso. Vuelve a intentarlo dentro de tu horario.',
    });
    render(<QrRenovable />);
    await vaciar();
    expect(screen.getByRole('status')).toHaveTextContent('Estás fuera de tu horario de ingreso');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);
  });

  it('si falla la red, avisa y reintenta solo', async () => {
    vi.mocked(apiClient.pedirQr)
      .mockRejectedValueOnce(new apiClient.ApiError('caído', 503))
      .mockResolvedValueOnce(qr('token-C'));
    render(<QrRenovable />);
    await vaciar();
    expect(screen.getByRole('alert')).toHaveTextContent(/se reintenta solo/);
    await act(async () => vi.advanceTimersByTime(10_000));
    await vaciar();
    expect(screen.getByRole('img')).toHaveAttribute('src', `data:image/png;base64,${btoa('token-C')}`);
  });

  it('al perder el vínculo avisa al padre y deja de pedir', async () => {
    const onSinVinculo = vi.fn();
    vi.mocked(apiClient.pedirQr).mockResolvedValue({ tipo: 'sin_vinculo' });
    render(<QrRenovable onSinVinculo={onSinVinculo} />);
    await vaciar();
    expect(onSinVinculo).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);
  });

  it('al desmontarse cancela la renovación pendiente', async () => {
    vi.mocked(apiClient.pedirQr).mockResolvedValue(qr('token-D'));
    const { unmount } = render(<QrRenovable />);
    await vaciar();
    unmount();
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);
  });

  it('una nueva función del padre no reinicia el ciclo', async () => {
    vi.mocked(apiClient.pedirQr).mockResolvedValue(qr('token-E'));
    const { rerender } = render(<QrRenovable onSinVinculo={() => {}} />);
    await vaciar();
    rerender(<QrRenovable onSinVinculo={() => {}} />);
    rerender(<QrRenovable onSinVinculo={() => {}} />);
    await vaciar();
    expect(apiClient.pedirQr).toHaveBeenCalledTimes(1);
  });
});
