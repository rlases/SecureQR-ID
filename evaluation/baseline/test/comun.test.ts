import { describe, expect, it } from 'vitest';
import type { Fila } from '../src/casos.js';
import { COLUMNAS_COMUNES, csvComun, filasComunes } from '../src/comun.js';

const base: Fila = { brazo: 'tradicional', caso: 'control', variante: 'vigente', repeticion: 1, decision: 'aceptado', motivo: '', ms: 1.23456 };

describe('contrato de resultados de #151', () => {
  it('distingue control y ataques sin perder la decisión ni inventar motivos internos', () => {
    const [control, ataque] = filasComunes([base, { ...base, caso: 'V', variante: 'retirado_vigente', decision: 'rechazado', motivo: 'formato' }]);
    expect(Object.keys(control)).toEqual([...COLUMNAS_COMUNES]);
    expect(control).toMatchObject({ caso: 'control', clase: 'control', malicioso: false, motivo: null, motivo_correcto: null, ms: 1.235 });
    expect(ataque).toMatchObject({ caso: 'V', clase: 'V', malicioso: true, decision: 'rechazado', motivo: 'formato', motivo_correcto: null });
  });

  it('exporta las nueve columnas en el orden del CSV Python y escapa motivos', () => {
    const csv = csvComun([{ ...base, caso: 'F', motivo: 'dato,"sintético"\nnuevo' }]);
    expect(csv.split('\n')[0]).toBe('brazo,caso,clase,repeticion,malicioso,decision,motivo,motivo_correcto,ms');
    expect(csv).toContain('tradicional,F,F,1,True,aceptado,"dato,""sintético""\nnuevo",,1.235');
    expect(csvComun([base])).toContain('tradicional,control,control,1,False,aceptado,,,1.235');
  });
});
