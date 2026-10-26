import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type {
  AltaTitularResponse,
  EstadoPortal,
  InfoAltaPortal,
  RecuperarResponse,
} from '@mi-app-qr/shared';
import { estamentoSugerido, hayEstamentoBase } from '../estamentos/config.js';
import { EstamentoInexistenteError, registrarTitular } from '../titulares/repository.js';
import {
  DEVICE_COOKIE,
  findDevice,
  generateRecoveryCode,
  hashRecoveryCode,
  linkDevice,
  verifyRecoveryCode,
} from './credencialesTitular.js';
import { reservarAlta, reservarIntento } from './limiteIntentos.js';

// Portal del titular (ADR-0016, puntos 2 a 4; issue #84).
//
// La sesión del titular es de otro tipo que la del personal: no usa express-session ni
// `req.session.userId`, solo la cookie con la llave del dispositivo. Por eso ninguna ruta
// del personal la acepta, y estas rutas no aceptan la sesión del personal.

const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
// Hash de relleno para comparar en tiempo parecido cuando el documento no existe. Se
// calcula una vez, con el mismo costo que los códigos reales.
let dummyHash: Promise<string> | null = null;
function hashDeRelleno(): Promise<string> {
  dummyHash ??= hashRecoveryCode(generateRecoveryCode());
  return dummyHash;
}

export interface HuellaCertificado {
  sha256: string;
  desde: string;
}

/** Huella SHA-256 del certificado del servidor, para compararla con la del navegador. */
export function huellaDeCertificado(certificate: Buffer | undefined): HuellaCertificado | null {
  if (!certificate) return null;
  const x509 = new crypto.X509Certificate(certificate);
  return { sha256: x509.fingerprint256, desde: new Date(x509.validFrom).toISOString() };
}

const altaSchema = z.object({
  nombre: z.string().trim().min(3).max(120),
  // Documento colombiano u otro: dígitos y letras, sin espacios ni signos.
  documento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,20}$/),
  correo: z.string().trim().email().max(254),
  estamentoId: z.number().int().positive(),
  autorizaDatos: z.literal(true),
});

const recuperarSchema = z.object({
  documento: z.string().trim().min(1).max(20),
  codigo: z.string().min(1).max(40),
});

interface TitularDeDispositivo {
  titularId: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    titular?: TitularDeDispositivo;
  }
}

function db(req: Request): Database.Database {
  return req.app.locals.db as Database.Database;
}

function setDeviceCookie(res: Response, key: string, secure: boolean): void {
  res.cookie(DEVICE_COOKIE, key, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/portal',
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

/** Exige un dispositivo vinculado y activo. */
export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  const device = findDevice(db(req), req.cookies?.[DEVICE_COOKIE]);
  if (!device) {
    res.status(401).json({ error: 'este teléfono no está vinculado' });
    return;
  }
  db(req)
    .prepare('UPDATE dispositivos SET ultimo_uso_en = ? WHERE id = ?')
    .run(new Date().toISOString(), device.dispositivoId);
  req.titular = { titularId: device.titularId };
  next();
}

export function createPortalRouter(opciones: {
  secureCookies: boolean;
  huella: HuellaCertificado | null;
  // Altas por IP en la ventana de `ALTA_VENTANA_MINUTOS` (issue #120).
  altaMaxPorIp?: number;
}): Router {
  const router = Router();
  router.use(cookieParser());
  // Nada de lo que responde el portal se guarda en caché ni en el historial (ADR-0012).
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/alta', (req, res) => {
    const estamentos = db(req)
      .prepare('SELECT id, nombre, requiere_confirmacion FROM estamentos ORDER BY nombre')
      .all() as { id: number; nombre: string; requiere_confirmacion: number }[];
    const body: InfoAltaPortal = {
      abierta: hayEstamentoBase(db(req)),
      estamentos: estamentos.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        requiereConfirmacion: e.requiere_confirmacion === 1,
      })),
      huella: opciones.huella,
    };
    res.json(body);
  });

  router.get('/alta/sugerencia', (req, res) => {
    const correo = typeof req.query.correo === 'string' ? req.query.correo : '';
    res.json({ estamentoId: estamentoSugerido(db(req), correo)?.estamentoId ?? null });
  });

  router.post('/alta', async (req, res) => {
    const parsed = altaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'revisa los datos del formulario' });
    }
    if (!hayEstamentoBase(db(req))) {
      return res.status(409).json({ error: 'el registro todavía no está abierto' });
    }
    const ahora = new Date();
    if (!reservarAlta(db(req), req.ip ?? 'desconocida', ahora, opciones.altaMaxPorIp)) {
      return res
        .status(429)
        .json({ error: 'demasiados registros desde este equipo; espera una hora o acude a un administrador' });
    }
    const codigo = generateRecoveryCode();
    const codigoHash = await hashRecoveryCode(codigo);
    let resultado: { body: AltaTitularResponse; llave: string | null };
    try {
      resultado = db(req).transaction(() => {
        const { titular } = registrarTitular(db(req), parsed.data, ahora);
        if (titular.estado === 'en_revision') {
          // Documento repetido: sin credencial, sin vínculo ni código hasta que un admin
          // lo resuelva.
          return { body: { estado: 'en_revision' } as AltaTitularResponse, llave: null };
        }
        db(req)
          .prepare('UPDATE titulares SET codigo_recuperacion_hash = ? WHERE id = ?')
          .run(codigoHash, titular.id);
        return {
          body: {
            estado: 'activo',
            codigoRecuperacion: codigo,
            estamentoPendiente: !titular.estamentoConfirmado,
          } as AltaTitularResponse,
          llave: linkDevice(db(req), titular.id, ahora),
        };
      })();
    } catch (error) {
      if (error instanceof EstamentoInexistenteError) {
        return res.status(400).json({ error: 'elige un estamento de la lista' });
      }
      throw error;
    }
    if (resultado.llave) setDeviceCookie(res, resultado.llave, opciones.secureCookies);
    return res.status(resultado.llave ? 201 : 202).json(resultado.body);
  });

  router.post('/recuperar', async (req, res) => {
    const parsed = recuperarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'escribe tu documento y tu código' });
    }
    const { documento, codigo } = parsed.data;
    const ip = req.ip ?? 'desconocida';
    const ahora = new Date();
    const intentoId = reservarIntento(db(req), documento, ip, ahora);
    if (intentoId === null) {
      return res
        .status(429)
        .json({ error: 'demasiados intentos; espera 15 minutos o acude a un administrador' });
    }
    const titular = db(req)
      .prepare(
        `SELECT id, codigo_recuperacion_hash, provisional_vence_en FROM titulares
         WHERE documento = ? AND estado IN ('activo', 'suspendido')`
      )
      .get(documento) as
      | { id: number; codigo_recuperacion_hash: string | null; provisional_vence_en: string | null }
      | undefined;
    // Siempre se compara contra un hash, exista o no el documento, para no revelar cuáles
    // están registrados por el tiempo de respuesta.
    const valido = await verifyRecoveryCode(
      codigo,
      titular?.codigo_recuperacion_hash ?? (await hashDeRelleno())
    );
    // Un código provisional de entrega vencido (enmienda de 2026-10-24) recibe la misma
    // respuesta que uno incorrecto; el admin puede regenerarlo.
    const vencido =
      titular?.provisional_vence_en != null && titular.provisional_vence_en <= ahora.toISOString();
    if (!titular || !titular.codigo_recuperacion_hash || !valido || vencido) {
      return res.status(401).json({ error: 'documento o código incorrectos' });
    }
    const nuevoCodigo = generateRecoveryCode();
    const nuevoHash = await hashRecoveryCode(nuevoCodigo);
    const llave = db(req).transaction(() => {
      // Consumir solo el hash que se verificó: otro request puede haberlo renovado
      // durante bcrypt, o el titular puede haber sido anonimizado mientras tanto.
      const cambio = db(req)
        // Al canjear un código provisional, el propio que lo sustituye ya no vence.
        .prepare(`UPDATE titulares SET codigo_recuperacion_hash = ?, provisional_vence_en = NULL
                  WHERE id = ? AND codigo_recuperacion_hash = ?
                    AND estado IN ('activo', 'suspendido')
                    AND (provisional_vence_en IS NULL OR provisional_vence_en > ?)`)
        .run(nuevoHash, titular.id, titular.codigo_recuperacion_hash, ahora.toISOString());
      if (cambio.changes !== 1) return null;
      db(req).prepare('UPDATE intentos_recuperacion SET exito = 1 WHERE id = ?').run(intentoId);
      return linkDevice(db(req), titular.id, ahora);
    })();
    if (llave === null) {
      return res.status(401).json({ error: 'documento o código incorrectos' });
    }
    setDeviceCookie(res, llave, opciones.secureCookies);
    const body: RecuperarResponse = { codigoRecuperacion: nuevoCodigo };
    return res.json(body);
  });

  router.get('/yo', requireDevice, (req, res) => {
    const row = db(req)
      .prepare(
        `SELECT t.nombre, t.estado, t.estamento_confirmado, e.nombre AS estamento
         FROM titulares t JOIN estamentos e ON e.id = t.estamento_id WHERE t.id = ?`
      )
      .get(req.titular!.titularId) as {
      nombre: string;
      estado: 'activo' | 'suspendido';
      estamento_confirmado: number;
      estamento: string;
    };
    const body: EstadoPortal = {
      nombre: row.nombre,
      estado: row.estado,
      estamento: row.estamento,
      estamentoPendiente: row.estamento_confirmado === 0,
    };
    res.json(body);
  });

  return router;
}
