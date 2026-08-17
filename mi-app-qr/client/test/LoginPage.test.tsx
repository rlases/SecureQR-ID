import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../src/pages/LoginPage';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/apiClient')>();
  return {
    ...actual,
    login: vi.fn(),
    getMe: vi.fn(),
    logout: vi.fn(),
    createRegistro: vi.fn(),
    listRegistros: vi.fn(),
  };
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));
  });

  it('muestra el formulario de inicio de sesión', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
    });
  });

  it('muestra un error de validación si se envía vacío', async () => {
    renderLoginPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
    expect(apiClient.login).not.toHaveBeenCalled();
  });

  it('envía las credenciales y llama a login() con valores correctos', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'clave-correcta-123');
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() =>
      expect(apiClient.login).toHaveBeenCalledWith({ username: 'admin', password: 'clave-correcta-123' })
    );
  });

  it('muestra el error del servidor si las credenciales son incorrectas', async () => {
    vi.mocked(apiClient.login).mockRejectedValue(new apiClient.ApiError('usuario o contraseña incorrectos', 401));

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'mal');
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText(/usuario o contraseña incorrectos/i)).toBeInTheDocument();
  });
});
