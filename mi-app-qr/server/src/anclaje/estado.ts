import fs from 'node:fs';
import type { EstadoAnclaje, ResumenAnclaje } from '@mi-app-qr/shared';

// Alerta de anclaje (ADR-0017, punto 6; issue #139).
//
// `evidence-log cycle --status-file` escribe al terminar cada corrida, con reemplazo
// atómico, el estado del anclaje en JSON. mi-app-qr solo lee ese archivo: no abre el
// SQLite de evidence-log/ ni importa su código (límite de proceso por archivos, ADR-0005).
// Alerta si `stale` es verdadero (eventos sin anclar desde hace más de 2 horas) o si el
// archivo tiene más de 2 horas, lo que también delata que la tarea programada dejó de correr.

export const MAX_ANTIGUEDAD_MS = 2 * 60 * 60 * 1000;

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function fecha(segundos: number | null): string | null {
  return segundos === null ? null : new Date(segundos * 1000).toISOString();
}

export function leerEstadoAnclaje(archivo: string | undefined, ahora: Date): EstadoAnclaje {
  if (!archivo) return { estado: 'sin_configurar' };
  let datos: Record<string, unknown>;
  try {
    const crudo: unknown = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) throw new Error('formato');
    datos = crudo as Record<string, unknown>;
  } catch (error) {
    const noExiste = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      estado: 'alerta',
      detalle: noExiste
        ? 'No hay archivo de estado: el ciclo de anclaje no ha corrido nunca o escribe en otra ruta.'
        : 'El archivo de estado del anclaje no se puede leer.',
      resumen: null,
    };
  }

  const { pending_events, oldest_pending_timestamp, last_batch_id, last_anchored_at, stale, written_at } = datos;
  const opcionalNumero = (v: unknown) => v === null || esNumero(v);
  if (
    !Number.isInteger(pending_events) ||
    (pending_events as number) < 0 ||
    !opcionalNumero(oldest_pending_timestamp) ||
    !(last_batch_id === null || typeof last_batch_id === 'string') ||
    !opcionalNumero(last_anchored_at) ||
    typeof stale !== 'boolean' ||
    !esNumero(written_at)
  ) {
    return { estado: 'alerta', detalle: 'El archivo de estado del anclaje tiene un formato inesperado.', resumen: null };
  }

  const resumen: ResumenAnclaje = {
    eventosPendientes: pending_events as number,
    pendienteMasAntiguo: fecha(oldest_pending_timestamp as number | null),
    ultimoLote: last_batch_id as string | null,
    ultimoAnclaje: fecha(last_anchored_at as number | null),
    escritoEn: fecha(written_at)!,
  };
  if (ahora.getTime() - written_at * 1000 > MAX_ANTIGUEDAD_MS) {
    return {
      estado: 'alerta',
      detalle: 'El ciclo de anclaje no ha escrito su estado en más de 2 horas: la tarea programada pudo dejar de correr.',
      resumen,
    };
  }
  if (stale) {
    return {
      estado: 'alerta',
      detalle: 'Hay eventos sin anclar desde hace más de 2 horas: Fabric no responde o el anclaje está fallando.',
      resumen,
    };
  }
  return { estado: 'ok', resumen };
}
