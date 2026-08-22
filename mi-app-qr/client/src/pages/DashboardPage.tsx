import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, RefreshCw, Users } from 'lucide-react';
import type { Registro } from '@mi-app-qr/shared';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { listRegistros, listUsers } from '../lib/apiClient';

const RECENT_ACTIVITY_LIMIT = 8;

function formatTimestamp(timestamp: string) {
  const [date, time = ''] = timestamp.split(' ');
  return `${date} · ${time.slice(0, 5)}`;
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
}

const toneClasses: Record<MetricCardProps['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  neutral: 'bg-slate-100 text-slate-700',
};

function MetricCard({ icon: Icon, label, value, tone }: MetricCardProps) {
  return (
    <article className="min-h-32 rounded-lg border border-border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
          <p className="mt-3 text-3xl font-semibold text-foreground" aria-live="polite">
            {value ?? '—'}
          </p>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-md ${toneClasses[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const registrosQuery = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    enabled: user?.role === 'admin',
  });

  const registros = useMemo(() => registrosQuery.data?.registros ?? [], [registrosQuery.data]);
  const today = new Date().toISOString().slice(0, 10);
  const todayRegistros = registros.filter((registro) => registro.timestamp.slice(0, 10) === today);
  const recentActivity = useMemo(
    () =>
      [...registros]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, RECENT_ACTIVITY_LIMIT),
    [registros]
  );

  const isLoading = registrosQuery.isLoading || (user?.role === 'admin' && usersQuery.isLoading);
  const hasError = registrosQuery.isError || (user?.role === 'admin' && usersQuery.isError);

  function retryQueries() {
    void registrosQuery.refetch();
    if (user?.role === 'admin') void usersQuery.refetch();
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Vista general</p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Dashboard</h2>
        </div>
        <p className="text-sm text-muted-foreground">{today}</p>
      </header>

      {hasError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">No fue posible actualizar el resumen.</p>
          <Button variant="outline" size="sm" onClick={retryQueries}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}

      <section aria-label="Resumen de actividad" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ClipboardCheck}
          label="Registros vigentes"
          value={isLoading ? null : registros.length}
          tone="primary"
        />
        <MetricCard
          icon={ArrowDownToLine}
          label="Entradas de hoy"
          value={isLoading ? null : todayRegistros.filter((registro) => registro.tipo === 'entrada').length}
          tone="success"
        />
        <MetricCard
          icon={ArrowUpFromLine}
          label="Salidas de hoy"
          value={isLoading ? null : todayRegistros.filter((registro) => registro.tipo === 'salida').length}
          tone="warning"
        />
        {user?.role === 'admin' && (
          <MetricCard
            icon={Users}
            label="Usuarios activos"
            value={isLoading ? null : usersQuery.data?.users.length ?? 0}
            tone="neutral"
          />
        )}
      </section>

      <section className="rounded-lg border border-border bg-background shadow-sm" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 id="recent-activity-title" className="font-semibold text-foreground">
              Actividad reciente
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Últimos {RECENT_ACTIVITY_LIMIT} movimientos</p>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{recentActivity.length}</span>
        </div>

        {registrosQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">Cargando actividad...</p>}
        {!registrosQuery.isLoading && recentActivity.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
        )}
        {!registrosQuery.isLoading && recentActivity.length > 0 && (
          <div
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            role="region"
            aria-label="Actividad reciente, tabla desplazable"
            tabIndex={0}
          >
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="bg-muted/60 text-slate-700">
                  <th className="px-5 py-3 font-medium">Persona</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-5 py-3 text-right font-medium">Fecha y hora</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((registro: Registro) => (
                  <tr key={registro.id} className="border-t border-border first:border-t-0">
                    <td className="px-5 py-3 font-medium text-foreground">{registro.nombre}</td>
                    <td className="px-5 py-3 text-muted-foreground">{registro.rol}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                          registro.tipo === 'entrada'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {registro.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {formatTimestamp(registro.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
