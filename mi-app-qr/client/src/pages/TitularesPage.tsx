import { LoadingState } from '../components/ui/loader';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import type {
  CodigoProvisionalResponse,
  EstadoTitular,
  MotivoReemplazo,
  TitularAdmin,
} from '@mi-app-qr/shared';
import {
  ApiError,
  URL_REVOCADOS,
  accionTitular,
  aprobarAlta,
  confirmarEstamentoTitular,
  rechazarAlta,
  reemplazarRegistro,
  regenerarCodigoProvisional,
  exportarRevocadosAhora,
  getConservacion,
  listTitulares,
  setConservacion,
  type AccionTitular,
} from '../lib/apiClient';
import { useModalFocus } from '../hooks/useModalFocus';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

// Gestión de titulares por el admin (ADR-0016, puntos 5 y 9; issue #87): revocar una
// credencial, cortar el vínculo de un teléfono, reactivar, confirmar el estamento,
// resolver las altas en revisión (issue #109) y exportar los cid revocados para que el
// custodio los firme.

const ESTADOS: Record<EstadoTitular, string> = {
  activo: 'Activo',
  en_revision: 'En revisión',
  suspendido: 'Suspendido',
  reemplazado: 'Reemplazado',
  anonimizado: 'Anonimizado',
};

const ACCIONES: Record<AccionTitular, { titulo: string; ayuda: string; boton: string }> = {
  revocar: {
    titulo: 'Revocar credencial',
    ayuda:
      'Desde ahora no se emiten QR para esta persona y su cid entra en la próxima lista de revocados. Queda suspendida hasta que un admin la reactive.',
    boton: 'Revocar',
  },
  desvincular: {
    titulo: 'Desvincular teléfono',
    ayuda:
      'El teléfono vinculado deja de mostrar el QR (por ejemplo, si se perdió). La persona puede vincular otro con su código de recuperación.',
    boton: 'Desvincular',
  },
  reactivar: {
    titulo: 'Reactivar titular',
    ayuda: 'Se crea una credencial nueva; la revocada sigue en la lista de revocados.',
    boton: 'Reactivar',
  },
};

const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function DialogoAccion({
  titular,
  accion,
  onCancel,
}: {
  titular: TitularAdmin;
  accion: AccionTitular;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const mutation = useMutation({
    mutationFn: (m: string) => accionTitular(titular.id, accion, m),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['titulares'] });
      onCancel();
    },
  });
  const ref = useModalFocus(true, () => {
    if (!mutation.isPending) onCancel();
  });
  const texto = ACCIONES[accion];

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (motivo.trim().length < 3) return;
    mutation.mutate(motivo.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="accion-titular-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl"
      >
        <h2 id="accion-titular-title" className="mb-2 text-lg font-semibold text-foreground">
          {texto.titulo}: {titular.nombre}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Documento {titular.documento}. {texto.ayuda}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accion-motivo">Motivo</Label>
            <Input
              id="accion-motivo"
              maxLength={200}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Queda en el registro de cambios; sin datos personales"
            />
          </div>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error instanceof ApiError
                ? `No se pudo completar: ${mutation.error.message}.`
                : 'No se pudo completar. Inténtalo de nuevo.'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={accion === 'reactivar' ? 'default' : 'destructive'}
              disabled={mutation.isPending || motivo.trim().length < 3}
            >
              {texto.boton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

type Resolucion = 'rechazar' | 'reemplazar' | 'aprobar' | 'regenerar';

const RESOLUCIONES: Record<Resolucion, { titulo: string; ayuda: string; boton: string }> = {
  rechazar: {
    titulo: 'Rechazar alta',
    ayuda:
      'Por ejemplo, porque alguien usó el documento de otra persona. Los datos de esta alta se anonimizan de inmediato; el registro vigente no cambia.',
    boton: 'Rechazar alta',
  },
  reemplazar: {
    titulo: 'Reemplazar registro',
    ayuda:
      'El registro vigente con este documento queda reemplazado y su teléfono desvinculado. Esta alta queda activa y recibe un código provisional que entregas en persona.',
    boton: 'Reemplazar',
  },
  aprobar: {
    titulo: 'Aprobar alta',
    ayuda:
      'Ya no hay un registro vigente con este documento. Esta alta queda activa y recibe un código provisional que entregas en persona.',
    boton: 'Aprobar',
  },
  regenerar: {
    titulo: 'Nuevo código provisional',
    ayuda: 'El código provisional anterior deja de servir en este momento.',
    boton: 'Generar código',
  },
};

const MOTIVOS_REEMPLAZO: Record<MotivoReemplazo, string> = {
  misma_persona: 'Es la misma persona (cambió de teléfono)',
  registro_anterior_indebido: 'El registro anterior era indebido (documento ajeno)',
};

function DialogoResolucion({
  titular,
  resolucion,
  onCancel,
}: {
  titular: TitularAdmin;
  resolucion: Resolucion;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState<MotivoReemplazo | ''>('');
  const [nota, setNota] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El código vive solo en este estado: no pasa por la caché de consultas ni de mutaciones,
  // y desaparece al cerrar el diálogo.
  const [codigo, setCodigo] = useState<CodigoProvisionalResponse | null>(null);
  const ref = useModalFocus(true, () => {
    if (!pendiente) onCancel();
  });
  const texto = RESOLUCIONES[resolucion];
  const listo = resolucion !== 'reemplazar' || motivo !== '';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!listo) return;
    setPendiente(true);
    setError(null);
    try {
      const notaLimpia = nota.trim();
      if (resolucion === 'rechazar') {
        await rechazarAlta(titular.id, notaLimpia);
        queryClient.invalidateQueries({ queryKey: ['titulares'] });
        onCancel();
        return;
      }
      const respuesta =
        resolucion === 'reemplazar'
          ? await reemplazarRegistro(titular.id, motivo as MotivoReemplazo, notaLimpia)
          : resolucion === 'aprobar'
            ? await aprobarAlta(titular.id, notaLimpia)
            : await regenerarCodigoProvisional(titular.id);
      setCodigo(respuesta);
      queryClient.invalidateQueries({ queryKey: ['titulares'] });
    } catch (e) {
      setError(
        e instanceof ApiError ? `No se pudo completar: ${e.message}.` : 'No se pudo completar. Inténtalo de nuevo.'
      );
    } finally {
      setPendiente(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolucion-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl"
      >
        <h2 id="resolucion-title" className="mb-2 text-lg font-semibold text-foreground">
          {texto.titulo}: {titular.nombre}
        </h2>
        {codigo ? (
          <div className="space-y-4">
            <div role="status" className="space-y-2">
              <p className="text-sm text-foreground">
                Código provisional para {titular.nombre}. Se muestra <strong>una sola vez</strong>.
              </p>
              <p className="break-all font-mono text-xl tracking-wider text-foreground">
                {codigo.codigoProvisional}
              </p>
              <p className="text-sm text-muted-foreground">
                Entrégalo en persona, después de verificar su identidad. Lo usa en «Recuperar mi
                QR» con su documento, idealmente en ese mismo momento. Vence el{' '}
                {new Date(codigo.venceEn).toLocaleString('es-CO')}.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={onCancel}>
                Ya lo entregué, cerrar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Documento {titular.documento}. {texto.ayuda}
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              {resolucion === 'reemplazar' && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">Motivo</legend>
                  {(Object.keys(MOTIVOS_REEMPLAZO) as MotivoReemplazo[]).map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="motivo-reemplazo"
                        value={m}
                        checked={motivo === m}
                        onChange={() => setMotivo(m)}
                      />
                      {MOTIVOS_REEMPLAZO[m]}
                    </label>
                  ))}
                  {motivo === 'registro_anterior_indebido' && (
                    <p className="text-xs text-muted-foreground">
                      La credencial anterior se revoca y entra en la próxima lista de revocados.
                    </p>
                  )}
                  {titular.registroVigenteEstado === 'suspendido' && (
                    <p
                      role="note"
                      aria-label="Registro vigente suspendido"
                      className="rounded-md border border-destructive p-3 text-sm text-foreground"
                    >
                      <strong>Atención:</strong> el registro vigente con este documento está
                      suspendido. Si eliges «misma persona», el alta nueva queda activa con
                      credencial: en la práctica <strong>se levanta la suspensión</strong>.
                    </p>
                  )}
                </fieldset>
              )}
              {resolucion !== 'regenerar' && (
                <div className="space-y-2">
                  <Label htmlFor="resolucion-nota">Nota (opcional)</Label>
                  <Input
                    id="resolucion-nota"
                    maxLength={200}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Queda en el registro de cambios; sin datos personales"
                  />
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" disabled={pendiente} onClick={onCancel}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant={resolucion === 'rechazar' ? 'destructive' : 'default'}
                  disabled={pendiente || !listo}
                >
                  {texto.boton}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ExportarRevocados() {
  const exportar = useMutation({ mutationFn: () => exportarRevocadosAhora() });
  return (
    <section aria-labelledby="revocados-title" className="space-y-3">
      <h3 id="revocados-title" className="text-base font-semibold text-foreground">
        Lista de revocados
      </h3>
      <p className="max-w-2xl text-sm text-muted-foreground">
        El servidor exporta cada día los cid revocados, sin firmar, para que el custodio los
        firme en su refirmado diario. En un caso urgente, exporta ahora y avísale para que
        firme en el momento.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={exportar.isPending} onClick={() => exportar.mutate()}>
          Exportar ahora
        </Button>
        <Button asChild variant="outline">
          <a href={URL_REVOCADOS} download>
            <Download aria-hidden="true" />
            Descargar archivo de revocados
          </a>
        </Button>
      </div>
      {exportar.data && (
        <p role="status" className="text-sm text-foreground">
          Exportados {exportar.data.cantidad} cid en {exportar.data.ruta}.
        </p>
      )}
      {exportar.error && (
        <p role="alert" className="text-sm text-destructive">
          {exportar.error instanceof ApiError
            ? `No se pudo exportar: ${exportar.error.message}.`
            : 'No se pudo exportar. Inténtalo de nuevo.'}
        </p>
      )}
    </section>
  );
}

function Conservacion() {
  const queryClient = useQueryClient();
  const actual = useQuery({ queryKey: ['conservacion'], queryFn: getConservacion });
  const [dias, setDias] = useState('');
  const guardar = useMutation({
    mutationFn: (valor: number | null) => setConservacion(valor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conservacion'] });
      setDias('');
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    guardar.mutate(dias.trim() === '' ? null : Number(dias));
  }

  return (
    <section aria-labelledby="conservacion-title" className="space-y-3">
      <h3 id="conservacion-title" className="text-base font-semibold text-foreground">
        Conservación de datos
      </h3>
      <p className="max-w-2xl text-sm text-muted-foreground">
        En el piloto, los datos personales se anonimizan al cierre con el comando
        <code className="mx-1">npm run anonimizar -- --cierre</code>. Para un uso posterior,
        fija un plazo: cada día se anonimizan los registros y las consultas más antiguos.
        Informa el plazo en la autorización de tratamiento de datos.
      </p>
      {actual.data && (
        <p className="text-sm text-foreground">
          Plazo actual:{' '}
          {actual.data.plazoDias === null ? 'sin plazo (hasta el cierre)' : `${actual.data.plazoDias} días`}
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="plazo-dias">Plazo en días (vacío = hasta el cierre)</Label>
          <Input
            id="plazo-dias"
            inputMode="numeric"
            value={dias}
            onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
            className="w-40"
          />
        </div>
        <Button type="submit" variant="outline" disabled={guardar.isPending}>
          Guardar plazo
        </Button>
      </form>
      {guardar.error && (
        <p role="alert" className="text-sm text-destructive">
          {guardar.error instanceof ApiError
            ? `No se pudo guardar: ${guardar.error.message}.`
            : 'No se pudo guardar. Inténtalo de nuevo.'}
        </p>
      )}
    </section>
  );
}

export default function TitularesPage() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoTitular | ''>('');
  const [accion, setAccion] = useState<{ titular: TitularAdmin; accion: AccionTitular } | null>(null);
  const [resolucion, setResolucion] = useState<{ titular: TitularAdmin; resolucion: Resolucion } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['titulares', estado],
    queryFn: () => listTitulares(estado || undefined),
  });
  const confirmar = useMutation({
    mutationFn: (t: TitularAdmin) => confirmarEstamentoTitular(t.id, t.estamentoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['titulares'] }),
  });

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Registro de credenciales</p>
        <h2 className="text-2xl font-semibold text-foreground">Titulares</h2>
      </div>

      <section aria-labelledby="titulares-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 id="titulares-title" className="text-base font-semibold text-foreground">
            Titulares registrados {data && `(${data.titulares.length})`}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="filtro-estado">Estado</Label>
            <select
              id="filtro-estado"
              className={selectClass}
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoTitular | '')}
            >
              <option value="">Todos</option>
              <option value="activo">Activos</option>
              <option value="en_revision">En revisión</option>
              <option value="suspendido">Suspendidos</option>
              <option value="reemplazado">Reemplazados</option>
            </select>
          </div>
        </div>
        {isLoading && <LoadingState className="text-sm text-muted-foreground" label="Cargando titulares..." />}
        {isError && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            No se pudo cargar la lista de titulares.{' '}
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        )}
        {confirmar.error && (
          <p role="alert" className="text-sm text-destructive">
            No se pudo confirmar el estamento. Inténtalo de nuevo.
          </p>
        )}
        {data && data.titulares.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay titulares con ese estado.</p>
        )}
        {data && data.titulares.length > 0 && (
          <div role="region" aria-label="Tabla de titulares" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 font-medium">Nombre</th>
                  <th className="py-2 font-medium">Documento</th>
                  <th className="py-2 font-medium">Estamento</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 font-medium">Teléfono</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.titulares.map((t) => (
                  <tr key={t.id} className="border-b border-border align-top">
                    <td className="py-2 text-foreground">{t.nombre}</td>
                    <td className="py-2 text-foreground">{t.documento}</td>
                    <td className="py-2 text-foreground">
                      {t.estamento}
                      {!t.estamentoConfirmado && (
                        <span className="block text-xs text-muted-foreground">Pendiente de confirmar</span>
                      )}
                    </td>
                    <td className="py-2 text-foreground">
                      {ESTADOS[t.estado]}
                      {t.provisionalVenceEn && (
                        <span className="block text-xs text-muted-foreground">
                          Código provisional sin canjear (vence{' '}
                          {new Date(t.provisionalVenceEn).toLocaleDateString('es-CO')})
                        </span>
                      )}
                      {t.estado === 'en_revision' && (
                        <span className="block text-xs text-muted-foreground">
                          {t.registroVigenteId === null
                            ? 'Sin registro vigente con este documento'
                            : 'Documento repetido'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-foreground">{t.dispositivoActivo ? 'Vinculado' : '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {!t.estamentoConfirmado && t.estado === 'activo' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={confirmar.isPending}
                            onClick={() => confirmar.mutate(t)}
                          >
                            Confirmar {t.estamento} de {t.nombre}
                          </Button>
                        )}
                        {t.estado === 'activo' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAccion({ titular: t, accion: 'revocar' })}
                          >
                            Revocar credencial de {t.nombre}
                          </Button>
                        )}
                        {t.dispositivoActivo && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAccion({ titular: t, accion: 'desvincular' })}
                          >
                            Desvincular teléfono de {t.nombre}
                          </Button>
                        )}
                        {t.estado === 'en_revision' && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setResolucion({
                                  titular: t,
                                  resolucion: t.registroVigenteId === null ? 'aprobar' : 'reemplazar',
                                })
                              }
                            >
                              {t.registroVigenteId === null ? 'Aprobar alta de' : 'Reemplazar registro con el alta de'}{' '}
                              {t.nombre}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setResolucion({ titular: t, resolucion: 'rechazar' })}
                            >
                              Rechazar alta de {t.nombre}
                            </Button>
                          </>
                        )}
                        {t.estado === 'activo' && t.provisionalVenceEn && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setResolucion({ titular: t, resolucion: 'regenerar' })}
                          >
                            Nuevo código provisional para {t.nombre}
                          </Button>
                        )}
                        {t.estado === 'suspendido' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAccion({ titular: t, accion: 'reactivar' })}
                          >
                            Reactivar a {t.nombre}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ExportarRevocados />

      <Conservacion />

      {accion && (
        <DialogoAccion titular={accion.titular} accion={accion.accion} onCancel={() => setAccion(null)} />
      )}
      {resolucion && (
        <DialogoResolucion
          titular={resolucion.titular}
          resolucion={resolucion.resolucion}
          onCancel={() => setResolucion(null)}
        />
      )}
    </div>
  );
}
