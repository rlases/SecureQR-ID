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
): number {
  const resultado = db.prepare('INSERT INTO intentos_recuperacion (documento, ip, exito, en) VALUES (?, ?, ?, ?)').run(
    documento,
    ip,
    exito ? 1 : 0,
    ahora.toISOString()
  );
  return Number(resultado.lastInsertRowid);
}

/** Reserva un intento antes de bcrypt; los pendientes cuentan como fallidos hasta
 * confirmar el éxito. IMMEDIATE serializa también reservas de otros procesos. */
export function reservarIntento(
  db: Database.Database,
  documento: string,
  ip: string,
  ahora: Date
): number | null {
  return db.transaction(() => {
    if (recuperacionBloqueada(db, documento, ip, ahora)) return null;
    return registrarIntento(db, documento, ip, false, ahora);
  }).immediate();
}

// Límite de altas por IP (issue #120). ADR-0016 lista el registro masivo con datos
// falsos desde la red del CCAV como superficie de ataque: esto lo frena desde un mismo
// equipo, no desde muchos. Cuenta toda alta que pasa la validación del formulario,
// termine activa o en revisión.

export const ALTA_VENTANA_MINUTOS = 60;
export const ALTA_MAX_POR_IP = 10;

/**
 * Reserva una plaza de alta para la IP, antes de bcrypt. Devuelve false si la IP ya
 * agotó su cupo en la ventana. IMMEDIATE serializa también reservas simultáneas.
 */
export function reservarAlta(
  db: Database.Database,
  ip: string,
  ahora: Date,
  maxPorIp: number = ALTA_MAX_POR_IP
): boolean {
  const inicio = new Date(ahora.getTime() - ALTA_VENTANA_MINUTOS * 60_000).toISOString();
  return db.transaction(() => {
    // Lo que salió de la ventana ya no cuenta: no se conserva la IP más de lo necesario.
    db.prepare('DELETE FROM intentos_alta WHERE en <= ?').run(inicio);
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM intentos_alta WHERE ip = ?')
      .get(ip) as { n: number };
    if (n >= maxPorIp) return false;
    db.prepare('INSERT INTO intentos_alta (ip, en) VALUES (?, ?)').run(ip, ahora.toISOString());
    return true;
  }).immediate();
}
