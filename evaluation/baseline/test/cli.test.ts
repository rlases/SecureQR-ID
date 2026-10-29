import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('la CLI exporta el contrato común, cuenta el control aparte y no sobrescribe la evidencia', () => {
  const temporal = mkdtempSync(join(tmpdir(), 'secureqr-brazo-cli-'));
  try {
    const carpeta = join(temporal, 'salida');
    const args = ['--import', 'tsx', 'src/cli.ts', '--salida', carpeta, '--intentos', '2', '--control', '3', '--repo', resolve(import.meta.dirname, '../../..')];
    execFileSync(process.execPath, args);
    const filas = JSON.parse(readFileSync(join(carpeta, 'resultados.json'), 'utf8'));
    expect(filas).toHaveLength(9);
    expect(filas.filter((f: { malicioso: boolean }) => !f.malicioso)).toHaveLength(3);
    const entorno = JSON.parse(readFileSync(join(carpeta, 'tradicional-entorno.json'), 'utf8'));
    expect(entorno.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(entorno.evaluador_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof entorno.arbol_modificado).toBe('boolean');
    const csv = readFileSync(join(carpeta, 'resultados.csv'), 'utf8');
    expect(csv.trim().split('\n')).toHaveLength(10);
    expect(spawnSync(process.execPath, args).status).toBe(2);
    expect(readFileSync(join(carpeta, 'resultados.csv'), 'utf8')).toBe(csv);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
});
