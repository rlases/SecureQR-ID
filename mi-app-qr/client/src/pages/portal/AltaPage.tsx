import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { AltaTitularResponse } from '@mi-app-qr/shared';
import { ApiError, altaTitular, getInfoAlta, getSugerenciaEstamento } from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { CodigoRecuperacion, PortalLayout } from './PortalLayout';

// Alta del titular (ADR-0016, punto 2): datos declarados, autorización de tratamiento de
// datos (Ley 1581 de 2012) y vínculo de este teléfono.

const altaSchema = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre completo.'),
  documento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,20}$/, 'Escribe tu documento sin puntos, espacios ni guiones.'),
  correo: z.string().trim().email('Escribe un correo válido, por ejemplo ana@ejemplo.com.'),
  estamentoId: z.string().min(1, 'Elige tu estamento.'),
  autorizaDatos: z.literal(true, {
    errorMap: () => ({ message: 'Para registrarte debes autorizar el tratamiento de tus datos.' }),
  }),
});

type Campos = 'nombre' | 'documento' | 'correo' | 'estamentoId' | 'autorizaDatos';

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function Huella({ huella }: { huella: { sha256: string; desde: string } }) {
  return (
    <section aria-labelledby="huella-title" className="space-y-2 rounded-md border border-border bg-background p-4 text-sm">
      <h2 id="huella-title" className="font-semibold text-foreground">
        Antes de escribir tus datos, comprueba que estás en el servidor del CCAV
      </h2>
      <p className="text-muted-foreground">
        Tu navegador te avisará que el certificado no es de confianza. Ábrelo desde el
        candado o el aviso de la barra de direcciones y compara su huella SHA-256 con la del
        cartel de la sede. Si no coinciden, no sigas.
      </p>
      <p className="break-all font-mono text-xs text-foreground">{huella.sha256}</p>
      <p className="text-muted-foreground">
        Huella vigente desde el {new Date(huella.desde).toLocaleDateString('es-CO')}.
      </p>
    </section>
  );
}

export default function AltaPage() {
  const info = useQuery({ queryKey: ['portal', 'alta'], queryFn: getInfoAlta });
  const [valores, setValores] = useState({
    nombre: '',
    documento: '',
    correo: '',
    estamentoId: '',
    autorizaDatos: false,
  });
  const [errores, setErrores] = useState<Partial<Record<Campos, string>>>({});
  const [resultado, setResultado] = useState<AltaTitularResponse | null>(null);
  const alta = useMutation({
    mutationFn: (datos: Parameters<typeof altaTitular>[0]) => altaTitular(datos),
    onSuccess: (r) => setResultado(r),
  });

  async function sugerirEstamento() {
    if (valores.estamentoId || !valores.correo.includes('@')) return;
    try {
      const { estamentoId } = await getSugerenciaEstamento(valores.correo);
      if (estamentoId !== null) {
        setValores((v) => (v.estamentoId ? v : { ...v, estamentoId: String(estamentoId) }));
      }
    } catch {
      // La sugerencia es una ayuda; si falla, el titular elige a mano.
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = altaSchema.safeParse(valores);
    if (!parsed.success) {
      const nuevos: Partial<Record<Campos, string>> = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as Campos;
        nuevos[campo] ??= issue.message;
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    alta.mutate({ ...parsed.data, estamentoId: Number(parsed.data.estamentoId) });
  }

  const campo = (nombre: Campos) => ({
    'aria-invalid': errores[nombre] ? true : undefined,
    'aria-describedby': errores[nombre] ? `${nombre}-error` : undefined,
  });
  const error = (nombre: Campos) =>
    errores[nombre] ? (
      <p id={`${nombre}-error`} className="text-sm text-destructive">
        {errores[nombre]}
      </p>
    ) : null;

  if (resultado?.estado === 'activo') {
    return (
      <PortalLayout titulo="Registro completo">
        <p className="text-foreground">Este teléfono quedó vinculado a tu credencial.</p>
        {resultado.estamentoPendiente && (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground">
            Un administrador debe confirmar tu estamento. Mientras tanto recibes el horario del
            estamento general.
          </p>
        )}
        <CodigoRecuperacion codigo={resultado.codigoRecuperacion} />
        <Button asChild>
          <Link to="/portal">Ya guardé mi código, continuar</Link>
        </Button>
      </PortalLayout>
    );
  }

  if (resultado?.estado === 'en_revision') {
    return (
      <PortalLayout titulo="Registro en revisión">
        <p role="status" className="text-foreground">
          Ya hay un registro con ese documento. Tu solicitud quedó para revisión de un
          administrador del CCAV; acércate a la sede para resolverla.
        </p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout titulo="Registro del titular">
      {info.isLoading && <p className="text-muted-foreground">Cargando el formulario de registro...</p>}
      {info.isError && (
        <p role="alert" className="text-destructive">
          No se pudo cargar el formulario. Revisa que estés conectado a la red del CCAV.
        </p>
      )}
      {info.data && !info.data.abierta && (
        <p role="status" className="text-foreground">
          El registro todavía no está abierto. Vuelve a intentarlo más tarde.
        </p>
      )}
      {info.data?.abierta && (
        <>
          {info.data.huella && <Huella huella={info.data.huella} />}
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                autoComplete="name"
                value={valores.nombre}
                onChange={(e) => setValores({ ...valores, nombre: e.target.value })}
                {...campo('nombre')}
              />
              {error('nombre')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="documento">Número de documento</Label>
              <Input
                id="documento"
                inputMode="numeric"
                value={valores.documento}
                onChange={(e) => setValores({ ...valores, documento: e.target.value })}
                {...campo('documento')}
              />
              {error('documento')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="correo">Correo de contacto</Label>
              <Input
                id="correo"
                type="email"
                autoComplete="email"
                value={valores.correo}
                onChange={(e) => setValores({ ...valores, correo: e.target.value })}
                onBlur={sugerirEstamento}
                {...campo('correo')}
              />
              <p className="text-xs text-muted-foreground">
                Solo para que un administrador pueda escribirte. No te enviaremos mensajes.
              </p>
              {error('correo')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="estamentoId">Estamento</Label>
              <select
                id="estamentoId"
                className={selectClass}
                value={valores.estamentoId}
                onChange={(e) => setValores({ ...valores, estamentoId: e.target.value })}
                {...campo('estamentoId')}
              >
                <option value="">Elige tu estamento</option>
                {info.data.estamentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.requiereConfirmacion ? ' (lo confirma un administrador)' : ''}
                  </option>
                ))}
              </select>
              {error('estamentoId')}
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={valores.autorizaDatos}
                  onChange={(e) => setValores({ ...valores, autorizaDatos: e.target.checked })}
                  {...campo('autorizaDatos')}
                />
                <span>
                  Autorizo el tratamiento de mi nombre, documento y correo (Ley 1581 de 2012)
                  para generar mi credencial QR y registrar mis ingresos al CCAV. Solo un
                  administrador puede relacionar mi credencial con estos datos, y cada consulta
                  queda registrada. Al cierre del proyecto mis datos se eliminan o anonimizan.
                </span>
              </label>
              {error('autorizaDatos')}
            </div>
            {alta.error && (
              <p role="alert" className="text-sm text-destructive">
                {alta.error instanceof ApiError
                  ? `No se pudo completar el registro: ${alta.error.message}.`
                  : 'No se pudo completar el registro. Inténtalo de nuevo.'}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={alta.isPending}>
              Registrarme y vincular este teléfono
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            ¿Ya te registraste y cambiaste de teléfono?{' '}
            <Link className="underline" to="/portal/recuperar">
              Vincula este teléfono con tu código
            </Link>
            .
          </p>
        </>
      )}
    </PortalLayout>
  );
}
