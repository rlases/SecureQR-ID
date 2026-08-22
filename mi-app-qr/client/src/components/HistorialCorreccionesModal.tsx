import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Registro } from '@mi-app-qr/shared';
import { Clock3, FileText, History, UserRound, X } from 'lucide-react';
import { getRegistroHistory } from '../lib/apiClient';
import { Button } from './ui/button';

interface HistorialCorreccionesModalProps {
  registro: Registro | null;
  onClose: () => void;
}

const FOCUSABLE_ELEMENTS = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function HistorialCorreccionesModal({
  registro,
  onClose,
}: HistorialCorreccionesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['registros', 'historial', registro?.id],
    queryFn: () => getRegistroHistory(registro!.id),
    enabled: registro !== null,
  });

  useEffect(() => {
    if (!registro) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS)
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [registro, onClose]);

  if (!registro) {
    return null;
  }

  const historial = data?.historial ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="historial-correcciones-title"
        aria-describedby="historial-correcciones-summary"
        className="flex max-h-[min(88vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-primary">
              <History className="size-5" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase">Trazabilidad</span>
            </div>
            <h2 id="historial-correcciones-title" className="text-lg font-semibold text-foreground">
              Historial de correcciones de {registro.nombre}
            </h2>
            <p id="historial-correcciones-summary" className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? 'Consultando versiones...'
                : isError
                  ? 'Consulta no disponible'
                  : `${historial.length} ${historial.length === 1 ? 'versión' : 'versiones'}`}
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar historial"
            title="Cerrar"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div
          className="overflow-y-auto px-5 py-5 sm:px-6"
          tabIndex={0}
          aria-label="Versiones del historial"
        >
          {isLoading && (
            <div className="flex min-h-48 items-center justify-center" aria-live="polite">
              <p className="text-sm text-muted-foreground">Cargando historial...</p>
            </div>
          )}

          {isError && (
            <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <p className="font-medium text-foreground">No se pudo cargar el historial.</p>
              <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                Reintentar
              </Button>
            </div>
          )}

          {!isLoading && !isError && (
            <ol className="border-l border-border pl-5">
              {historial.map((version, index) => {
                const isCurrent = index === historial.length - 1;
                return (
                  <li key={version.id} className="relative border-b border-border py-5 first:pt-0 last:border-0 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[29px] size-4 rounded-sm border-2 border-background bg-primary ${index === 0 ? 'top-0' : 'top-5'}`}
                    />
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground">
                        {index === 0 ? 'Registro original' : `Corrección ${index}`}
                      </h3>
                      {isCurrent && (
                        <span className="rounded-sm bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          Vigente
                        </span>
                      )}
                    </div>

                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <UserRound className="size-3.5" aria-hidden="true" />
                          Nombre
                        </dt>
                        <dd className="break-words text-sm text-foreground">{version.nombre}</dd>
                      </div>
                      <div>
                        <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <FileText className="size-3.5" aria-hidden="true" />
                          Documento
                        </dt>
                        <dd className="break-words text-sm text-foreground">{version.documento}</dd>
                      </div>
                      <div>
                        <dt className="mb-1 text-xs font-medium text-muted-foreground">Rol</dt>
                        <dd className="break-words text-sm text-foreground">{version.rol}</dd>
                      </div>
                      <div>
                        <dt className="mb-1 text-xs font-medium text-muted-foreground">Tipo</dt>
                        <dd className="text-sm capitalize text-foreground">{version.tipo}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Clock3 className="size-3.5" aria-hidden="true" />
                          Fecha y hora
                        </dt>
                        <dd className="text-sm text-foreground">
                          <time dateTime={version.timestamp.replace(' ', 'T')}>{version.timestamp}</time>
                        </dd>
                      </div>
                    </dl>

                    {version.motivo && (
                      <div className="mt-4 border-l-2 border-primary/50 pl-3">
                        <p className="text-xs font-medium text-muted-foreground">Motivo de la corrección</p>
                        <p className="mt-1 break-words text-sm text-foreground">{version.motivo}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="flex justify-end border-t border-border px-5 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </footer>
      </div>
    </div>
  );
}
