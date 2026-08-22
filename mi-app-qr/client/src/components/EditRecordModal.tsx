import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const editRecordSchema = z.object({
  entrada: z.string().min(1, 'La fecha de entrada es obligatoria'),
  salida: z.string().optional(),
  rol: z.string().min(1, 'El rol es obligatorio'),
});

type EditRecordFormValues = z.infer<typeof editRecordSchema>;

interface EditRecordModalProps {
  isOpen: boolean;
  record: any;
  onCancel: () => void;
  onSave: (record: any, entrada: string, salida: string | null, rol: string) => void;
}

function toDatetimeLocalValue(sqliteTimestamp: string): string {
  if (!sqliteTimestamp || sqliteTimestamp === 'None' || sqliteTimestamp === 'nan') return '';
  return sqliteTimestamp.replace(' ', 'T').slice(0, 16);
}

function toSqliteTimestamp(datetimeLocalValue: string): string {
  if (!datetimeLocalValue) return '';
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}

export function EditRecordModal({
  isOpen,
  record,
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
    if (record && isOpen) {
      reset({
        entrada: toDatetimeLocalValue(record.Entrada),
        salida: record.Salida ? toDatetimeLocalValue(record.Salida) : '',
        rol: record.Rol || '',
      });
    }
  }, [record, isOpen, reset]);

  if (!isOpen || !record) {
    return null;
  }

  function onFormSubmit(values: EditRecordFormValues) {
    onSave(
      record,
      toSqliteTimestamp(values.entrada),
      values.salida ? toSqliteTimestamp(values.salida) : null,
      values.rol
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar registro de ${record.Nombre}`}
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Editar Registro
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Editando registro para: <span className="font-semibold text-foreground">{record.Nombre}</span>
        </p>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-entrada">Fecha y Hora de Entrada</Label>
            <Input id="edit-entrada" type="datetime-local" {...register('entrada')} />
            {errors.entrada && <p className="text-sm text-destructive">{errors.entrada.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-salida">Fecha y Hora de Salida</Label>
            <Input id="edit-salida" type="datetime-local" {...register('salida')} />
            {errors.salida && <p className="text-sm text-destructive">{errors.salida.message}</p>}
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
