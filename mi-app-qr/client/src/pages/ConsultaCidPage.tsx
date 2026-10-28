import { LoadingState } from '../components/ui/loader';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { ApiError, consultarCids, listConsultasCid } from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

// Consulta auditada cid → persona (ADR-0016, punto 7; solo admin). Sirve para revisar la
// bitácora y los informes, que solo traen cid. Cada consulta queda registrada con quién,
// cuándo y qué cid, y el registro se ve abajo.

const ESTADOS: Record<string, string> = {
  vigente: 'Vigente',
  reemplazada: 'Reemplazada',
  revocada: 'Revocada',
};

export default function ConsultaCidPage() {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const consulta = useMutation({
    mutationFn: (datos: { cids: string[]; motivo?: string }) =>
      consultarCids(datos.cids, datos.motivo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultas-cid'] }),
  });
  const registro = useQuery({ queryKey: ['consultas-cid'], queryFn: listConsultasCid });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cids = texto
      .split(/[\s,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cids.length === 0) return;
    consulta.mutate({ cids, motivo: motivo.trim() || undefined });
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Registro de credenciales</p>
        <h2 className="text-2xl font-semibold text-foreground">Consulta de cid</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Traduce los cid de la bitácora o de un informe a la persona a la que pertenecen. Cada
          consulta queda registrada con tu usuario, la fecha y el cid consultado.
        </p>
      </div>

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cids">cid a consultar (uno por línea, hasta 200)</Label>
          <textarea
            id="cids"
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <Input
            id="motivo"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej. revisión de la bitácora del lunes"
          />
        </div>
        {consulta.error && (
          <p role="alert" className="text-sm text-destructive">
            {consulta.error instanceof ApiError
              ? `No se pudo consultar: ${consulta.error.message}.`
              : 'No se pudo consultar. Inténtalo de nuevo.'}
          </p>
        )}
        <Button type="submit" disabled={consulta.isPending || !texto.trim()}>
          Consultar
        </Button>
      </form>

      {consulta.data && (
        <section aria-labelledby="resultados-title" className="space-y-3">
          <h3 id="resultados-title" className="text-base font-semibold text-foreground">
            Resultados ({consulta.data.resultados.length})
          </h3>
          <div role="region" aria-label="Tabla de resultados" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 font-medium">cid</th>
                  <th className="py-2 font-medium">Titular</th>
                  <th className="py-2 font-medium">Documento</th>
                  <th className="py-2 font-medium">Estamento</th>
                  <th className="py-2 font-medium">Credencial</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.resultados.map((r) => (
                  <tr key={r.cid} className="border-b border-border">
                    <td className="py-2 font-mono text-xs text-foreground">{r.cid}</td>
                    {!r.encontrado && (
                      <td colSpan={4} className="py-2 text-muted-foreground">
                        No corresponde a ninguna credencial.
                      </td>
                    )}
                    {r.encontrado && r.anonimizado && (
                      <td colSpan={4} className="py-2 text-muted-foreground">
                        Datos anonimizados al cierre del piloto.
                      </td>
                    )}
                    {r.encontrado && !r.anonimizado && (
                      <>
                        <td className="py-2 text-foreground">{r.nombre}</td>
                        <td className="py-2 text-foreground">{r.documento}</td>
                        <td className="py-2 text-foreground">{r.estamento}</td>
                        <td className="py-2 text-foreground">
                          {ESTADOS[r.estadoCredencial]}
                          {r.vigenteHasta &&
                            ` hasta ${new Date(r.vigenteHasta).toLocaleDateString('es-CO')}`}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="registro-title" className="space-y-3">
        <h3 id="registro-title" className="text-base font-semibold text-foreground">
          Registro de consultas
        </h3>
        {registro.isLoading && (
          <LoadingState className="text-sm text-muted-foreground" label="Cargando registro de consultas..." />
        )}
        {registro.isError && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            No se pudo cargar el registro de consultas.{' '}
            <Button type="button" variant="outline" size="sm" onClick={() => registro.refetch()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        )}
        {registro.data && registro.data.consultas.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay consultas registradas.</p>
        )}
        {registro.data && registro.data.consultas.length > 0 && (
          <div role="region" aria-label="Tabla del registro de consultas" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Usuario</th>
                  <th className="py-2 font-medium">cid</th>
                  <th className="py-2 font-medium">Resultado</th>
                  <th className="py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {registro.data.consultas.map((c) => (
                  <tr key={c.id} className="border-b border-border">
                    <td className="py-2 tabular-nums text-foreground">
                      {new Date(c.en).toLocaleString('es-CO')}
                    </td>
                    <td className="py-2 text-foreground">{c.usuario}</td>
                    <td className="py-2 font-mono text-xs text-foreground">{c.cid}</td>
                    <td className="py-2 text-foreground">{c.encontrado ? 'Encontrado' : 'Sin coincidencia'}</td>
                    <td className="py-2 text-muted-foreground">{c.motivo ?? '—'}</td>
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
