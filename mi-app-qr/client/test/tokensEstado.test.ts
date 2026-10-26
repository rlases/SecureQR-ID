import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Acuerdo de diseño #55 (issue #129): éxito y advertencia salen de los tokens
// --success/--warning, no de clases sueltas de la paleta, y no hay modo oscuro a medias.

const raiz = join(__dirname, '..');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

describe('tokens de estado', () => {
  it('no quedan clases emerald/amber sueltas en src/', () => {
    const conClases = archivos(join(raiz, 'src')).filter((ruta) =>
      /\b(?:bg|text|border|ring)-(?:emerald|amber)-\d/.test(readFileSync(ruta, 'utf-8'))
    );
    expect(conClases).toEqual([]);
  });

  it('declara los tokens y no declara modo oscuro', () => {
    const css = readFileSync(join(raiz, 'src/index.css'), 'utf-8');
    for (const token of ['--success:', '--success-muted:', '--warning:', '--warning-muted:']) {
      expect(css).toContain(token);
    }
    expect(readFileSync(join(raiz, 'tailwind.config.ts'), 'utf-8')).not.toMatch(/darkMode/);
  });
});
