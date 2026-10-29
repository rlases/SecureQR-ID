import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Brazo tradicional de ADR-0019, punto 4: la lectura de QR de `baseline-o3`, tal cual.
// La etiqueta no se modifica: se extrae una copia del parser con `git show` a una carpeta
// temporal y se carga desde ahí.

export const ETIQUETA = 'baseline-o3';
export const RUTA_PARSER = 'mi-app-qr/client/src/utils/qrParser.ts';

export interface ResultadoLectura {
  type: 'success' | 'error';
  message: string;
  parsedData: { nombre: string; documento: string; rol: string } | null;
}

export interface LineaBase {
  /** Commit al que apunta la etiqueta, para `entorno.json`. */
  commit: string;
  /** La función que usa `RegistrosPage` con el texto del carné. */
  parseQrTextData: (texto: string) => ResultadoLectura;
  cerrar: () => void;
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

export async function cargarLineaBase(repo: string): Promise<LineaBase> {
  const commit = git(repo, ['rev-parse', '--verify', `${ETIQUETA}^{commit}`]).trim();
  const fuente = git(repo, ['show', `${commit}:${RUTA_PARSER}`]);
  const carpeta = mkdtempSync(join(tmpdir(), 'secureqr-baseline-'));
  try {
    const destino = join(carpeta, 'qrParser.ts');
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(destino, fuente);
    const modulo = (await import(pathToFileURL(destino).href)) as {
      parseQrTextData?: LineaBase['parseQrTextData'];
    };
    if (typeof modulo.parseQrTextData !== 'function') {
      throw new Error(`${ETIQUETA} no exporta parseQrTextData en ${RUTA_PARSER}`);
    }
    return {
      commit,
      parseQrTextData: modulo.parseQrTextData,
      cerrar: () => rmSync(carpeta, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(carpeta, { recursive: true, force: true });
    throw error;
  }
}
