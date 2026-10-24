import type Database from 'better-sqlite3';

// Límite de intentos fallidos del código de recuperación (ADR-0016, punto 4): por
// documento, para que nadie pruebe códigos contra un titular, y por IP, para que nadie
// recorra documentos desde un mismo equipo. Se guarda en la base para que reiniciar el
// servidor no reinicie el contador.

export const VENTANA_MINUTOS = 15;
export const MAX_FALLOS_POR_DOCUMENTO = 5;
export const MAX_FALLOS_POR_IP = 20;

function desde(ahora: Date): string {
  return new Date(ahora.getTime() - VENTANA_MINUTOS * 60_000).toISOString();
}

export function recuperacionBloqueada(
  db: Database.Database,
  documento: string,
  ip: string,
  ahora: Date
): boolean {
  const inicio = desde(ahora);
  const porDocumento = db
    .prepare(
      'SELECT COUNT(*) AS n FROM intentos_recuperacion WHERE documento = ? AND exito = 0 AND en > ?'
    )
    .get(documento, inicio) as { n: number };
  if (porDocumento.n >= MAX_FALLOS_POR_DOCUMENTO) return true;
  const porIp = db
    .prepare('SELECT COUNT(*) AS n FROM intentos_recuperacion WHERE ip = ? AND exito = 0 AND en > ?')
    .get(ip, inicio) as { n: number };
  return porIp.n >= MAX_FALLOS_POR_IP;
}

export function registrarIntento(
  db: Database.Database,
  documento: string,
  ip: string,
  exito: boolean,
  ahora: Date
): void {
  db.prepare('INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES (?, ?, ?, ?)').run(
    documento,
    ip,
    exito ? 1 : 0,
    ahora.toISOString()
  );
}
