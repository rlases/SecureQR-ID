import type {
  LoginRequest,
  LoginResponse,
  CreateRegistroRequest,
  Registro,
  User,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersResponse,
  CorregirRegistroRequest,
} from '@mi-app-qr/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body.error ?? 'Error desconocido', res.status);
  }

  return body as T;
}

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function getMe(): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me');
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function createRegistro(
  data: CreateRegistroRequest
): Promise<{ registro: Registro }> {
  return request<{ registro: Registro }>('/api/registros', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listRegistros(): Promise<{ registros: Registro[] }> {
  return request<{ registros: Registro[] }>('/api/registros');
}

export function getRegistroHistory(id: number): Promise<{ historial: Registro[] }> {
  return request<{ historial: Registro[] }>(`/api/registros/${id}/historial`);
}

export function createUser(
  data: CreateUserRequest
): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listUsers(): Promise<ListUsersResponse> {
  return request<ListUsersResponse>('/api/users');
}

export function correctRegistro(
  id: number,
  data: CorregirRegistroRequest
): Promise<{ registro: Registro }> {
  return request<{ registro: Registro }>(`/api/registros/${id}/correcciones`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
