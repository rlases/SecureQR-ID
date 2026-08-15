export type UserRole = 'vigilancia' | 'administrativo' | 'docente';

export interface User {
  id: number;
  username: string;
  role: UserRole;
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
