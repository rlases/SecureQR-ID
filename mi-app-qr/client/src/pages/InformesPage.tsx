import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FilterX, RefreshCw } from 'lucide-react';
import type { Registro } from '@mi-app-qr/shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { listRegistros } from '../lib/apiClient';

interface ReportFilters {
  fromDate: string;
  toDate: string;
  role: string;
  type: '' | Registro['tipo'];
}

const emptyFilters: ReportFilters = {
  fromDate: '',
  toDate: '',
  role: '',
  type: '',
};

function formatTimestamp(timestamp: string) {
  const [date, time = ''] = timestamp.split(' ');
  return `${date} ${time.slice(0, 5)}`;
}

export function filterRegistros(registros: Registro[], filters: ReportFilters) {
  return registros.filter((registro) => {
    const date = registro.timestamp.slice(0, 10);
    return (
      (!filters.fromDate || date >= filters.fromDate) &&
      (!filters.toDate || date <= filters.toDate) &&
      (!filters.role || registro.rol === filters.role) &&
      (!filters.type || registro.tipo === filters.type)
    );
  });
}

function escapeCsvValue(value: string | number) {
  const text = String(value);
  const spreadsheetSafe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

export function buildRegistrosCsv(registros: Registro[]) {
  const rows = registros.map((registro) => [
    registro.nombre,
    registro.documento,
    registro.rol,
    registro.tipo,
    registro.timestamp,
  ]);
  return [
    ['Nombre', 'Documento', 'Rol', 'Tipo', 'Fecha y hora'],
    ...rows,
  ]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');
}

function downloadCsv(registros: Registro[]) {
  const csv = buildRegistrosCsv(registros);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `informe-registros-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function InformesPage() {
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const registrosQuery = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });
  const registros = useMemo(() => registrosQuery.data?.registros ?? [], [registrosQuery.data]);
  const roles = useMemo(
    () => [...new Set(registros.map((registro) => registro.rol))].sort((left, right) => left.localeCompare(right, 'es')),
    [registros]
  );
  const filteredRegistros = useMemo(() => filterRegistros(registros, filters), [filters, registros]);
  const hasFilters = Object.values(filters).some(Boolean);

  function setFilter<Key extends keyof ReportFilters>(key: Key, value: ReportFilters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Consulta y extracción</p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Informes</h2>
        </div>
        <Button
          type="button"
          onClick={() => downloadCsv(filteredRegistros)}
          disabled={registrosQuery.isLoading || filteredRegistros.length === 0}
        >
          <Download aria-hidden="true" />
          Exportar CSV
        </Button>
      </header>

      <section className="rounded-lg border border-border bg-background p-5 shadow-sm" aria-labelledby="filters-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id="filters-title" className="font-semibold text-foreground">Filtros</h3>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
              <FilterX aria-hidden="true" />
              Limpiar
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="report-from-date">Desde</Label>
            <Input
              id="report-from-date"
              type="date"
              value={filters.fromDate}
              max={filters.toDate || undefined}
              onChange={(event) => setFilter('fromDate', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to-date">Hasta</Label>
            <Input
              id="report-to-date"
              type="date"
              value={filters.toDate}
              min={filters.fromDate || undefined}
              onChange={(event) => setFilter('toDate', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-role">Rol</Label>
            <select
              id="report-role"
              value={filters.role}
              onChange={(event) => setFilter('role', event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Todos los roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-type">Tipo</Label>
            <select
              id="report-type"
              value={filters.type}
              onChange={(event) => setFilter('type', event.target.value as ReportFilters['type'])}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
        </div>
      </section>

      {registrosQuery.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">No fue posible cargar los registros.</p>
          <Button variant="outline" size="sm" onClick={() => void registrosQuery.refetch()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}

      <section className="rounded-lg border border-border bg-background shadow-sm" aria-labelledby="results-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 id="results-title" className="font-semibold text-foreground">Resultados</h3>
          <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
            {filteredRegistros.length} {filteredRegistros.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        {registrosQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">Cargando registros...</p>}
        {!registrosQuery.isLoading && filteredRegistros.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">No hay registros que coincidan con los filtros.</p>
        )}
        {!registrosQuery.isLoading && filteredRegistros.length > 0 && (
          <div
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            role="region"
            aria-label="Resultados del informe, tabla desplazable"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="bg-muted/60 text-slate-700">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Documento</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 text-right font-medium">Fecha y hora</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistros.map((registro) => (
                  <tr key={registro.id} className="border-t border-border first:border-t-0">
                    <td className="px-5 py-3 font-medium text-foreground">{registro.nombre}</td>
                    <td className="px-5 py-3 text-muted-foreground">{registro.documento}</td>
                    <td className="px-5 py-3 text-foreground">{registro.rol}</td>
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
