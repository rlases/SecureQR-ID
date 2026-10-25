import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import type { EstamentoDetalle, TipoExcepcion, VentanaHorario } from '@mi-app-qr/shared';
import {
  ApiError,
  createDominio,
  createEstamento,
  createExcepcion,
  deleteDominio,
  deleteEstamento,
  deleteExcepcion,
  getConfiguracionEstamentos,
  listCambiosConfiguracion,
  replaceVentanas,
  setEstamentoBase,
  updateEstamento,
} from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

// Panel de admin de estamentos, ventanas de ingreso, excepciones de calendario y reglas
// por dominio (ADR-0016, punto 5; issue #89). La regla se aplica al emitir el QR; el
// punto de control nunca conoce el estamento.

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CONFIG_KEY = ['estamentos'];
const CAMBIOS_KEY = ['estamentos', 'cambios'];
const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function mensajeDeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No se pudo guardar. Inténtalo de nuevo.';
}

// Invalida la configuración y el registro de cambios después de cada cambio exitoso.
function useCambio<T, R>(fn: (valores: T) => Promise<R>, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    // Solo los valores: React Query pasa además un contexto que la API no espera.
    mutationFn: (valores: T) => fn(valores),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      onSuccess?.();
    },
  });
}

function ErrorGuardado({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {mensajeDeError(error)}
    </p>
  );
}

function SeccionEstamentos({ estamentos }: { estamentos: EstamentoDetalle[] }) {
  const [nombre, setNombre] = useState('');
  const [requiereConfirmacion, setRequiereConfirmacion] = useState(false);
  const crear = useCambio(createEstamento, () => {
    setNombre('');
    setRequiereConfirmacion(false);
  });
  const base = useCambio(setEstamentoBase);
  const borrar = useCambio(deleteEstamento);
  const confirmacion = useCambio((e: EstamentoDetalle) =>
    updateEstamento(e.id, { requiereConfirmacion: !e.requiereConfirmacion })
  );
  const hayBase = estamentos.some((e) => e.esBase);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nombre.trim()) return;
    crear.mutate({ nombre: nombre.trim(), requiereConfirmacion });
  }

  return (
    <section aria-labelledby="estamentos-title" className="space-y-4">
      <h3 id="estamentos-title" className="text-base font-semibold text-foreground">
        Estamentos
      </h3>
      {!hayBase && (
        <p role="status" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          Elige un estamento base: mientras no haya uno, el portal del titular no admite altas.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="estamento-nombre">Nombre</Label>
          <Input
            id="estamento-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej. Estudiante"
            maxLength={60}
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={requiereConfirmacion}
            onChange={(e) => setRequiereConfirmacion(e.target.checked)}
          />
          Requiere confirmación del admin
        </label>
        <Button type="submit" disabled={crear.isPending || !nombre.trim()}>
          Crear estamento
        </Button>
      </form>
      <ErrorGuardado error={crear.error ?? base.error ?? borrar.error ?? confirmacion.error} />
      {estamentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay estamentos. Crea al menos uno y elígelo como base.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {estamentos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium text-foreground">
                  {e.nombre}
                  {e.esBase && (
                    <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      Base
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {e.requiereConfirmacion ? 'Requiere confirmación' : 'Sin confirmación'} ·{' '}
                  {e.ventanas.length === 0
                    ? 'sin ventanas: no recibe QR'
                    : `${e.ventanas.length} ventana${e.ventanas.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!e.esBase && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={e.requiereConfirmacion || base.isPending}
                    onClick={() => base.mutate(e.id)}
                  >
                    Elegir {e.nombre} como base
                  </Button>
                )}
                {!e.esBase && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={confirmacion.isPending}
                    onClick={() => confirmacion.mutate(e)}
                  >
                    {e.requiereConfirmacion
                      ? `Quitar confirmación de ${e.nombre}`
                      : `Pedir confirmación en ${e.nombre}`}
                  </Button>
                )}
                {!e.esBase && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={borrar.isPending}
                    onClick={() => borrar.mutate(e.id)}
                  >
                    <Trash2 aria-hidden="true" />
                    Borrar {e.nombre}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionVentanas({ estamentos }: { estamentos: EstamentoDetalle[] }) {
  const [estamentoId, setEstamentoId] = useState<number | null>(estamentos[0]?.id ?? null);
  const seleccionado = estamentos.find((e) => e.id === estamentoId) ?? estamentos[0] ?? null;
  const [ventanas, setVentanas] = useState<VentanaHorario[]>(seleccionado?.ventanas ?? []);
  const [nueva, setNueva] = useState<VentanaHorario>({ diaSemana: 1, inicio: '06:00', fin: '18:00' });
  const [guardado, setGuardado] = useState(false);
  const guardar = useCambio(
    (v: VentanaHorario[]) => replaceVentanas(seleccionado!.id, v),
    () => setGuardado(true)
  );

  // Al cambiar de estamento (o al recargar la configuración) se parte de lo guardado.
  useEffect(() => {
    setVentanas(seleccionado?.ventanas ?? []);
    setGuardado(false);
  }, [seleccionado?.id, seleccionado?.ventanas]);

  if (!seleccionado) return null;

  return (
    <section aria-labelledby="ventanas-title" className="space-y-4">
      <h3 id="ventanas-title" className="text-base font-semibold text-foreground">
        Ventanas de ingreso
      </h3>
      <p className="text-sm text-muted-foreground">
        Hora local de la sede. Una ventana incluye su inicio y termina justo antes de su fin;
        usa 24:00 para llegar hasta la medianoche. Un estamento sin ventanas no recibe QR.
      </p>
      <div className="space-y-2">
        <Label htmlFor="ventanas-estamento">Estamento</Label>
        <select
          id="ventanas-estamento"
          className={selectClass}
          value={seleccionado.id}
          onChange={(e) => setEstamentoId(Number(e.target.value))}
        >
          {estamentos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>
      {ventanas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ventanas: este estamento no recibe QR.</p>
      ) : (
        <ul className="space-y-1">
          {ventanas.map((v, i) => (
            <li key={`${v.diaSemana}-${v.inicio}-${i}`} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-foreground">{DIAS[v.diaSemana - 1]}</span>
              <span className="tabular-nums text-foreground">
                {v.inicio} a {v.fin}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVentanas(ventanas.filter((_, j) => j !== i))}
              >
                Quitar ventana del {DIAS[v.diaSemana - 1].toLowerCase()} de {v.inicio} a {v.fin}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="ventana-dia">Día</Label>
          <select
            id="ventana-dia"
            className={selectClass}
            value={nueva.diaSemana}
            onChange={(e) => setNueva({ ...nueva, diaSemana: Number(e.target.value) })}
          >
            {DIAS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ventana-inicio">Hora de inicio</Label>
          <Input
            id="ventana-inicio"
            value={nueva.inicio}
            onChange={(e) => setNueva({ ...nueva, inicio: e.target.value })}
            placeholder="HH:MM"
            className="w-24"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ventana-fin">Hora de fin</Label>
          <Input
            id="ventana-fin"
            value={nueva.fin}
            onChange={(e) => setNueva({ ...nueva, fin: e.target.value })}
            placeholder="HH:MM"
            className="w-24"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setVentanas([...ventanas, nueva])}>
          Agregar ventana
        </Button>
        <Button type="button" disabled={guardar.isPending} onClick={() => guardar.mutate(ventanas)}>
          Guardar ventanas de {seleccionado.nombre}
        </Button>
      </div>
      <ErrorGuardado error={guardar.error} />
      {guardado && !guardar.error && (
        <p role="status" className="text-sm text-foreground">
          Ventanas de {seleccionado.nombre} guardadas.
        </p>
      )}
    </section>
  );
}

function SeccionExcepciones({
  estamentos,
  excepciones,
}: {
  estamentos: EstamentoDetalle[];
  excepciones: Awaited<ReturnType<typeof getConfiguracionEstamentos>>['excepciones'];
}) {
  const vacia = {
    fechaDesde: '',
    fechaHasta: '',
    tipo: 'cierre' as TipoExcepcion,
    estamentoId: '',
    descripcion: '',
    inicio: '08:00',
    fin: '12:00',
  };
  const [form, setForm] = useState(vacia);
  const crear = useCambio(createExcepcion, () => setForm(vacia));
  const borrar = useCambio(deleteExcepcion);
  const nombreDe = (id: number | null) =>
    id === null ? 'Todos los estamentos' : (estamentos.find((e) => e.id === id)?.nombre ?? '—');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    crear.mutate({
      fechaDesde: form.fechaDesde,
      fechaHasta: form.fechaHasta || form.fechaDesde,
      tipo: form.tipo,
      estamentoId: form.estamentoId ? Number(form.estamentoId) : null,
      descripcion: form.descripcion,
      ventanas: form.tipo === 'reemplazo' ? [{ inicio: form.inicio, fin: form.fin }] : [],
    });
  }

  return (
    <section aria-labelledby="excepciones-title" className="space-y-4">
      <h3 id="excepciones-title" className="text-base font-semibold text-foreground">
        Excepciones de calendario
      </h3>
      <p className="text-sm text-muted-foreground">
        Festivos y jornadas especiales. Mandan sobre las ventanas semanales; si un día tiene
        un cierre, nadie de ese estamento recibe QR. El sistema no trae festivos precargados.
      </p>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="excepcion-desde">Desde</Label>
          <Input
            id="excepcion-desde"
            type="date"
            required
            value={form.fechaDesde}
            onChange={(e) => setForm({ ...form, fechaDesde: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="excepcion-hasta">Hasta (opcional)</Label>
          <Input
            id="excepcion-hasta"
            type="date"
            min={form.fechaDesde || undefined}
            value={form.fechaHasta}
            onChange={(e) => setForm({ ...form, fechaHasta: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="excepcion-tipo">Tipo</Label>
          <select
            id="excepcion-tipo"
            className={selectClass}
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoExcepcion })}
          >
            <option value="cierre">Cierre (nadie entra)</option>
            <option value="reemplazo">Horario especial</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="excepcion-estamento">Aplica a</Label>
          <select
            id="excepcion-estamento"
            className={selectClass}
            value={form.estamentoId}
            onChange={(e) => setForm({ ...form, estamentoId: e.target.value })}
          >
            <option value="">Todos los estamentos</option>
            {estamentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="excepcion-descripcion">Descripción</Label>
          <Input
            id="excepcion-descripcion"
            required
            maxLength={120}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="ej. Festivo"
          />
        </div>
        {form.tipo === 'reemplazo' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="excepcion-inicio">Abre a las</Label>
              <Input
                id="excepcion-inicio"
                value={form.inicio}
                onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                placeholder="HH:MM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="excepcion-fin">Cierra a las</Label>
              <Input
                id="excepcion-fin"
                value={form.fin}
                onChange={(e) => setForm({ ...form, fin: e.target.value })}
                placeholder="HH:MM"
              />
            </div>
          </>
        )}
        <div className="flex items-end">
          <Button type="submit" disabled={crear.isPending}>
            Agregar excepción
          </Button>
        </div>
      </form>
      <ErrorGuardado error={crear.error ?? borrar.error} />
      {excepciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay excepciones configuradas.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {excepciones.map((x) => {
            const fechas =
              x.fechaDesde === x.fechaHasta ? x.fechaDesde : `${x.fechaDesde} a ${x.fechaHasta}`;
            return (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">
                    {x.descripcion} · <span className="tabular-nums">{fechas}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {x.tipo === 'cierre'
                      ? 'Cierre'
                      : `Horario especial: ${x.ventanas.map((v) => `${v.inicio} a ${v.fin}`).join(', ')}`}{' '}
                    · {nombreDe(x.estamentoId)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={borrar.isPending}
                  onClick={() => borrar.mutate(x.id)}
                >
                  <Trash2 aria-hidden="true" />
                  Borrar excepción «{x.descripcion}» del {fechas}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SeccionDominios({
  estamentos,
  dominios,
}: {
  estamentos: EstamentoDetalle[];
  dominios: Awaited<ReturnType<typeof getConfiguracionEstamentos>>['dominios'];
}) {
  const [dominio, setDominio] = useState('');
  const [estamentoId, setEstamentoId] = useState('');
  const crear = useCambio(createDominio, () => setDominio(''));
  const borrar = useCambio(deleteDominio);
  const ayudaId = useId();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const destino = Number(estamentoId || estamentos[0]?.id);
    if (!dominio.trim() || !destino) return;
    crear.mutate({ dominio, estamentoId: destino });
  }

  return (
    <section aria-labelledby="dominios-title" className="space-y-4">
      <h3 id="dominios-title" className="text-base font-semibold text-foreground">
        Reglas por dominio del correo
      </h3>
      <p id={ayudaId} className="text-sm text-muted-foreground">
        El dominio solo preselecciona el estamento en el alta, porque el correo no se verifica.
        Si el estamento requiere confirmación, el titular queda pendiente igual.
      </p>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="dominio-valor">Dominio</Label>
          <Input
            id="dominio-valor"
            aria-describedby={ayudaId}
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            placeholder="ej. ejemplo.edu.co"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dominio-estamento">Estamento</Label>
          <select
            id="dominio-estamento"
            className={selectClass}
            value={estamentoId || estamentos[0]?.id || ''}
            onChange={(e) => setEstamentoId(e.target.value)}
          >
            {estamentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={crear.isPending || estamentos.length === 0}>
          Agregar regla
        </Button>
      </form>
      <ErrorGuardado error={crear.error ?? borrar.error} />
      {dominios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay reglas por dominio.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {dominios.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="text-foreground">
                {d.dominio} → {estamentos.find((e) => e.id === d.estamentoId)?.nombre ?? '—'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={borrar.isPending}
                onClick={() => borrar.mutate(d.id)}
              >
                <Trash2 aria-hidden="true" />
                Borrar regla de {d.dominio}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionCambios() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: CAMBIOS_KEY,
    queryFn: listCambiosConfiguracion,
  });

  return (
    <section aria-labelledby="cambios-title" className="space-y-4">
      <h3 id="cambios-title" className="text-base font-semibold text-foreground">
        Registro de cambios
      </h3>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando registro de cambios...</p>}
      {isError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          No se pudo cargar el registro de cambios.{' '}
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}
      {data && data.cambios.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay cambios registrados.</p>
      )}
      {data && data.cambios.length > 0 && (
        <div role="region" aria-labelledby="cambios-title" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 font-medium">Usuario</th>
                <th className="py-2 font-medium">Cambio</th>
                <th className="py-2 font-medium">Antes</th>
                <th className="py-2 font-medium">Después</th>
              </tr>
            </thead>
            <tbody>
              {data.cambios.map((c) => (
                <tr key={c.id} className="border-b border-border align-top">
                  <td className="py-2 tabular-nums text-foreground">
                    {new Date(c.en).toLocaleString('es-CO')}
                  </td>
                  <td className="py-2 text-foreground">{c.usuario}</td>
                  <td className="py-2 text-foreground">
                    {c.entidad} · {c.accion}
                  </td>
                  <td className="max-w-xs break-words py-2 font-mono text-xs text-muted-foreground">
                    {c.valorAnterior === null ? '—' : JSON.stringify(c.valorAnterior)}
                  </td>
                  <td className="max-w-xs break-words py-2 font-mono text-xs text-muted-foreground">
                    {c.valorNuevo === null ? '—' : JSON.stringify(c.valorNuevo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function EstamentosPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: getConfiguracionEstamentos,
  });

  // Cada cambio de configuración deja una entrada nueva en el registro.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: CAMBIOS_KEY });
  }, [dataUpdatedAt, queryClient]);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Portal del titular</p>
        <h2 className="text-2xl font-semibold text-foreground">Estamentos y horarios</h2>
      </div>
      {isLoading && <p className="text-muted-foreground">Cargando estamentos...</p>}
      {isError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          No se pudo cargar la configuración de estamentos.{' '}
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}
      {data && (
        <>
          <SeccionEstamentos estamentos={data.estamentos} />
          {data.estamentos.length > 0 && <SeccionVentanas estamentos={data.estamentos} />}
          {data.estamentos.length > 0 && (
            <SeccionExcepciones estamentos={data.estamentos} excepciones={data.excepciones} />
          )}
          {data.estamentos.length > 0 && (
            <SeccionDominios estamentos={data.estamentos} dominios={data.dominios} />
          )}
          <SeccionCambios />
        </>
      )}
    </div>
  );
}
