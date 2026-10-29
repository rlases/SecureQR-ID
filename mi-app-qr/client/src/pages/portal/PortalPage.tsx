import { LoadingState } from '../../components/ui/loader';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getEstadoPortal } from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { PortalLayout } from './PortalLayout';
import QrRenovable from './QrRenovable';

// Inicio del titular en su teléfono vinculado: el estado de su credencial y, si está
// activa, el QR que se renueva solo (issue #85).

export default function PortalPage() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['portal', 'yo'],
    queryFn: getEstadoPortal,
    retry: false,
  });
  const sinVinculo = error instanceof ApiError && error.status === 401;

  if (isLoading) {
    return (
      <PortalLayout titulo="Mi credencial">
        <LoadingState className="text-muted-foreground" label="Cargando tu credencial..." />
      </PortalLayout>
    );
  }

  if (sinVinculo) {
    return (
      <PortalLayout titulo="Este teléfono no está vinculado">
        <p className="text-foreground">
          Para mostrar tu QR, registra este teléfono o vincúlalo con tu código de recuperación.
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/portal/alta">Registrarme</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/portal/recuperar">Ya me registré: vincular con mi código</Link>
          </Button>
        </div>
      </PortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PortalLayout titulo="Mi credencial">
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>No se pudo cargar tu credencial. Revisa que estés conectado a la red del CCAV.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout titulo="Mi credencial">
      <p className="text-foreground">
        Hola, <strong>{data.nombre}</strong>. Estamento: {data.estamento}.
      </p>
      {data.estado === 'suspendido' && (
        <p role="status" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          Tu credencial está suspendida. Acude a un administrador del CCAV.
        </p>
      )}
      {data.estado === 'activo' && data.estamentoPendiente && (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground">
          Un administrador debe confirmar tu estamento. Mientras tanto recibes el horario del
          estamento general.
        </p>
      )}
      {data.estado === 'activo' && <QrRenovable onSinVinculo={() => refetch()} />}
    </PortalLayout>
  );
}
