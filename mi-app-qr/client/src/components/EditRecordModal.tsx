import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Registro } from '@mi-app-qr/shared';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const editRecordSchema = z.object({
  timestamp: z.string().min(1, 'La fecha y hora es obligatoria'),
  tipo: z.enum(['entrada', 'salida']),
  rol: z.string().min(1, 'El rol es obligatorio'),
});

type EditRecordFormValues = z.infer<typeof editRecordSchema>;

interface EditRecordModalProps {
  isOpen: boolean;
  registro: Registro | null;
  onCancel: () => void;
  onSave: (registro: Registro, data: { timestamp: string, tipo: 'entrada' | 'salida', rol: string }) => void;
}

function toDatetimeLocalValue(sqliteTimestamp: string): string {
  if (!sqliteTimestamp) return '';
  return sqliteTimestamp.replace(' ', 'T').slice(0, 16);
}

function toSqliteTimestamp(datetimeLocalValue: string): string {
  if (!datetimeLocalValue) return '';
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}

export function EditRecordModal({
  isOpen,
  registro,
  onCancel,
  onSave,
}: EditRecordModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditRecordFormValues>({
    resolver: zodResolver(editRecordSchema),
  });

  useEffect(() => {
    if (registro && isOpen) {
      reset({
        timestamp: toDatetimeLocalValue(registro.timestamp),
        tipo: registro.tipo,
        rol: registro.rol || '',
      });
    }
  }, [registro, isOpen, reset]);

  if (!isOpen || !registro) {
    return null;
  }

  function onFormSubmit(values: EditRecordFormValues) {
    onSave(
      registro!,
      {
        timestamp: toSqliteTimestamp(values.timestamp),
        tipo: values.tipo,
        rol: values.rol
      }
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar registro de ${registro.nombre}`}
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Editar Registro
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Editando registro para: <span className="font-semibold text-foreground">{registro.nombre}</span>
        </p>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-timestamp">Fecha y Hora</Label>
            <Input id="edit-timestamp" type="datetime-local" {...register('timestamp')} />
            {errors.timestamp && <p className="text-sm text-destructive">{errors.timestamp.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tipo">Tipo</Label>
            <select
              id="edit-tipo"
              {...register('tipo')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
            {errors.tipo && <p className="text-sm text-destructive">{errors.tipo.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-rol">Rol</Label>
            <Input id="edit-rol" {...register('rol')} />
            {errors.rol && <p className="text-sm text-destructive">{errors.rol.message}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit">
              Guardar Cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
