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
  Estamento,
  EstamentoDetalle,
  ExcepcionCalendario,
  ReglaDominio,
  VentanaHorario,
  AltaTitularRequest,
  AltaTitularResponse,
  EstadoPortal,
  InfoAltaPortal,
  RecuperarRequest,
  RecuperarResponse,
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

  // 204 (borrados) no trae cuerpo.
  const body = res.status === 204 ? {} : await res.json();

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

// --- Estamentos y horarios (ADR-0016, punto 5; solo admin) ----------------------------

export interface ConfiguracionEstamentos {
  estamentos: EstamentoDetalle[];
  excepciones: ExcepcionCalendario[];
  dominios: ReglaDominio[];
}

export interface CambioConfiguracion {
  id: number;
  usuario: string;
  entidad: string;
  entidadId: number | null;
  accion: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  en: string;
}

export function getConfiguracionEstamentos(): Promise<ConfiguracionEstamentos> {
  return request<ConfiguracionEstamentos>('/api/estamentos');
}

export function createEstamento(data: {
  nombre: string;
  requiereConfirmacion: boolean;
}): Promise<Estamento> {
  return request<Estamento>('/api/estamentos', { method: 'POST', body: JSON.stringify(data) });
}

export function updateEstamento(
  id: number,
  data: { nombre?: string; requiereConfirmacion?: boolean }
): Promise<Estamento> {
  return request<Estamento>(`/api/estamentos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function setEstamentoBase(id: number): Promise<Estamento> {
  return request<Estamento>(`/api/estamentos/${id}/base`, { method: 'POST' });
}

export function deleteEstamento(id: number): Promise<void> {
  return request<void>(`/api/estamentos/${id}`, { method: 'DELETE' });
}

export function replaceVentanas(
  id: number,
  ventanas: VentanaHorario[]
): Promise<{ ventanas: VentanaHorario[] }> {
  return request<{ ventanas: VentanaHorario[] }>(`/api/estamentos/${id}/ventanas`, {
    method: 'PUT',
    body: JSON.stringify({ ventanas }),
  });
}

export function createExcepcion(
  data: Omit<ExcepcionCalendario, 'id'>
): Promise<ExcepcionCalendario> {
  return request<ExcepcionCalendario>('/api/estamentos/excepciones', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteExcepcion(id: number): Promise<void> {
  return request<void>(`/api/estamentos/excepciones/${id}`, { method: 'DELETE' });
}

export function createDominio(data: { dominio: string; estamentoId: number }): Promise<ReglaDominio> {
  return request<ReglaDominio>('/api/estamentos/dominios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteDominio(id: number): Promise<void> {
  return request<void>(`/api/estamentos/dominios/${id}`, { method: 'DELETE' });
}

export function listCambiosConfiguracion(): Promise<{ cambios: CambioConfiguracion[] }> {
  return request<{ cambios: CambioConfiguracion[] }>('/api/estamentos/cambios');
}

// --- Portal del titular (ADR-0016, puntos 2 a 4) ---------------------------------------
// La sesión del titular es la cookie del dispositivo, distinta de la del personal.

export function getInfoAlta(): Promise<InfoAltaPortal> {
  return request<InfoAltaPortal>('/api/portal/alta');
}

export function getSugerenciaEstamento(correo: string): Promise<{ estamentoId: number | null }> {
  return request<{ estamentoId: number | null }>(
    `/api/portal/alta/sugerencia?correo=${encodeURIComponent(correo)}`
  );
}

export function altaTitular(data: AltaTitularRequest): Promise<AltaTitularResponse> {
  return request<AltaTitularResponse>('/api/portal/alta', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function recuperarTelefono(data: RecuperarRequest): Promise<RecuperarResponse> {
  return request<RecuperarResponse>('/api/portal/recuperar', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getEstadoPortal(): Promise<EstadoPortal> {
  return request<EstadoPortal>('/api/portal/yo');
}
