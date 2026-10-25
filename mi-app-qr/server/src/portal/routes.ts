import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type {
  AltaTitularResponse,
  EstadoPortal,
  QrNoDisponible,
  QrTitular,
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
import { reservarIntento } from './limiteIntentos.js';
import { puedeEmitir, type MotivoEmision } from '../titulares/gestion.js';
import { DEFAULT_TIME_ZONE } from '../estamentos/horario.js';
import { EmisorNoDisponibleError, type ClienteEmisor } from '../emision/clienteEmisor.js';
import { LimiteDispositivo } from '../emision/limiteDispositivo.js';

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
  dispositivoId: number;
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
  req.titular = { titularId: device.titularId, dispositivoId: device.dispositivoId };
  next();
}

// La página pide un token nuevo unos 15 segundos antes de que venza (ADR-0016, punto 6).
const MARGEN_RENOVACION_S = 15;

// Lo que ve el titular cuando no hay QR. No dice nada de la credencial más allá de lo
// que el propio titular necesita para saber qué hacer.
const MOTIVOS_SIN_QR: Record<Exclude<MotivoEmision, 'dentro_de_ventana'>, string> = {
  fuera_de_ventana: 'Estás fuera de tu horario de ingreso. Vuelve a intentarlo dentro de tu horario.',
  dia_cerrado: 'Hoy no hay ingreso para tu estamento.',
  sin_ventanas: 'Tu estamento todavía no tiene horario de ingreso. Acude a un administrador.',
  sin_estamento_base: 'El registro todavía no está configurado. Acude a un administrador.',
  titular_no_activo: 'Tu credencial está suspendida. Acude a un administrador del CCAV.',
  sin_credencial_vigente: 'No tienes una credencial vigente. Acude a un administrador del CCAV.',
};

export function createPortalRouter(opciones: {
  secureCookies: boolean;
  huella: HuellaCertificado | null;
  // Cliente del servicio local de emisión de issuer/ (#85). Sin él, no hay QR.
  emisor?: ClienteEmisor;
  // Zona horaria de la sede para las ventanas de ingreso.
  timeZone?: string;
  maxTokensPorMinuto?: number;
}): Router {
  const router = Router();
  const limite = new LimiteDispositivo(opciones.maxTokensPorMinuto);
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
        `SELECT id, codigo_recuperacion_hash FROM titulares
         WHERE documento = ? AND estado IN ('activo', 'suspendido')`
      )
      .get(documento) as { id: number; codigo_recuperacion_hash: string | null } | undefined;
    // Siempre se compara contra un hash, exista o no el documento, para no revelar cuáles
    // están registrados por el tiempo de respuesta.
    const valido = await verifyRecoveryCode(
      codigo,
      titular?.codigo_recuperacion_hash ?? (await hashDeRelleno())
    );
    if (!titular || !titular.codigo_recuperacion_hash || !valido) {
      return res.status(401).json({ error: 'documento o código incorrectos' });
    }
    const nuevoCodigo = generateRecoveryCode();
    const nuevoHash = await hashRecoveryCode(nuevoCodigo);
    const llave = db(req).transaction(() => {
      // Consumir solo el hash que se verificó: otro request puede haberlo renovado
      // durante bcrypt, o el titular puede haber sido anonimizado mientras tanto.
      const cambio = db(req)
        .prepare(`UPDATE titulares SET codigo_recuperacion_hash = ?
                  WHERE id = ? AND codigo_recuperacion_hash = ?
                    AND estado IN ('activo', 'suspendido')`)
        .run(nuevoHash, titular.id, titular.codigo_recuperacion_hash);
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

  // QR del titular (issue #85): con el teléfono vinculado, aplica la puerta de emisión
  // (titular activo, credencial vigente, dentro de su horario) y pide el token al
  // servicio local con el cid vigente. POST para que nada lo guarde ni lo precargue;
  // el router ya marca todo como no-store.
  router.post('/qr', requireDevice, async (req, res) => {
    const decision = puedeEmitir(
      db(req),
      req.titular!.titularId,
      new Date(),
      opciones.timeZone ?? DEFAULT_TIME_ZONE
    );
    if (!decision.permitido || !decision.cid) {
      const motivo = decision.motivo as keyof typeof MOTIVOS_SIN_QR;
      const body: QrNoDisponible = { motivo, mensaje: MOTIVOS_SIN_QR[motivo] };
      return res.status(403).json(body);
    }
    if (!opciones.emisor) {
      return res.status(503).json({ error: 'el servicio de emisión no está configurado' });
    }
    if (!limite.reservar(req.titular!.dispositivoId)) {
      return res.status(429).json({ error: 'demasiadas solicitudes; espera un momento' });
    }
    try {
      const { token, expiresIn } = await opciones.emisor.pedirToken(decision.cid);
      const body: QrTitular = {
        token,
        expiraEn: new Date(Date.now() + expiresIn * 1000).toISOString(),
        renovarEnSegundos: Math.max(expiresIn - MARGEN_RENOVACION_S, 5),
      };
      return res.json(body);
    } catch (error) {
      if (error instanceof EmisorNoDisponibleError) {
        return res.status(503).json({ error: 'no se pudo generar tu QR; inténtalo de nuevo' });
      }
      throw error;
    }
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
