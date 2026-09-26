import { expect, it } from 'vitest';
import { buildRegistrosCsv } from '../src/lib/registrosCsv';

it('escapa comillas y saltos de línea y neutraliza fórmulas en los campos exportados', () => {
  const csv = buildRegistrosCsv([{
    id: 1, nombre: '=SUM(1,2)', documento: '+123456', rol: 'Visitante, "externo"\nTemporal',
    tipo: 'entrada', timestamp: '2026-01-01 10:00:00', creadoPorUsuarioId: 1,
    corrigeRegistroId: null, motivo: null,
  }]);
  expect(csv).toContain('"\'=SUM(1,2)"');
  expect(csv).toContain('"\'+123456"');
  expect(csv).toContain('"Visitante, ""externo""\nTemporal"');
  expect(csv).toContain('"Nombre","Documento","Rol","Tipo","Fecha y hora"\r\n');
});
