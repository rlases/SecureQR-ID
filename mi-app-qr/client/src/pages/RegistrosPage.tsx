import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CorregirRegistroRequest, CreateRegistroRequest, Registro } from '@mi-app-qr/shared';
import { correctRegistro, createRegistro, listRegistros } from '../lib/apiClient';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { CorregirRegistroModal } from '../components/CorregirRegistroModal';

const registroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
});

type RegistroFormValues = z.infer<typeof registroSchema>;

export default function RegistrosPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [registroACorregir, setRegistroACorregir] = useState<Registro | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateRegistroRequest) => createRegistro(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      reset();
    },
  });

  const correccionMutation = useMutation({
    mutationFn: (values: CorregirRegistroRequest) => correctRegistro(registroACorregir!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      setRegistroACorregir(null);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistroFormValues>({ resolver: zodResolver(registroSchema) });

  function onSubmit(values: RegistroFormValues) {
    mutation.mutate({ ...values, tipo: 'entrada' });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo registro</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="documento">Documento</Label>
            <Input id="documento" aria-invalid={!!errors.documento} {...register('documento')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rol">Rol</Label>
            <Input id="rol" aria-invalid={!!errors.rol} {...register('rol')} />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Registrar entrada
          </Button>
          {(errors.nombre ?? errors.documento ?? errors.rol) && (
            <p className="w-full text-sm text-destructive">
              {(errors.nombre ?? errors.documento ?? errors.rol)?.message}
            </p>
          )}
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Registros recientes</h2>
        {isLoading && <p className="text-muted-foreground">Cargando...</p>}
        {!isLoading && data?.registros.length === 0 && (
          <p className="text-muted-foreground">Sin registros todavía.</p>
        )}
        {!isLoading && data && data.registros.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Nombre</th>
                <th className="py-2 font-medium">Rol</th>
                <th className="py-2 font-medium">Tipo</th>
                <th className="py-2 font-medium">Hora</th>
                {user?.role === 'admin' && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {data.registros.map((registro) => (
                <tr key={registro.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{registro.nombre}</td>
                  <td className="py-2 text-foreground">{registro.rol}</td>
                  <td className="py-2 text-foreground">{registro.tipo}</td>
                  <td className="py-2 text-muted-foreground">{registro.timestamp}</td>
                  {user?.role === 'admin' && (
                    <td className="py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setRegistroACorregir(registro)}>
                        Corregir
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CorregirRegistroModal
        registro={registroACorregir}
        onCancel={() => setRegistroACorregir(null)}
        onSubmit={(values) => correccionMutation.mutate(values)}
        isSubmitting={correccionMutation.isPending}
      />
    </div>
  );
}
