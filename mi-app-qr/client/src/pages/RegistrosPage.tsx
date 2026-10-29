import { LoadingState } from '../components/ui/loader';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CorregirRegistroRequest, CreateRegistroRequest, Registro } from '@mi-app-qr/shared';
import { History, Pencil } from 'lucide-react';
import { correctRegistro, createRegistro, listRegistros } from '../lib/apiClient';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { CorregirRegistroModal } from '../components/CorregirRegistroModal';
import { ExportCsvModal } from '../components/ExportCsvModal';
import { ForgottenOutModal } from '../components/ForgottenOutModal';
import { parseQrTextData } from '../utils/qrParser';
import { downloadCsv } from '../lib/registrosCsv';
import { findOpenEntry } from '../lib/registroEntries';
import { HistorialCorreccionesModal } from '../components/HistorialCorreccionesModal';

const registroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
  tipo: z.enum(['entrada', 'salida']),
});

type RegistroFormValues = z.infer<typeof registroSchema>;

export default function RegistrosPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [registroACorregir, setRegistroACorregir] = useState<Registro | null>(null);
  const [registroConHistorial, setRegistroConHistorial] = useState<Registro | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [qrText, setQrText] = useState('');
  const [qrMessage, setQrMessage] = useState('');
  const [pendingEntry, setPendingEntry] = useState<{ registro: Registro; values: CreateRegistroRequest } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateRegistroRequest) => createRegistro(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      reset();
      setQrText('');
      setQrMessage('');
      setPendingEntry(null);
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
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegistroFormValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: { nombre: '', documento: '', rol: '', tipo: 'entrada' },
  });

  const tipo = watch('tipo');

  function onSubmit(values: RegistroFormValues) {
    if (!data || isError || mutation.isPending || pendingEntry) return;
    mutation.reset();
    const openEntry = values.tipo === 'entrada' ? findOpenEntry(data.registros, values.documento) : null;
    if (openEntry) {
      setPendingEntry({ registro: openEntry, values });
      return;
    }
    mutation.mutate(values);
  }

  function fillFromQr() {
    const result = parseQrTextData(qrText);
    if (result.type === 'error' || !result.parsedData) {
      setQrMessage(result.message);
      return;
    }
    const { nombre, documento, rol } = result.parsedData;
    setValue('nombre', nombre, { shouldValidate: true });
    setValue('documento', documento, { shouldValidate: true });
    setValue('rol', rol, { shouldValidate: true });
    setQrText('');
    setQrMessage('Datos cargados. Revisa el formulario antes de registrar.');
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo registro</h2>
        <div className="mb-4 space-y-2">
          <Label htmlFor="qr-text">Texto del QR</Label>
          <Input id="qr-text" value={qrText} onChange={(event) => setQrText(event.target.value)}
            aria-describedby="qr-help" />
          <p id="qr-help" className="text-sm text-muted-foreground">
            Pega o escanea el texto del carné. La lectura rellena los datos; no verifica la identidad ni la vigencia.
          </p>
          <Button type="button" variant="outline" disabled={!qrText.trim() || mutation.isPending} onClick={fillFromQr}>
            Cargar datos del QR
          </Button>
          {qrMessage && <p role="status" className="text-sm">{qrMessage}</p>}
        </div>
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
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de registro</Label>
            <select id="tipo" {...register('tipo')} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <Button type="submit" disabled={mutation.isPending || !data || isError}>
            {tipo === 'salida' ? 'Registrar salida' : 'Registrar entrada'}
          </Button>
          {(errors.nombre ?? errors.documento ?? errors.rol) && (
            <p className="w-full text-sm text-destructive">
              {(errors.nombre ?? errors.documento ?? errors.rol)?.message}
            </p>
          )}
        </form>
        {mutation.isError && <p role="alert" className="mt-2 text-sm text-destructive">No se pudo guardar el registro. Intenta de nuevo.</p>}
        {correccionMutation.isError && <p role="alert" className="mt-2 text-sm text-destructive">No se pudo guardar la corrección. Revisa los datos e intenta de nuevo.</p>}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Registros recientes</h2>
          <Button type="button" variant="outline" disabled={!data?.registros.length || isError} onClick={() => setExportOpen(true)}>
            Exportar CSV
          </Button>
        </div>
        {isError && <div role="alert">
          <p>No fue posible cargar los registros.</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>Reintentar</Button>
        </div>}
        {isLoading && <LoadingState className="text-muted-foreground" label="Cargando..." />}
        {!isLoading && data?.registros.length === 0 && (
          <p className="text-muted-foreground">Sin registros todavía.</p>
        )}
        {!isLoading && data && data.registros.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Nombre</th>
                <th className="hidden py-2 font-medium sm:table-cell">Rol</th>
                <th className="py-2 font-medium">Tipo</th>
                <th className="hidden py-2 font-medium md:table-cell">Hora</th>
                <th className="py-2 text-right font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.registros.map((registro) => (
                <tr key={registro.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{registro.nombre}</td>
                  <td className="hidden py-2 text-foreground sm:table-cell">{registro.rol}</td>
                  <td className="py-2 text-foreground">{registro.tipo}</td>
                  <td className="hidden py-2 text-muted-foreground md:table-cell">
                    {registro.timestamp}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Ver historial de ${registro.nombre}`}
                        title="Ver historial"
                        onClick={() => setRegistroConHistorial(registro)}
                      >
                        <History aria-hidden="true" />
                      </Button>
                      {user?.role === 'admin' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label="Corregir"
                          title="Corregir"
                          onClick={() => { correccionMutation.reset(); setRegistroACorregir(registro); }}
                        >
                          <Pencil aria-hidden="true" />
                          <span className="hidden sm:inline" aria-hidden="true">
                            Corregir
                          </span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {exportOpen && <ExportCsvModal
        isOpen
        onCancel={() => setExportOpen(false)}
        onExport={(role) => {
          const registros = data?.registros ?? [];
          downloadCsv(role === null ? registros : registros.filter((registro) => registro.rol === role));
          setExportOpen(false);
        }}
      />}

      <ForgottenOutModal
        isOpen={pendingEntry !== null}
        registro={pendingEntry?.registro ?? null}
        canCorrect={user?.role === 'admin'}
        isSubmitting={mutation.isPending}
        error={mutation.isError ? 'No se pudo guardar la nueva entrada. Intenta de nuevo.' : undefined}
        onCancel={() => { if (!mutation.isPending) setPendingEntry(null); }}
        onCorrect={() => {
          if (user?.role !== 'admin' || !pendingEntry || mutation.isPending) return;
          correccionMutation.reset();
          setRegistroACorregir(pendingEntry.registro);
          setPendingEntry(null);
        }}
        onForce={() => {
          if (pendingEntry && !mutation.isPending) mutation.mutate(pendingEntry.values);
        }}
      />

      <HistorialCorreccionesModal
        registro={registroConHistorial}
        onClose={() => setRegistroConHistorial(null)}
      />

      <CorregirRegistroModal
        registro={registroACorregir}
        onCancel={() => setRegistroACorregir(null)}
        onSubmit={(values) => correccionMutation.mutate(values)}
        isSubmitting={correccionMutation.isPending}
      />
    </div>
  );
}

