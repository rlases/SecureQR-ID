import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, recuperarTelefono } from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { CodigoRecuperacion, PortalLayout } from './PortalLayout';

// Vincular un teléfono nuevo con el documento y el código de recuperación (ADR-0016,
// punto 4). El teléfono anterior deja de funcionar y el código se renueva.

function mensaje(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Hubo demasiados intentos. Espera 15 minutos o acude a un administrador del CCAV.';
  }
  if (error instanceof ApiError && error.status === 401) {
    return 'El documento o el código no coinciden. Revísalos e inténtalo de nuevo.';
  }
  return 'No se pudo vincular el teléfono. Inténtalo de nuevo.';
}

export default function RecuperarPage() {
  const [documento, setDocumento] = useState('');
  const [codigo, setCodigo] = useState('');
  const recuperar = useMutation({
    mutationFn: (datos: Parameters<typeof recuperarTelefono>[0]) => recuperarTelefono(datos),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!documento.trim() || !codigo.trim()) return;
    recuperar.mutate({ documento: documento.trim(), codigo });
  }

  if (recuperar.data) {
    return (
      <PortalLayout titulo="Teléfono vinculado">
        <p className="text-foreground">
          Este teléfono quedó vinculado. El anterior ya no puede mostrar tu QR, y el código que
          usaste dejó de servir.
        </p>
        <CodigoRecuperacion codigo={recuperar.data.codigoRecuperacion} />
        <Button asChild>
          <Link to="/portal">Ya guardé mi código nuevo, continuar</Link>
        </Button>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout titulo="Vincular este teléfono">
      <p className="text-sm text-muted-foreground">
        Usa el código de recuperación que guardaste al registrarte. Si lo perdiste junto con
        tu teléfono, acude a un administrador del CCAV.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="documento">Número de documento</Label>
          <Input
            id="documento"
            inputMode="numeric"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="codigo">Código de recuperación</Label>
          <Input
            id="codigo"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        {recuperar.error && (
          <p role="alert" className="text-sm text-destructive">
            {mensaje(recuperar.error)}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={recuperar.isPending || !documento.trim() || !codigo.trim()}
        >
          Vincular este teléfono
        </Button>
      </form>
    </PortalLayout>
  );
}
