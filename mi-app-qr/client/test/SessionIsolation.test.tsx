import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import * as api from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

beforeEach(() => vi.resetAllMocks());

it.each(['/estamentos', '/consultas'])('al volver por historial a %s, el operador no ve datos almacenados por el admin', async (ruta) => {
  vi.mocked(api.getMe).mockResolvedValue({ user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '' } });
  vi.mocked(api.login).mockResolvedValue({ user: { id: 2, username: 'operador', role: 'operador', cargo: null, createdAt: '' } });
  vi.mocked(api.logout).mockResolvedValue({ ok: true });
  vi.mocked(api.getConfiguracionEstamentos).mockResolvedValue({
    estamentos: [{ id: 1, nombre: 'Configuración reservada', requiereConfirmacion: false, esBase: true, ventanas: [] }],
    excepciones: [], dominios: [],
  });
  vi.mocked(api.listCambiosConfiguracion).mockResolvedValue({ cambios: [] });
  vi.mocked(api.listRegistros).mockResolvedValue({ registros: [] });
  vi.mocked(api.listConsultasCid).mockResolvedValue({ consultas: [{ id: 1, usuario: 'admin', cid: 'AAAAAAAAAAAAAAAAAAAAAA', encontrado: true, motivo: 'Dato reservado del admin', en: '2026-10-24T15:00:00Z' }] });
  window.history.replaceState({}, '', ruta);
  render(<App />);
  if (ruta === '/estamentos') {
    expect(await screen.findByRole('heading', { name: 'Estamentos y horarios' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Configuración reservada').length).toBeGreaterThan(0));
  } else {
    expect(await screen.findByText('Dato reservado del admin')).toBeInTheDocument();
  }
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));
  await user.type(await screen.findByLabelText(/usuario/i), 'operador');
  await user.type(screen.getByLabelText(/contraseña/i), 'clave-correcta');
  await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
  await waitFor(() => expect(screen.getByText('operador')).toBeInTheDocument());
  vi.mocked(api.getConfiguracionEstamentos).mockRejectedValue(new api.ApiError('prohibido', 403));
  window.history.pushState({}, '', ruta);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.queryByText('Configuración reservada')).not.toBeInTheDocument();
  expect(screen.queryByText('Dato reservado del admin')).not.toBeInTheDocument();
  expect(ruta === '/estamentos' ? api.getConfiguracionEstamentos : api.listConsultasCid).toHaveBeenCalledTimes(1);
});
