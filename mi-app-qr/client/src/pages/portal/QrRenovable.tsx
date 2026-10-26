import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { pedirQr } from '../../lib/apiClient';
import { Button } from '../../components/ui/button';

// QR del titular que se renueva solo (ADR-0016, punto 6; issue #85).
//
// - Pide un token nuevo unos 15 segundos antes de que venza (lo indica el servidor).
// - El token vive solo en el estado de este componente: no va a localStorage, ni al
//   historial, ni a la caché de consultas (ADR-0012). La imagen es un data URL, que el
//   navegador no guarda en su caché HTTP.
// - Al volver a la pestaña, si el QR ya venció, pide otro en el acto.

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'qr'; imagen: string }
  | { tipo: 'sin_qr'; mensaje: string }
  | { tipo: 'sin_vinculo' }
  | { tipo: 'error' };

const REINTENTO_ERROR_MS = 10_000;

export default function QrRenovable({ onSinVinculo }: { onSinVinculo?: () => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vigente = useRef(true);
  // Vencimiento del QR que se muestra, para decidir al volver a la pestaña.
  const expiraEn = useRef<number | null>(null);
  // En una ref para que una función nueva del padre no reinicie el ciclo de renovación.
  const alPerderVinculo = useRef(onSinVinculo);
  alPerderVinculo.current = onSinVinculo;

  const programar = useCallback((ms: number, fn: () => void) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(fn, ms);
  }, []);

  const pedir = useCallback(async () => {
    try {
      const r = await pedirQr();
      if (!vigente.current) return;
      if (r.tipo === 'qr') {
        const imagen = await QRCode.toDataURL(r.token, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
        if (!vigente.current) return;
        expiraEn.current = new Date(r.expiraEn).getTime();
        setEstado({ tipo: 'qr', imagen });
        programar(r.renovarEnSegundos * 1000, pedir);
      } else if (r.tipo === 'sin_qr') {
        expiraEn.current = null;
        setEstado({ tipo: 'sin_qr', mensaje: r.mensaje });
      } else {
        setEstado({ tipo: 'sin_vinculo' });
        alPerderVinculo.current?.();
      }
    } catch {
      if (!vigente.current) return;
      setEstado({ tipo: 'error' });
      programar(REINTENTO_ERROR_MS, pedir);
    }
  }, [programar]);

  useEffect(() => {
    vigente.current = true;
    pedir();
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (expiraEn.current !== null && expiraEn.current <= Date.now()) pedir();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente.current = false;
      if (temporizador.current) clearTimeout(temporizador.current);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pedir]);

  if (estado.tipo === 'cargando') {
    return <p className="text-muted-foreground">Generando tu QR...</p>;
  }
  if (estado.tipo === 'sin_vinculo') return null;
  if (estado.tipo === 'sin_qr') {
    return (
      <div role="status" className="space-y-3 rounded-md border border-border bg-background p-4 text-sm text-foreground">
        <p>{estado.mensaje}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => pedir()}>
          Volver a intentar
        </Button>
      </div>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>No se pudo generar tu QR. Revisa que estés conectado a la red del CCAV; se reintenta solo.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => pedir()}>
          Reintentar ahora
        </Button>
      </div>
    );
  }
  return (
    <figure className="space-y-3">
      <img
        src={estado.imagen}
        alt="Tu código QR de ingreso"
        width={320}
        height={320}
        className="mx-auto aspect-square w-full max-w-xs rounded-md bg-white p-2"
      />
      <figcaption className="text-center text-sm text-muted-foreground">
        Muéstralo en el punto de control. Se renueva solo cada minuto; una captura de pantalla
        deja de servir en segundos.
      </figcaption>
    </figure>
  );
}
