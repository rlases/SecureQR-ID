import type { Fila } from './casos.js';

// Contrato de secureqr_evaluation.ejecutor.Fila (#151): intercambio por archivos,
// sin importar código Python en Node ni cambiar el catálogo del brazo tradicional.
export const COLUMNAS_COMUNES = [
  'brazo', 'caso', 'clase', 'repeticion', 'malicioso', 'decision', 'motivo', 'motivo_correcto', 'ms',
] as const;

export function filasComunes(filas: readonly Fila[]) {
  return filas.map((f) => ({
    brazo: f.brazo,
    caso: f.caso,
    clase: f.caso,
    repeticion: f.repeticion,
    malicioso: f.caso !== 'control',
    decision: f.decision,
    motivo: f.motivo || null,
    // El parser tradicional no tiene un registro interno de motivos de seguridad.
    motivo_correcto: null,
    ms: Number(f.ms.toFixed(3)),
  }));
}

function celda(valor: unknown): string {
  const texto = valor === null ? '' : typeof valor === 'boolean' ? (valor ? 'True' : 'False') : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function csvComun(filas: readonly Fila[]): string {
  const registros = filasComunes(filas);
  return [COLUMNAS_COMUNES.join(','), ...registros.map((f) =>
    COLUMNAS_COMUNES.map((columna) => celda(f[columna])).join(','),
  )].join('\n') + '\n';
}
