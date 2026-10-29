import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { carneSintetico, generador, textoCarne } from '../src/carne.js';
import { ejecutarCasos } from '../src/casos.js';
import { cargarLineaBase, type LineaBase } from '../src/lineaBase.js';
import { aCsv, COLUMNAS, resumen, wilson } from '../src/resultados.js';

const REPO = resolve(import.meta.dirname, '../../..');
let lineaBase: LineaBase;

beforeAll(async () => {
  lineaBase = await cargarLineaBase(REPO);
});

afterAll(() => lineaBase?.cerrar());

describe('lectura de baseline-o3', () => {
  it('carga el parser de la etiqueta, no el de la rama', () => {
    expect(lineaBase.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('lee como válido el texto sintético de un carné', () => {
    const texto = textoCarne(carneSintetico(generador(1), 2030));
    const r = lineaBase.parseQrTextData(texto);
    expect(r.type).toBe('success');
    expect(r.parsedData?.documento).toMatch(/^\d{8,10}$/);
  });

  it('rechaza lo que no tiene forma de carné, para que la batería no acepte todo', () => {
    expect(lineaBase.parseQrTextData('hola mundo').type).toBe('error');
    expect(lineaBase.parseQrTextData('SQRID1.abc.def').type).toBe('error');
  });
});

describe('casos del brazo tradicional', () => {
  const opciones = { intentos: 10, semilla: 42, anio: 2026 };

  it('ejecuta los cuatro casos con el número de intentos pedido', () => {
    const filas = ejecutarCasos(lineaBase.parseQrTextData, opciones);
    expect(filas).toHaveLength(40);
    for (const caso of ['control', 'F', 'P', 'V']) {
      expect(filas.filter((f) => f.caso === caso)).toHaveLength(10);
    }
    expect(filas.every((f) => f.brazo === 'tradicional')).toBe(true);
  });

  it('es repetible con la misma semilla', () => {
    const a = ejecutarCasos(lineaBase.parseQrTextData, opciones).map(({ ms: _ms, ...f }) => f);
    const b = ejecutarCasos(lineaBase.parseQrTextData, opciones).map(({ ms: _ms, ...f }) => f);
    expect(a).toEqual(b);
  });

  it('la línea base acepta todos los intentos F, P y V y no rechaza el control', () => {
    const r = resumen(ejecutarCasos(lineaBase.parseQrTextData, opciones));
    expect(r.casos.control.rechazados).toBe(0);
    expect(r.casos.F.rechazados).toBe(0);
    expect(r.casos.P.rechazados).toBe(0);
    expect(r.casos.V.rechazados).toBe(0);
    expect(r.global).toMatchObject({ intentos: 30, rechazados: 0, tasa: 0 });
    expect(r.noAplica).toEqual(['R', 'M']);
  });

  it('V mezcla carnés vigentes y vencidos', () => {
    const v = ejecutarCasos(lineaBase.parseQrTextData, opciones).filter((f) => f.caso === 'V');
    expect(new Set(v.map((f) => f.variante))).toEqual(new Set(['retirado_vigente', 'vigencia_vencida']));
  });

  it('rechaza un número de intentos inválido', () => {
    expect(() => ejecutarCasos(lineaBase.parseQrTextData, { ...opciones, intentos: 0 })).toThrow();
  });
});

describe('salida', () => {
  it('escribe el CSV con las columnas comunes', () => {
    const csv = aCsv(ejecutarCasos(lineaBase.parseQrTextData, { intentos: 1, semilla: 7, anio: 2026 }));
    const [cabecera, ...lineas] = csv.trim().split('\n');
    expect(cabecera).toBe(COLUMNAS.join(','));
    expect(lineas).toHaveLength(4);
    expect(lineas[0]).toMatch(/^tradicional,control,vigente,1,aceptado,,\d+\.\d{3}$/);
  });

  it('calcula el intervalo de Wilson', () => {
    // 200 de 200: límite inferior de alrededor del 98 % (ADR-0019, punto 6).
    expect(wilson(200, 200).inferior).toBeCloseTo(0.9812, 3);
    expect(wilson(0, 30)).toMatchObject({ inferior: 0 });
    expect(wilson(0, 30).superior).toBeCloseTo(0.1135, 3);
  });
});
