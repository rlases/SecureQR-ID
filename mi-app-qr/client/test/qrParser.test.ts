import { describe, it, expect } from 'vitest';
import { parseQrUrlData, parseQrTextData } from '../src/utils/qrParser';

describe('qrParser', () => {
  describe('parseQrUrlData', () => {
    it('extrae correctamente los datos de un HTML válido con rol inferido de cargo', () => {
      const html = '<html><body>\nResultado de Validación\nNombre: Ana Ríos\nCédula de Ciudadanía: 12345678\nCargo: Monitor de Sistemas\nCiudad: Bogotá\nVigencia: 2026-12-31\n</body></html>';
      const result = parseQrUrlData(html);
      
      expect(result.type).toBe('success');
      expect(result.parsedData).toMatchObject({
        nombre: 'Ana Ríos',
        documento: '12345678',
        rol: 'Monitor de Sistemas',
        programa: 'Monitor de Sistemas',
        cargo: 'Monitor de Sistemas',
        ciudad: 'Bogotá',
        vigencia: '2026-12-31'
      });
      // Ya no emitimos entrada / salida, pues el consumidor usará CreateRegistroRequest
      expect(result.parsedData).not.toHaveProperty('Entrada');
      expect(result.parsedData).not.toHaveProperty('Salida');
    });

    it('devuelve error si falta el documento o cargo', () => {
      const html = '<html><body>\nNombre: Ana Ríos\n</body></html>';
      const result = parseQrUrlData(html);
      expect(result.type).toBe('error');
    });
  });

  describe('parseQrTextData', () => {
    it('extrae los datos de un QR de texto plano mapeando cargo a N/A y rol al texto', () => {
      const text = 'Ana Ríos12345678Ingeniería de SistemasBogotáVálido hasta 31 de Diciembre de 2026';
      const result = parseQrTextData(text);
      
      expect(result.type).toBe('success');
      expect(result.parsedData).toMatchObject({
        nombre: 'Ana Ríos',
        documento: '12345678',
        rol: 'Ingeniería de Sistemas',
        programa: 'Ingeniería de Sistemas',
        cargo: 'N/A',
        ciudad: 'Bogotá',
        vigencia: 'Válido hasta 31 de Diciembre de 2026'
      });
    });

    it('falla con texto malformado', () => {
      const result = parseQrTextData('Texto inválido');
      expect(result.type).toBe('error');
    });
  });
});
