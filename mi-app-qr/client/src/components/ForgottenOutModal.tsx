import type { Registro } from '@mi-app-qr/shared';
import { Button } from './ui/button';
import { useModalFocus } from '../hooks/useModalFocus';

interface ForgottenOutModalProps {
  isOpen: boolean;
  registro: Registro | null;
  canCorrect: boolean;
  isSubmitting?: boolean;
  error?: string;
  onCorrect: () => void;
  onForce: () => void;
  onCancel: () => void;
}

export function ForgottenOutModal({
  isOpen, registro, canCorrect, isSubmitting = false, error, onCorrect, onForce, onCancel,
}: ForgottenOutModalProps) {
  const ref = useModalFocus(isOpen && registro !== null, () => { if (!isSubmitting) onCancel(); });
  if (!isOpen || !registro) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="forgotten-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 id="forgotten-title" className="mb-4 text-xl font-bold">Posible salida olvidada</h2>
        <p className="mb-2">
          El último movimiento de <strong>{registro.nombre}</strong> es una entrada del {registro.timestamp}.
          No aparece una salida posterior en los registros consultados.
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Continuar agrega una nueva entrada y conserva la anterior. No registra ni inventa una salida olvidada.
        </p>
        <div className="flex flex-col gap-3">
          {canCorrect && <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCorrect}>
            Revisar registro anterior
          </Button>}
          {canCorrect && <p className="text-sm text-muted-foreground">
            Si la entrada contiene un error, puedes corregirla con un motivo y conservar su historial.
            Después deberás volver a enviar el formulario para registrar la nueva entrada.
          </p>}
          <Button type="button" disabled={isSubmitting} onClick={onForce}>
            {isSubmitting ? 'Guardando...' : 'Registrar nueva entrada de todos modos'}
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
