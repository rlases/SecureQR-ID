import { describe, it, expect } from 'vitest';
import { parseQrUrlData, parseQrTextData } from '../src/utils/qrParser';

describe('qrParser', () => {
  describe('parseQrUrlData', () => {
    it('extrae correctamente los datos de un HTML válido con rol inferido de cargo', () => {
      const html = '<html><body>\nResultado de Validación\nNombre: Ana Ríos\nCédula de Ciudadanía: 12345678\nCargo: Monitor de Sistemas\nCiudad: Bogotá\nVigencia: 2026-12-31\n</body></html>';
      const result = parseQrUrlData(html);
      
      expect(result.type).toBe('success');
      expect(result.parsedData).toMatchObject({
        Nombre: 'Ana Ríos',
        Documento: 12345678,
        Programa: 'Monitor de Sistemas',
        Cargo: 'Monitor de Sistemas',
        Rol: 'Monitor de Sistemas',
        Ciudad: 'Bogotá',
        Vigencia: '2026-12-31'
      });
      expect(result.parsedData?.Entrada).toBeDefined();
      expect(result.parsedData?.Salida).toBeNull();
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
        Nombre: 'Ana Ríos',
        Documento: 12345678,
        Programa: 'Ingeniería de Sistemas',
        Cargo: 'N/A',
        Rol: 'Ingeniería de Sistemas',
        Ciudad: 'Bogotá',
        Vigencia: 'Válido hasta 31 de Diciembre de 2026'
      });
    });

    it('falla con texto malformado', () => {
      const result = parseQrTextData('Texto inválido');
      expect(result.type).toBe('error');
    });
  });
});
