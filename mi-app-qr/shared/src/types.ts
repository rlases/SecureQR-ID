// Nivel de permiso: fijo y universal, no depende de ninguna institución (ADR-0009).
// 'admin' gestiona usuarios y ve todo; 'operador' registra y consulta.
export type UserRole = 'admin' | 'operador';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  // Puesto de trabajo, en texto libre — "vigilancia", "docente", "recepción", lo que
  // corresponda a cada institución. Nunca se usa para autorización (ADR-0009).
  cargo: string | null;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}

export interface Registro {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
  timestamp: string;
  creadoPorUsuarioId: number;
}

export interface CreateRegistroRequest {
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
}

export interface ApiErrorResponse {
  error: string;
}

export interface CreateUserRequest {
  username: string;
  role: UserRole;
  cargo?: string;
}

export interface CreateUserResponse {
  user: User;
  // Se devuelve UNA sola vez, generada por el servidor. No se puede recuperar
  // después — no se guarda en texto plano en ningún lado, solo su hash.
  generatedPassword: string;
}

export interface ListUsersResponse {
  users: User[];
}
