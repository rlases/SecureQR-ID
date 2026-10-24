import type Database from 'better-sqlite3';
import type {
  ConsultaRegistrada,
  EstadoCredencial,
  ResultadoConsultaCid,
} from '@mi-app-qr/shared';
import { isCanonicalCid } from './identificadores.js';

// Consulta auditada cid → persona (ADR-0016, punto 7; issue #86).
//
// Solo un admin traduce un cid a una persona, al revisar la bitácora y los informes. El
// punto de control y el portal público siguen sin conocer nombres (ADR-0012). Cada
// consulta queda registrada en `consultas_cid` en la misma transacción que la lectura,
// aunque el cid no exista: también es información saber que alguien lo buscó.

export const MAX_CIDS_POR_CONSULTA = 200;

export class ConsultaError extends Error {}

interface Fila {
  titular_id: number;
  estado_credencial: EstadoCredencial;
  vigente_desde: string;
  vigente_hasta: string | null;
  nombre: string;
  documento: string;
  estado_titular: string;
  estamento: string;
}

export function consultarCids(
  db: Database.Database,
  usuarioId: number,
  cids: string[],
  motivo: string | null,
  ahora: Date
): ResultadoConsultaCid[] {
  const unicos = [...new Set(cids.map((c) => c.trim()).filter(Boolean))];
  if (unicos.length === 0) throw new ConsultaError('Escribe al menos un cid.');
  if (unicos.length > MAX_CIDS_POR_CONSULTA) {
    throw new ConsultaError(`Como máximo ${MAX_CIDS_POR_CONSULTA} cid por consulta.`);
  }
  const buscar = db.prepare(
    `SELECT c.titular_id, c.estado AS estado_credencial, c.vigente_desde, c.vigente_hasta,
            t.nombre, t.documento, t.estado AS estado_titular, e.nombre AS estamento
     FROM credenciales c
     JOIN titulares t ON t.id = c.titular_id
     JOIN estamentos e ON e.id = t.estamento_id
     WHERE c.cid = ?`
  );
  const registrar = db.prepare(
    'INSERT INTO consultas_cid (usuario_id, cid, titular_id, motivo, en) VALUES (?, ?, ?, ?, ?)'
  );
  return db.transaction(() =>
    unicos.map((cid): ResultadoConsultaCid => {
      const fila = isCanonicalCid(cid) ? (buscar.get(cid) as Fila | undefined) : undefined;
      registrar.run(usuarioId, cid, fila?.titular_id ?? null, motivo, ahora.toISOString());
      if (!fila) return { cid, encontrado: false };
      // Tras el cierre del piloto (#90) la relación deja de existir: no hay a quién atribuir.
      if (fila.estado_titular === 'anonimizado') {
        return { cid, encontrado: true, anonimizado: true, estadoCredencial: fila.estado_credencial };
      }
      return {
        cid,
        encontrado: true,
        anonimizado: false,
        titularId: fila.titular_id,
        nombre: fila.nombre,
        documento: fila.documento,
        estamento: fila.estamento,
        estadoCredencial: fila.estado_credencial,
        vigenteDesde: fila.vigente_desde,
        vigenteHasta: fila.vigente_hasta,
      };
    })
  )();
}

export function listConsultas(db: Database.Database, limite = 200): ConsultaRegistrada[] {
  const rows = db
    .prepare(
      `SELECT q.id, u.username, q.cid, q.titular_id, q.motivo, q.en
       FROM consultas_cid q JOIN users u ON u.id = q.usuario_id
       ORDER BY q.id DESC LIMIT ?`
    )
    .all(limite) as {
    id: number;
    username: string;
    cid: string;
    titular_id: number | null;
    motivo: string | null;
    en: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    usuario: r.username,
    cid: r.cid,
    encontrado: r.titular_id !== null,
    motivo: r.motivo,
    en: r.en,
  }));
}
