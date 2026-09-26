import { describe, expect, it } from 'vitest';
import type { Registro } from '@mi-app-qr/shared';
import { findOpenEntry } from '../src/lib/registroEntries';

const entrada: Registro = {
  id: 1, nombre: 'Ana', documento: '00123456', rol: 'Visitante', tipo: 'entrada',
  timestamp: '2026-01-01 10:00:00', creadoPorUsuarioId: 1, corrigeRegistroId: null, motivo: null,
};

describe('findOpenEntry', () => {
  it('no confunde documentos ni pierde ceros iniciales', () => {
    expect(findOpenEntry([entrada], '123456')).toBeNull();
    expect(findOpenEntry([], entrada.documento)).toBeNull();
    expect(findOpenEntry([entrada], entrada.documento)).toBe(entrada);
  });
  it('usa la fecha del evento aun con lista desordenada o correcciones de id mayor', () => {
    const correction = { ...entrada, id: 99, corrigeRegistroId: 1 };
    const salida = { ...entrada, id: 2, tipo: 'salida' as const, timestamp: '2026-01-01 11:00:00' };
    expect(findOpenEntry([correction, salida], entrada.documento)).toBeNull();
    const nueva = { ...entrada, id: 3, timestamp: '2026-01-02 10:00:00' };
    expect(findOpenEntry([correction, nueva, salida], entrada.documento)).toBe(nueva);
  });
  it('resuelve empates de fecha por id de forma determinista', () => {
    const salida = { ...entrada, id: 2, tipo: 'salida' as const };
    expect(findOpenEntry([salida, entrada], entrada.documento)).toBeNull();
  });
});
