import { Button } from './ui/button';

interface ForgottenOutModalProps {
  isOpen: boolean;
  record: any;
  onCorrect: () => void;
  onForce: () => void;
  onCancel: () => void;
}

export function ForgottenOutModal({
  isOpen,
  record,
  onCorrect,
  onForce,
  onCancel,
}: ForgottenOutModalProps) {
  if (!isOpen || !record) {
    return null;
  }

  // Fallback seguro si Entrada no es una fecha válida
  let fechaStr = 'una fecha anterior';
  if (record.Entrada) {
    const d = new Date(record.Entrada.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      fechaStr = d.toLocaleDateString();
    } else {
      // Intento sin replace por si ya está en un formato parseable
      const d2 = new Date(record.Entrada);
      if (!isNaN(d2.getTime())) {
        fechaStr = d2.toLocaleDateString();
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="¡Atención! Sesión Abierta Detectada"
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-orange-600">
          ¡Atención! Sesión Abierta Detectada
        </h2>
        <p className="mb-2 text-foreground">
          Se detectó un registro de entrada sin salida para <span className="font-semibold">{record.Nombre}</span> del día <span className="font-semibold">{fechaStr}</span>.
        </p>
        <p className="mb-6 text-muted-foreground">¿Qué deseas hacer?</p>

        <div className="space-y-4">
          <button
            onClick={onCorrect}
            className="w-full rounded-lg border border-teal-200 bg-teal-50 p-4 text-left transition duration-200 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <p className="font-bold text-teal-700">
              Corregir Salida y Registrar Nueva Entrada (Recomendado)
            </p>
            <p className="text-sm text-teal-600">
              Se pedirá autorización para editar la hora de salida del registro anterior y luego se registrará la entrada de hoy.
            </p>
          </button>

          <button
            onClick={onForce}
            className="w-full rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-left transition duration-200 hover:bg-yellow-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <p className="font-bold text-yellow-700">
              Forzar Nueva Entrada (Dejar la anterior abierta)
            </p>
            <p className="text-sm text-yellow-600">
              Se registrará una nueva entrada sin modificar el registro anterior. Requiere autorización.
            </p>
          </button>
        </div>

        <div className="flex justify-end pt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
