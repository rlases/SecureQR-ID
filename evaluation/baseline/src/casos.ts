import { carneSintetico, generador, textoCarne } from './carne.js';
import type { ResultadoLectura } from './lineaBase.js';

// Equivalentes de la línea base para el catálogo de ADR-0019, punto 3. Solo aplican F, P y V,
// más el grupo de control. R (la línea base no firma) y M (no tiene bitácora encadenada)
// van al resumen como «no aplica», nunca como rechazos.

export type Caso = 'control' | 'F' | 'P' | 'V';
export const CASOS: readonly Caso[] = ['control', 'F', 'P', 'V'];
export const NO_APLICA = ['R', 'M'] as const;

export interface Fila {
  brazo: 'tradicional';
  caso: Caso;
  variante: string;
  repeticion: number;
  decision: 'aceptado' | 'rechazado';
  motivo: string;
  ms: number;
}

export interface Opciones {
  intentos: number;
  /** Control independiente; por defecto conserva el tamaño pedido a esta función. */
  control?: number;
  semilla: number;
  /** Año de referencia de la corrida; las vigencias se fijan respecto a él. */
  anio: number;
}

type Lector = (texto: string) => ResultadoLectura;

function motivoDeRechazo(resultado: ResultadoLectura): string {
  if (resultado.type === 'success') return '';
  return /Documento inválido/.test(resultado.message) ? 'documento' : 'formato';
}

function presentar(
  leer: Lector,
  texto: string
): { decision: Fila['decision']; motivo: string; ms: number } {
  const inicio = process.hrtime.bigint();
  const resultado = leer(texto);
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  // `RegistrosPage` rellena el formulario solo si la lectura tiene éxito; una entrada
  // abierta del mismo documento solo pide confirmar, así que no es un rechazo.
  const aceptado = resultado.type === 'success' && resultado.parsedData !== null;
  return { decision: aceptado ? 'aceptado' : 'rechazado', motivo: motivoDeRechazo(resultado), ms };
}

/**
 * Ejecuta `intentos` repeticiones de cada caso contra el lector de la línea base.
 *
 * - control: el carné vigente de su titular, presentado una vez. Mide el falso rechazo.
 * - F: un carné con nombre y documento inventados (nadie con esa identidad).
 * - P: el texto de un carné ya presentado por su titular, presentado otra vez. Se cuenta
 *   solo la segunda presentación.
 * - V: el carné de alguien retirado. La mitad con vigencia futura (retirado antes de que
 *   venza) y la mitad con la vigencia ya pasada.
 */
export function ejecutarCasos(leer: Lector, opciones: Opciones): Fila[] {
  const { intentos, semilla, anio } = opciones;
  const control = opciones.control ?? intentos;
  if (!Number.isInteger(intentos) || intentos < 1) {
    throw new Error('intentos debe ser un entero positivo');
  }
  if (!Number.isInteger(control) || control < 1) throw new Error('control debe ser un entero positivo');
  const azar = generador(semilla);
  const filas: Fila[] = [];
  const fila = (caso: Caso, variante: string, repeticion: number, texto: string) =>
    filas.push({ brazo: 'tradicional', caso, variante, repeticion, ...presentar(leer, texto) });

  for (let i = 1; i <= control; i++) {
    fila('control', 'vigente', i, textoCarne(carneSintetico(azar, anio + 1)));
  }
  for (let i = 1; i <= intentos; i++) {
    fila('F', 'identidad_inventada', i, textoCarne(carneSintetico(azar, anio + 1)));
  }
  for (let i = 1; i <= intentos; i++) {
    const texto = textoCarne(carneSintetico(azar, anio + 1));
    presentar(leer, texto); // el titular, que no se cuenta
    fila('P', 'segunda_presentacion', i, texto);
  }
  for (let i = 1; i <= intentos; i++) {
    const vencida = i % 2 === 0;
    const carne = carneSintetico(azar, vencida ? anio - 1 : anio + 1);
    fila('V', vencida ? 'vigencia_vencida' : 'retirado_vigente', i, textoCarne(carne));
  }
  return filas;
}
