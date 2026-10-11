# Catálogo de componentes y patrones de interacción

> **Estado: borrador para decisión conjunta (issue #57).** Redactado por Duverney a
> partir del código en `main` (`9e4f6ff`). El inventario de las secciones 1 y 2 describe
> lo que existe hoy. Los patrones de las secciones 3 a 5 marcados como **propuesta** no
> son estándar hasta que Jhunier los revise y ambos los acuerden, igual que un ADR.

Este documento trata de **estructura y comportamiento**: qué componentes hay, qué
reciben y cuándo usarlos. El aspecto visual (color, tipografía, espaciado) está en
[`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md); los criterios de accesibilidad, en el borrador de
`ACCESSIBILITY.md` (issue #58).

**Corrección al planteamiento del issue:** solo `mi-app-qr/client` usa shadcn/ui.
`verifier-web/` tiene sus propios componentes con CSS propio (`src/index.css`) y no
comparte primitivas con el cliente. Son dos catálogos separados.

## 1. `mi-app-qr/client`

### Primitivas de interfaz (`src/components/ui/`, shadcn/ui)

| Componente | Props | Cuándo usarlo |
|---|---|---|
| `Button` | Las de `<button>` más `variant` (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`), `size` (`default`, `sm`, `lg`, `icon`) y `asChild` | Toda acción. `default` para la acción principal de un bloque; `outline` para secundarias y "Cancelar"; `ghost` para acciones de icono en tablas ("Ver historial") y "Limpiar"; `size="icon"` siempre con `aria-label` |
| `Input` | Las de `<input>` | Todo campo de texto, fecha o fecha y hora. Siempre con un `Label` ligado por `htmlFor`/`id` |
| `Label` | Las de `@radix-ui/react-label` | Etiqueta de cada campo |
| `Toast`, `Toaster`, `useToast` | — | **Instalados pero sin uso:** `Toaster` no está montado en ninguna parte. Ver divergencia D1 |

No existe una primitiva `Select`: los `<select>` se escriben a mano y repiten las clases
de `Input`, de forma inconsistente (ver D4).

### Componentes de dominio (`src/components/`)

| Componente | Props | Qué hace | Dónde se usa |
|---|---|---|---|
| `Sidebar` | — (lee `useAuth` y la ruta) | Navegación principal con `aria-current`, enlace a Usuarios solo para `admin`, cierre de sesión | `AppLayout` en `App.tsx`, todas las rutas protegidas |
| `CorregirRegistroModal` | `registro: Registro \| null`, `onCancel`, `onSubmit(data: CorregirRegistroRequest)`, `isSubmitting` | Formulario de corrección con motivo obligatorio. Se muestra si `registro` no es `null` | `RegistrosPage` (solo `admin`) |
| `HistorialCorreccionesModal` | `registro: Registro \| null`, `onClose` | Línea de tiempo de versiones de un registro. Hace su propia consulta (`getRegistroHistory`) con estados de carga y error | `RegistrosPage` |
| `ExportCsvModal` | `isOpen`, `onCancel`, `onExport(rol: string \| null)` | Exportar todo (`null`) o filtrar por un rol exacto | `RegistrosPage` |
| `ForgottenOutModal` | `isOpen`, `registro`, `canCorrect`, `isSubmitting?`, `error?`, `onCorrect`, `onForce`, `onCancel` | Aviso de posible salida olvidada antes de registrar otra entrada | `RegistrosPage` |

Componente local, no exportado: `MetricCard` (`icon`, `label`, `value: number \| null`,
`tone`) en `DashboardPage`. `null` muestra "—" mientras carga.

### Hooks, autenticación y utilidades

| Pieza | Firma | Uso |
|---|---|---|
| `useModalFocus` | `(open: boolean, onClose: () => void) => RefObject<HTMLDivElement>` | Foco inicial, Tab contenido, Escape y foco de vuelta en un diálogo. Lo usan `ExportCsvModal` y `ForgottenOutModal` |
| `AuthProvider` / `useAuth` | `useAuth()` → usuario, `isLoading`, `login`, `logout` | Sesión en toda la app |
| `RequireAuth` | `children` | Protege rutas: "Cargando..." mientras consulta, redirige a `/login` sin sesión |
| `apiClient` | `login`, `getMe`, `logout`, `createRegistro`, `listRegistros`, `getRegistroHistory`, `createUser`, `listUsers`, `correctRegistro`; errores como `ApiError` | Única vía al servidor; rutas relativas, mismo origen |
| `registrosCsv` | `buildRegistrosCsv`, `downloadCsv` | CSV con escape y protección contra fórmulas; lo comparten Informes y Registros |
| `registroEntries` | `findOpenEntry(registros, documento)` | Detecta la entrada sin salida que dispara `ForgottenOutModal` |
| `qrParser` | `parseQrTextData`, `parseQrUrlData` | Rellena el formulario desde el texto de un QR convencional; no verifica nada |

Los datos del servidor se leen con React Query. Las listas de registros comparten la
clave `['registros']` y se refrescan cada 7 s (`refetchInterval: 7000`) en Dashboard,
Registros e Informes.

## 2. `verifier-web/`

| Componente | Props | Qué hace |
|---|---|---|
| `ScannerPanel` | `cameraStatus`, `devices`, `inputMode`, `manualToken`, `selectedDeviceId`, `verificationPhase`, `videoRef`, `onInputModeChange`, `onManualSubmit`, `onManualTokenChange`, `onSelectDevice`, `onStartCamera`, `onStopCamera` | Lectura por cámara o entrada manual, con pestañas (`role="tablist"`) y mensajes de error de cámara |
| `ResultPanel` | `cameraStatus`, `phase`, `onNext` | Muestra el estado. Con decisión (`accepted`/`rejected`) ocupa la pantalla con `role="alert"` y "Nueva verificación" |
| `SessionHistory` | `entries`, `onClear`, `summaryOnly?` | Historial volátil de la sesión (máximo 8, solo hora y decisión, ADR-0012) |
| `useQrScanner` | `({ onDetected })` → `devices`, `selectedDeviceId`, `selectDevice`, `start`, `status`, `stop`, `videoRef` | Cámara y detección; bloquea lecturas duplicadas mientras se verifica |
| `verifierApi` | `checkService(signal?)`, `verifyCredential(token)` → `boolean` | Contrato con el adaptador HTTP de `verifier/` |

Los estados están tipados en `src/types.ts` (`CameraStatus`, `VerificationPhase`,
`ServiceStatus`). No hay ningún componente compartido con `mi-app-qr/client`.

## 3. Patrones de estado

### Lo que existe hoy

| Pantalla | Cargando | Vacío | Error | Éxito |
|---|---|---|---|---|
| Dashboard | "—" en métricas; "Cargando actividad..." | "Sin actividad registrada todavía." | Banner `role="alert"` con borde `destructive` y botón "Reintentar" (`outline`, `sm`, icono `RefreshCw`) | Métricas y tabla |
| Registros | "Cargando..." | "Sin registros todavía." | `<div role="alert">` sin estilo con "Reintentar"; errores al guardar como `<p role="alert">` | Formulario se limpia, sin mensaje de confirmación |
| Informes | "Cargando registros..." | "No hay registros que coincidan con los filtros." | Mismo banner que Dashboard | Tabla y conteo `aria-live` |
| Usuarios | "Cargando..." | — (siempre hay al menos un admin) | **Ninguno**: si la consulta falla, la sección queda vacía | Recuadro con la contraseña generada |
| Historial (diálogo) | "Cargando historial..." (`aria-live`) | — | Bloque `role="alert"` con "Reintentar" | Línea de tiempo |
| Portal de verificación | "Verificando credencial" con icono giratorio | "Listo para verificar" | "Servicio no disponible" (`phase="offline"`) | Pantalla completa "Acceso validado" o "Acceso denegado" |

### Propuesta para `mi-app-qr/client`

- **Cargando:** texto que nombra qué se carga ("Cargando registros..."), con
  `text-muted-foreground`. Nunca solo "Cargando...".
- **Vacío:** frase que explica por qué está vacío y, si aplica, qué hacer ("No hay
  registros que coincidan con los filtros.").
- **Error de consulta:** el banner de Dashboard e Informes (borde `destructive/30`,
  fondo `destructive/5`, `role="alert"`, "Reintentar" `outline` `sm` con `RefreshCw`).
  Aplicarlo también a Registros y añadirlo a Usuarios.
- **Error al guardar:** `<p role="alert" className="text-sm text-destructive">` junto al
  botón que lo provocó.
- **Éxito:** confirmación breve con `role="status"` cuando la persona necesita saberlo
  (usuario creado, corrección guardada); limpiar el formulario solo no basta para quien
  no ve la pantalla.

## 4. Patrón de diálogo de confirmación y corrección

### Lo que existe hoy: tres implementaciones

1. **`CorregirRegistroModal`:** fija la estructura de dominio de una corrección, pero
   **no gestiona el foco**: no usa `useModalFocus`, Escape no lo cierra, no tiene `z-50`
   y declara `aria-modal="true"` sin comportarse como modal (hallazgo de prioridad alta
   en la auditoría del #58).
2. **`ExportCsvModal` y `ForgottenOutModal`:** usan `useModalFocus`. `ForgottenOutModal`
   además ignora Escape y Cancelar mientras guarda.
3. **`HistorialCorreccionesModal`:** repite a mano la misma lógica de foco del hook y es
   el único con encabezado, cuerpo desplazable y pie separados.

### Qué distingue una corrección de una edición simple (ADR-0008)

- **Nunca sobrescribe:** el servidor crea una fila nueva que apunta a la corregida
  (`corrige_registro_id`); la original sigue en el historial.
- **Motivo obligatorio:** campo `motivo`, validado en cliente (zod) y servidor.
- **Solo `admin`:** el botón "Corregir" se muestra solo a administradores, pero la
  autorización real es `requireAdmin` en el servidor.
- **Trazable:** el resultado se consulta en `HistorialCorreccionesModal`.

`EditRecordModal` (edición directa del prototipo viejo) se eliminó del cliente en el
issue #48 precisamente por no cumplir esto.

### Propuesta de estructura estándar

```tsx
// Contenedor: capa + panel. Comportamiento: siempre useModalFocus.
const ref = useModalFocus(open, () => { if (!isSubmitting) onCancel(); });
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="mi-dialogo-title"
       className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
    <h2 id="mi-dialogo-title" className="mb-4 text-lg font-semibold">…</h2>
    {/* contenido o formulario */}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={isSubmitting}>Acción principal</Button>
    </div>
  </div>
</div>
```

Reglas propuestas:

1. Todo diálogo usa `useModalFocus`; nadie reimplementa el manejo de foco.
2. Nombre accesible con `aria-labelledby` apuntando al `<h2>`, no con un `aria-label`
   que repita el título.
3. "Cancelar" (`outline`) a la izquierda y la acción principal a la derecha.
4. Mientras se guarda: botones deshabilitados y Escape ignorado.
5. El error del guardado aparece dentro del diálogo, no en la página de atrás. Hoy
   `RegistrosPage` muestra el error de corrección debajo del formulario principal,
   detrás del diálogo.
6. Un diálogo que modifica datos de un registro sigue el modelo de corrección:
   evento nuevo, motivo obligatorio, autorización en el servidor.

## 5. Patrón de tabla con filtros

**Corrección al planteamiento del issue:** solo `InformesPage` tiene filtros.
`RegistrosPage` muestra la lista sin filtros; su único filtro está en `ExportCsvModal`
(rol exacto al exportar). Dashboard usa el mismo contenedor de tabla sin filtros.

### Lo que hace `InformesPage`

- **Encabezado de página:** `h2` con antetítulo y "Exportar CSV" a la derecha,
  deshabilitado mientras carga o si no hay resultados. Exporta lo filtrado.
- **Sección "Filtros"** (`section` con `aria-labelledby`, `h3`): rejilla de 1, 2 o 4
  columnas; fechas "Desde" y "Hasta" enlazadas con `min`/`max`; `<select>` con primera
  opción vacía ("Todos los roles", "Todos"); "Limpiar" (`ghost`, `sm`, `FilterX`) solo
  si hay algún filtro activo. El filtrado es en el cliente y al instante, sin botón
  "Aplicar".
- **Sección "Resultados":** `h3` con el conteo en `aria-live="polite"`; contenedor
  `role="region"`, `tabIndex={0}`, `aria-label` y `overflow-x-auto` para que la tabla se
  desplace con teclado en pantallas angostas (`min-w-[760px]`); estados de carga, vacío
  y error de la sección 3.
- **Celdas:** tipo como etiqueta de color (entrada `emerald`, salida `amber`); fecha y
  hora alineadas a la derecha con `tabular-nums`.

`RegistrosPage` usa otra convención para pantallas angostas: oculta columnas
(`hidden sm:table-cell`) en vez de desplazar la tabla, y tiene una columna de acciones
con encabezado `sr-only`.

### Propuesta

| Control | Fijo u opcional |
|---|---|
| Sección de filtros con `h3` y "Limpiar" condicional | Fijo en toda tabla filtrable |
| Filtros que aplican al instante, sin "Aplicar" | Fijo mientras el filtrado sea en el cliente |
| Rango de fechas enlazado (`min`/`max`) | Opcional, si la tabla tiene fechas |
| `<select>` con primera opción vacía "Todos…" | Fijo para filtros por categoría |
| Conteo de resultados en `aria-live` | Fijo |
| Contenedor desplazable `role="region"` con `tabIndex` | Fijo para tablas anchas |
| Exportar lo filtrado, deshabilitado si no hay resultados | Opcional |
| Columna de acciones con encabezado `sr-only` y botones con el nombre del registro | Fijo si hay acciones por fila |

## 6. Divergencias para decidir

| # | Divergencia | Opciones |
|---|---|---|
| D1 | `Toast`/`Toaster` instalados y sin montar | Montarlos y usarlos para confirmaciones (sección 3) o eliminarlos |
| D2 | Tres implementaciones de diálogo | Unificar en `useModalFocus` y la estructura de la sección 4 |
| D3 | Dos convenciones de tabla angosta (desplazar en Informes y Dashboard; ocultar columnas en Registros) | Elegir una, o desplazar en tablas de consulta y ocultar en tablas de trabajo |
| D4 | No hay primitiva `Select`; los `<select>` repiten clases y algunos no tienen estilo de foco | Crear `ui/select.tsx` con las clases de `Input` |
| D5 | Estados de error distintos entre pantallas, y Usuarios sin ninguno | Adoptar el banner de la sección 3 en todas |
| D6 | `verifier-web/` y `mi-app-qr/client` no comparten componentes | Mantenerlos separados (son productos distintos, ADR-0012) o extraer un paquete común. Se recomienda mantenerlos separados y alinear solo patrones |

## 7. Para decidir entre los dos autores

1. ¿Se aceptan como estándar las estructuras propuestas de diálogo (sección 4) y de
   tabla con filtros (sección 5)?
2. ¿Qué se hace con cada divergencia D1–D6?
3. ¿El catálogo se mantiene a mano en este archivo, o se adopta algo como Storybook más
   adelante?
