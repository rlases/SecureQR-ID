import fs from 'node:fs';

// Cliente del servicio local de emisión de issuer/ (ADR-0016, punto 6; issues #83 y #85).
//
// mi-app-qr nunca conoce la contraseña de la clave de emisión ni importa código de
// issuer/: le envía el cid vigente por HTTP dentro del mismo equipo, autenticado con el
// secreto compartido de la instalación, y recibe el token ya firmado. El contrato está en
// issuer/README.md («Servicio local de emisión»).

export interface TokenEmitido {
  token: string;
  expiresIn: number;
}

export interface ClienteEmisor {
  pedirToken(cid: string): Promise<TokenEmitido>;
}

/** El servicio no respondió, rechazó la solicitud o devolvió algo inesperado. */
export class EmisorNoDisponibleError extends Error {}

const TIEMPO_MAXIMO_MS = 3000;
const LOOPBACK = new Set(['127.0.0.1', '[::1]']);

/**
 * El servicio solo escucha en el bucle local (issuer/ rechaza cualquier otra dirección);
 * aquí se exige lo mismo para que el secreto nunca viaje por la red.
 */
export function validarUrlEmisor(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('ISSUER_SERVICE_URL no es una URL válida.');
  }
  if (parsed.protocol !== 'http:' || !LOOPBACK.has(parsed.hostname)) {
    throw new Error('ISSUER_SERVICE_URL debe ser http://127.0.0.1:<puerto> o http://[::1]:<puerto>.');
  }
  return parsed;
}

/** Lee el secreto compartido del archivo que crea `secureqr-issuer generate-secret`. */
export function leerSecretoEmisor(ruta: string): string {
  const secreto = fs.readFileSync(ruta, 'utf8').trim();
  if (secreto.length < 32) throw new Error('El secreto compartido del emisor es demasiado corto.');
  return secreto;
}

export function crearClienteEmisor(opciones: { url: string; secreto: string }): ClienteEmisor {
  const endpoint = new URL('/v1/tokens', validarUrlEmisor(opciones.url));
  return {
    async pedirToken(cid: string): Promise<TokenEmitido> {
      let respuesta: Response;
      try {
        respuesta = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opciones.secreto}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cid }),
          signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        });
      } catch {
        throw new EmisorNoDisponibleError('El servicio de emisión no respondió.');
      }
      if (!respuesta.ok) {
        // Sin el cuerpo ni el cid: el error solo dice el estado.
        throw new EmisorNoDisponibleError(`El servicio de emisión respondió ${respuesta.status}.`);
      }
      const cuerpo = (await respuesta.json().catch(() => null)) as {
        token?: unknown;
        expires_in?: unknown;
      } | null;
      if (
        !cuerpo ||
        typeof cuerpo.token !== 'string' ||
        typeof cuerpo.expires_in !== 'number' ||
        !Number.isInteger(cuerpo.expires_in) ||
        cuerpo.expires_in <= 0
      ) {
        throw new EmisorNoDisponibleError('El servicio de emisión devolvió una respuesta inválida.');
      }
      return { token: cuerpo.token, expiresIn: cuerpo.expires_in };
    },
  };
}
