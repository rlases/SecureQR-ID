import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserRequest } from '@mi-app-qr/shared';
import { createUser, listUsers } from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const createUserSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio'),
  cargo: z.string().min(1, 'El cargo es obligatorio'),
  role: z.enum(['admin', 'operador']),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const [lastCreatedPassword, setLastCreatedPassword] = useState<{ username: string; password: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateUserRequest) => createUser(values),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setLastCreatedPassword({ username: result.user.username, password: result.generatedPassword });
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'operador' },
  });

  function onSubmit(values: CreateUserFormValues) {
    mutation.mutate(values);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo usuario</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" {...register('username')} />
            {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" {...register('cargo')} placeholder="ej. vigilancia" />
            {errors.cargo && <p className="text-sm text-destructive">{errors.cargo.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Permiso</Label>
            <select
              id="role"
              {...register('role')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Crear usuario
          </Button>
        </form>

        {lastCreatedPassword && (
          <div className="mt-4 rounded-md border border-primary bg-secondary p-4">
            <p className="text-sm text-foreground">
              Usuario <strong>{lastCreatedPassword.username}</strong> creado. Contraseña generada
              (cópiala ahora — no se volverá a mostrar):
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">{lastCreatedPassword.password}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Usuarios</h2>
        {isLoading && <p className="text-muted-foreground">Cargando...</p>}
        {!isLoading && data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Usuario</th>
                <th className="py-2 font-medium">Cargo</th>
                <th className="py-2 font-medium">Permiso</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{user.username}</td>
                  <td className="py-2 text-foreground">{user.cargo ?? '—'}</td>
                  <td className="py-2 text-muted-foreground">{user.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
