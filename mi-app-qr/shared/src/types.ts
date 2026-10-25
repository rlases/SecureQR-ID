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
  // NULL en un registro original. En una corrección, apunta a la fila que
  // reemplaza (el original o una corrección previa, si se encadena).
  corrigeRegistroId: number | null;
  // NULL en un registro original. Obligatorio en una corrección: por qué se
  // corrigió (ADR-0008, invariante append-only — nunca se sobrescribe).
  motivo: string | null;
}

export interface CreateRegistroRequest {
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
}

export interface CorregirRegistroRequest {
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
  timestamp: string;
  motivo: string;
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

// --- Registro de credenciales y portal del titular (ADR-0016) -------------------------
// Vocabulario de ADR-0009: «titular», no «estudiante». Los estamentos no vienen
// predefinidos; los crea el admin de cada instalación.

export interface Estamento {
  id: number;
  nombre: string;
  // Tiene más acceso que el estamento base: mientras un admin no confirme a un
  // titular en él, ese titular recibe las ventanas del estamento base.
  requiereConfirmacion: boolean;
  esBase: boolean;
}

export type EstadoTitular = 'activo' | 'en_revision' | 'suspendido' | 'anonimizado';

export interface Titular {
  id: number;
  // Identificador interno opaco; no deriva de los datos personales.
  ref: string;
  nombre: string;
  documento: string;
  // Solo contacto: no se verifica, no es único y el sistema no envía mensajes.
  correo: string;
  estamentoId: number;
  estamentoConfirmado: boolean;
  estado: EstadoTitular;
  creadoEn: string;
}

export type EstadoCredencial = 'vigente' | 'reemplazada' | 'revocada';

export interface Credencial {
  // 128 bits en Base64url sin relleno (docs/SQRID-1.md); opaco.
  cid: string;
  titularId: number;
  estado: EstadoCredencial;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export type EstadoDispositivo = 'activo' | 'reemplazado' | 'revocado';

// Ventana de ingreso semanal, en la hora local de la sede. «fin» puede ser «24:00».
export interface VentanaHorario {
  diaSemana: number; // 1 = lunes … 7 = domingo
  inicio: string; // HH:MM
  fin: string; // HH:MM
}

export interface EstamentoDetalle extends Estamento {
  ventanas: VentanaHorario[];
}

// cierre: nadie entra · reemplazo: valen solo las ventanas de la excepción.
export type TipoExcepcion = 'cierre' | 'reemplazo';

export interface ExcepcionCalendario {
  id: number;
  fechaDesde: string; // AAAA-MM-DD
  fechaHasta: string; // AAAA-MM-DD, inclusive
  tipo: TipoExcepcion;
  // null = todos los estamentos.
  estamentoId: number | null;
  descripcion: string;
  ventanas: { inicio: string; fin: string }[];
}

export interface ReglaDominio {
  id: number;
  dominio: string;
  estamentoId: number;
}

// --- Portal del titular (ADR-0016, puntos 2 a 4) ---------------------------------------

export interface InfoAltaPortal {
  // false mientras el admin no elija un estamento base: no se admiten altas.
  abierta: boolean;
  estamentos: Pick<Estamento, 'id' | 'nombre' | 'requiereConfirmacion'>[];
  // Huella SHA-256 del certificado del servidor, para compararla con la del navegador.
  huella: { sha256: string; desde: string } | null;
}

export interface AltaTitularRequest {
  nombre: string;
  documento: string;
  correo: string;
  estamentoId: number;
  autorizaDatos: true;
}

export type AltaTitularResponse =
  | {
      estado: 'activo';
      // Se muestra UNA sola vez; el servidor solo guarda su hash.
      codigoRecuperacion: string;
      estamentoPendiente: boolean;
    }
  | { estado: 'en_revision' };

export interface RecuperarRequest {
  documento: string;
  codigo: string;
}

export interface RecuperarResponse {
  // El código usado deja de servir; este es el nuevo, que se muestra una sola vez.
  codigoRecuperacion: string;
}

export interface EstadoPortal {
  nombre: string;
  estado: 'activo' | 'suspendido';
  estamento: string;
  estamentoPendiente: boolean;
}

// --- Consulta auditada cid → persona (ADR-0016, punto 7; solo admin) --------------------

export type ResultadoConsultaCid =
  | { cid: string; encontrado: false }
  | { cid: string; encontrado: true; anonimizado: true; estadoCredencial: EstadoCredencial }
  | {
      cid: string;
      encontrado: true;
      anonimizado: false;
      titularId: number;
      nombre: string;
      documento: string;
      estamento: string;
      estadoCredencial: EstadoCredencial;
      vigenteDesde: string;
      vigenteHasta: string | null;
    };

export interface ConsultaRegistrada {
  id: number;
  usuario: string;
  cid: string;
  encontrado: boolean;
  motivo: string | null;
  en: string;
}

// --- Gestión de titulares por el admin (ADR-0016, punto 9) ------------------------------

export interface TitularAdmin {
  id: number;
  nombre: string;
  documento: string;
  correo: string;
  estado: EstadoTitular;
  estamentoId: number;
  estamento: string;
  estamentoConfirmado: boolean;
  dispositivoActivo: boolean;
  creadoEn: string;
}
