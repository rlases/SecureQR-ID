import { CASOS, NO_APLICA, type Caso, type Fila } from './casos.js';

// Salida del brazo tradicional en el formato de ADR-0019, punto 5. Las columnas son las
// mismas que escribe `evaluation/` para el brazo SecureQR-ID (#151); `variante` precisa el
// caso sin cambiar su identificador.

export const COLUMNAS = ['brazo', 'caso', 'variante', 'repeticion', 'decision', 'motivo', 'ms'] as const;

export function aCsv(filas: readonly Fila[]): string {
  const lineas = filas.map((f) =>
    [f.brazo, f.caso, f.variante, f.repeticion, f.decision, f.motivo, f.ms.toFixed(3)].join(',')
  );
  return [COLUMNAS.join(','), ...lineas].join('\n') + '\n';
}

/** Intervalo de Wilson al 95 % para `exitos` de `n`. */
export function wilson(exitos: number, n: number): { inferior: number; superior: number } {
  if (n === 0) return { inferior: 0, superior: 1 };
  const z = 1.959963984540054;
  const p = exitos / n;
  const z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margen = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  // En los extremos el límite es exacto; la resta en coma flotante dejaría un residuo.
  return {
    inferior: exitos === 0 ? 0 : Math.max(0, centro - margen),
    superior: exitos === n ? 1 : Math.min(1, centro + margen),
  };
}

export interface ResumenCaso {
  intentos: number;
  rechazados: number;
  /** Para los casos maliciosos, la tasa de detección; para control, la de falso rechazo. */
  tasa: number;
  wilson95: { inferior: number; superior: number };
}

export interface Resumen {
  brazo: 'tradicional';
  casos: Record<Caso, ResumenCaso>;
  /** Detección sobre todos los intentos maliciosos (F, P y V). */
  global: ResumenCaso;
  noAplica: readonly string[];
}

function resumir(filas: readonly Fila[]): ResumenCaso {
  const rechazados = filas.filter((f) => f.decision === 'rechazado').length;
  return {
    intentos: filas.length,
    rechazados,
    tasa: filas.length === 0 ? 0 : rechazados / filas.length,
    wilson95: wilson(rechazados, filas.length),
  };
}

export function resumen(filas: readonly Fila[]): Resumen {
  const casos = Object.fromEntries(
    CASOS.map((c) => [c, resumir(filas.filter((f) => f.caso === c))])
  ) as Record<Caso, ResumenCaso>;
  return {
    brazo: 'tradicional',
    casos,
    global: resumir(filas.filter((f) => f.caso !== 'control')),
    noAplica: NO_APLICA,
  };
}
