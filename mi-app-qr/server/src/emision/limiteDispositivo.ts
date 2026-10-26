// Límite de tokens por dispositivo (ADR-0016, punto 6). La página del titular pide uno
// cada ~45 segundos; el límite deja margen para recargar la página, pero impide que una
// llave robada o un script pidan tokens sin freno. Vive en memoria: no deja un registro
// persistente de cuándo usa cada teléfono su QR, y un reinicio solo lo vacía.

export const VENTANA_MS = 60_000;
export const MAX_TOKENS_POR_MINUTO = 6;

export class LimiteDispositivo {
  private readonly usos = new Map<number, number[]>();

  constructor(private readonly maxPorVentana: number = MAX_TOKENS_POR_MINUTO) {}

  /** Reserva un token para el dispositivo; false si ya agotó su cupo en la ventana. */
  reservar(dispositivoId: number, ahora: number = Date.now()): boolean {
    const recientes = (this.usos.get(dispositivoId) ?? []).filter((t) => t > ahora - VENTANA_MS);
    if (recientes.length >= this.maxPorVentana) {
      this.usos.set(dispositivoId, recientes);
      return false;
    }
    recientes.push(ahora);
    this.usos.set(dispositivoId, recientes);
    // Limpieza ocasional para que el mapa no crezca con dispositivos inactivos.
    if (this.usos.size > 10_000) {
      for (const [id, tiempos] of this.usos) {
        if (tiempos.every((t) => t <= ahora - VENTANA_MS)) this.usos.delete(id);
      }
    }
    return true;
  }
}
