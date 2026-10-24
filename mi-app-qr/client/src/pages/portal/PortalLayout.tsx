import { useEffect, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

// Marco de las páginas del titular: sin la barra del personal, pensado para el teléfono.
export function PortalLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${titulo} · Portal del titular`;
  }, [titulo]);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center gap-3 border-b border-border bg-background p-4">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="text-lg font-semibold text-foreground">Portal del titular</p>
      </header>
      <main className="mx-auto w-full max-w-lg space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
        {children}
      </main>
    </div>
  );
}

/** Código de recuperación que se muestra una sola vez. */
export function CodigoRecuperacion({ codigo }: { codigo: string }) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-primary bg-secondary p-4">
      <p className="text-sm text-foreground">
        Este es tu código de recuperación. Guárdalo en un lugar seguro, fuera de este
        teléfono: <strong>no se volverá a mostrar</strong>. Lo necesitas, junto con tu
        documento, si cambias de teléfono o borras los datos del navegador.
      </p>
      <p className="font-mono text-xl tracking-wider text-foreground">{codigo}</p>
    </div>
  );
}
