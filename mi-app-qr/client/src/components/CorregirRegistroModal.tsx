import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CorregirRegistroRequest, Registro } from '@mi-app-qr/shared';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const corregirRegistroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
  tipo: z.enum(['entrada', 'salida']),
  timestamp: z.string().min(1, 'La fecha es obligatoria'),
  motivo: z.string().min(1, 'El motivo es obligatorio'),
});

type CorregirRegistroFormValues = z.infer<typeof corregirRegistroSchema>;

interface CorregirRegistroModalProps {
  registro: Registro | null;
  onCancel: () => void;
  onSubmit: (data: CorregirRegistroRequest) => void;
  isSubmitting: boolean;
}

// Manipulación de texto pura a propósito: evita cualquier ambigüedad de zona
// horaria al convertir entre el formato de timestamp de SQLite
// ("2026-01-01 10:00:00") y el valor de un <input type="datetime-local">
// ("2026-01-01T10:00"). No usar Date aquí.
function toDatetimeLocalValue(sqliteTimestamp: string): string {
  return sqliteTimestamp.replace(' ', 'T').slice(0, 16);
}

function toSqliteTimestamp(datetimeLocalValue: string): string {
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}

export function CorregirRegistroModal({
  registro,
  onCancel,
  onSubmit,
  isSubmitting,
}: CorregirRegistroModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CorregirRegistroFormValues>({
    resolver: zodResolver(corregirRegistroSchema),
  });

  useEffect(() => {
    if (registro) {
      reset({
        nombre: registro.nombre,
        documento: registro.documento,
        rol: registro.rol,
        tipo: registro.tipo,
        timestamp: toDatetimeLocalValue(registro.timestamp),
        motivo: '',
      });
    }
  }, [registro, reset]);

  if (!registro) {
    return null;
  }

  function onFormSubmit(values: CorregirRegistroFormValues) {
    onSubmit({ ...values, timestamp: toSqliteTimestamp(values.timestamp) });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Corregir registro de ${registro.nombre}`}
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Corregir registro de {registro.nombre}
        </h2>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="corregir-nombre">Nombre</Label>
            <Input id="corregir-nombre" {...register('nombre')} />
            {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-documento">Documento</Label>
            <Input id="corregir-documento" {...register('documento')} />
            {errors.documento && <p className="text-sm text-destructive">{errors.documento.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-rol">Rol</Label>
            <Input id="corregir-rol" {...register('rol')} />
            {errors.rol && <p className="text-sm text-destructive">{errors.rol.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-tipo">Tipo</Label>
            <select
              id="corregir-tipo"
              {...register('tipo')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-timestamp">Fecha y hora</Label>
            <Input id="corregir-timestamp" type="datetime-local" {...register('timestamp')} />
            {errors.timestamp && <p className="text-sm text-destructive">{errors.timestamp.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-motivo">Motivo de la corrección</Label>
            <textarea
              id="corregir-motivo"
              {...register('motivo')}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {errors.motivo && <p className="text-sm text-destructive">{errors.motivo.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Guardar corrección
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
