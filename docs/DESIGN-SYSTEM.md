# Sistema de diseño

> **Estado: borrador (issue #55).** Este documento describe lo que el código de
> `mi-app-qr/client` y `verifier-web/` ya decidió, extraído directamente de
> `tailwind.config.ts` y de las hojas de estilo — no inventa valores nuevos. La sección
> "Divergencias a decidir en conjunto" reúne los puntos que sí son una decisión de
> producto pendiente. Ninguna de esas divergencias se cierra con este documento: se
> cierra cuando Jhunier y Duverney la acuerden explícitamente, igual que un ADR
> (ver `docs/DECISIONS.md`). Hasta entonces, este archivo documenta el estado actual,
> no un estándar ya aprobado.

## Alcance y estado actual: dos lenguajes visuales, no uno

`mi-app-qr/client` y `verifier-web/` **no comparten un sistema de tokens hoy**. Es un
hallazgo, no una suposición de partida:

- `mi-app-qr/client` usa Tailwind CSS + shadcn/ui, con la paleta como variables HSL en
  `src/index.css` y consumida vía `tailwind.config.ts`.
- `verifier-web/` **no usa Tailwind** (no tiene `tailwind.config.*` ni la dependencia en
  `package.json`). Su paleta vive en CSS plano con variables personalizadas en
  `src/index.css`, con su propia escala tipográfica en píxeles y pesos numéricos no
  convencionales.

Esto es consistente con ADR-0012, que exige que `verifier-web/` sea una aplicación
independiente que no importe código ni infraestructura de `mi-app-qr/`. Pero
"independiente en código" no obligaba a "independiente en paleta" — eso sí es una
decisión de producto que nunca se tomó explícitamente. Se documenta aquí el estado real
de cada app por separado; si deben converger a una sola paleta institucional es la
primera pregunta de la sección de divergencias, al final.

---

## `mi-app-qr/client`

### Color

Variables HSL definidas en `src/index.css` y consumidas por Tailwind vía
`hsl(var(--x))` (`tailwind.config.ts`). El hex es el equivalente calculado, para
referencia visual — la fuente de verdad es el triple HSL.

| Token | HSL | Hex | Uso |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#ffffff` | Fondo de página |
| `--foreground` | `222 47% 11%` | `#0f1729` | Texto principal |
| `--primary` / `--ring` | `243 75% 59%` | `#5048e5` | Índigo aprobado (STATE.md): acciones primarias, foco, eyebrow labels |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre `--primary` |
| `--secondary` / `--muted` / `--accent` | `220 14% 96%` | `#f3f4f6` | Fondos secundarios, hover, chips neutros |
| `--secondary-foreground` / `--accent-foreground` | `222 47% 11%` | `#0f1729` | Texto sobre fondos secundarios |
| `--muted-foreground` | `215 16% 47%` | `#65758b` | Texto secundario/deshabilitado |
| `--border` / `--input` | `220 13% 91%` | `#e5e7eb` | Bordes, contornos de input |
| `--destructive` | `0 72% 51%` | `#dc2828` | Errores, acciones destructivas |
| `--destructive-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre `--destructive` |
| `--radius` | — | `0.5rem` | Radio de borde base (botones, cards, inputs) |

**No existen `--success`/`--warning` como variables de token.** Los estados de éxito y
advertencia se resuelven hoy con clases sueltas de la paleta de Tailwind, no con
tokens del sistema:

```
success: 'bg-emerald-100 text-emerald-700'   (DashboardPage.tsx)
warning: 'bg-amber-100 text-amber-700'
neutral: 'bg-slate-100 text-slate-700'
```

La misma pareja `emerald-100/emerald-700` se reutiliza para el badge "Entrada" y
`amber-100/amber-700` para "Salida" (`DashboardPage.tsx`, `InformesPage.tsx`). Es un
patrón consistente en la práctica, pero no está tokenizado — ver divergencias.

> `ForgottenOutModal.tsx` usa colores sueltos (`teal-*`, `yellow-*`, `orange-600`) fuera
> de esta paleta. No es una referencia válida: es código muerto, no está importado por
> ninguna pantalla real (heredado del prototipo Electron viejo). No replicar sus colores
> en trabajo nuevo.

### Tipografía

Familia declarada en `tailwind.config.ts`: `fontFamily.sans = ['Inter', 'sans-serif']`,
aplicada globalmente vía `body { @apply font-sans }`. (No se encontró una carga
explícita de la fuente Inter — `@import` o `<link>` — dentro de los archivos propios de
`mi-app-qr/client`; queda como pendiente de verificar antes de dar el token por
cerrado.)

Escala real en uso, tomada de componentes existentes (`Sidebar`, `DashboardPage`,
`InformesPage`, `LoginPage`, `HistorialCorreccionesModal`):

| Nivel | Clase | Uso |
|---|---|---|
| Métrica destacada | `text-3xl font-semibold` | Números grandes de Dashboard |
| Título de página | `text-2xl font-semibold` | "Dashboard", "Informes" |
| Título de componente | `text-lg font-semibold` / `text-xl font-semibold` | "Registro QR" (marca), card de login |
| Subtítulo de sección | `font-semibold` (tamaño por defecto) | "Actividad reciente", "Filtros", "Resultados" |
| Eyebrow (etiqueta sobre título) | `text-sm font-medium text-primary` | "Vista general", "Consulta y extracción" |
| Cuerpo / tabla / botones | `text-sm` | Prácticamente universal en celdas, labels, botones |
| Caption / metadato | `text-xs` | Etiquetas `dt` en historial, eyebrows secundarios |

No se usa `font-bold` en las pantallas reales; los únicos pesos son `font-medium` y
`font-semibold`. El texto de carga/vacío es inconsistente entre `text-sm` y el tamaño
por defecto (`text-base`) — ver Guía de Contenido para la recomendación de unificarlo.

### Espaciado

Escala de 4px de Tailwind por defecto, sin extensión personalizada en
`tailwind.config.ts`. Convenciones reales en uso:

| Contexto | Valor | Equivalente |
|---|---|---|
| Padding de card/panel (escritorio) | `p-6` | 24px |
| Padding de card/panel (cuerpo de sección) | `p-5` | 20px |
| Padding de card/panel (móvil) | `p-4` | 16px |
| Ritmo vertical entre secciones de página | `space-y-8` | 32px |
| Agrupación label + input | `space-y-2` | 8px |
| Gap en clusters de header/nav | `gap-3` | 12px |
| Gap en grillas de métricas / filas de formulario | `gap-4` | 16px |
| Gap en íconos de nav / icono+label de botón | `gap-1` / `gap-2` | 4px / 8px |
| Padding de celda de tabla | `px-5 py-3` (o `py-2` según la tabla) | — |

### Iconografía

Librería: **lucide-react**, usada en `Sidebar`, `RegistrosPage`, `DashboardPage`,
`InformesPage`, `HistorialCorreccionesModal`.

| Tamaño | Clase | Uso |
|---|---|---|
| Ícono estándar (nav, tabla, botón) | `size-4` | El más frecuente |
| Ícono de énfasis | `size-5` | Encabezados de sección, marca en sidebar |
| Ícono inline pequeño | `size-3` / `size-3.5` | Metadatos, badges |
| Contenedor de ícono tipo avatar | `size-9` / `size-10` | Insignia de marca en sidebar |

El componente `Button` de shadcn/ui fuerza `[&_svg]:size-4` a cualquier ícono dentro de
un botón — así que un ícono dentro de `<Button>` siempre se ve a 16px sin importar el
tamaño que se le pase.

**Convención de accesibilidad:** todo ícono decorativo junto a texto visible lleva
`aria-hidden="true"`. Se aplica de forma consistente (confirmado en 18+ ocurrencias). La
excepción correcta es un ícono que es el único contenido de un control interactivo —
ahí el control lleva `aria-label` en vez de ocultar el ícono.

---

## `verifier-web/`

### Color

Variables CSS en `src/index.css`. Paleta **teal/coral/verde/ámbar**, deliberadamente
distinta de la de `mi-app-qr/client`:

| Token | Hex | Uso |
|---|---|---|
| `--canvas` | `#edf3f2` | Fondo de página |
| `--surface` | `#ffffff` | Fondo de tarjetas |
| `--surface-soft` | `#f5f8f7` | Fondo secundario |
| `--ink` | `#142a29` | Texto principal |
| `--muted` / `--muted-strong` | `#5c706f` / `#415856` | Texto secundario |
| `--line` / `--line-strong` | `#d5e0de` / `#bdcdca` | Bordes |
| `--teal-500` | `#16a39c` | Acento principal (botones, indicador en vivo) |
| `--teal-700` / `--teal-800` | `#0d6d69` / `#0b5755` | Hover, gradientes |
| `--teal-950` | `#082c2b` | Encabezados, superficies oscuras |
| `--green-500` / `--green-700` / `--green-900` | `#2b9d6a` / `#18734c` / `#0f4a31` | Estado "aceptado" |
| `--coral-500` / `--coral-700` / `--coral-900` | `#db5953` / `#b63e39` / `#7a2521` | Estado "rechazado" |
| `--amber-700` | `#9a6515` | Estado "servicio no disponible" |
| `--focus` | `#0f827d` | Anillo de foco (`rgba(15,130,125,0.28)`) |

### Tipografía

`font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif` — declarada como pila CSS, no como config de Tailwind (esta app
no usa Tailwind). Mismo Inter como familia principal que `mi-app-qr/client`, con una
cadena de reemplazo de sistema más larga.

| Nivel | Tamaño / peso | Uso |
|---|---|---|
| Hero (decisión grande) | `46px` / peso `800` | Título de resultado a pantalla completa |
| `h1` | `24px` / peso `760` | Título de página |
| `h2` (result card) | `18–22px` / peso `740` | Título de superficie |
| Cuerpo (result card) | `14px` | Texto de descripción de resultado |
| Eyebrow | `11px`, mayúsculas, peso `780` | Etiquetas sobre título |
| Botones | `13px` | — |

Usa **pesos numéricos no convencionales** (`680`, `720`, `740`, `760`, `780`, `800`) en
vez de los pasos estándar 400/500/600/700 que usa `mi-app-qr/client` vía
`font-medium`/`font-semibold`. Divergencia real, no solo de valores sino del propio
sistema de pesos — ver divergencias.

### Espaciado

Sin Tailwind: valores en píxeles escritos a mano, alineados de forma laxa a múltiplos
de 4px pero sin una escala formal. Ejemplos: header `padding: 12px 24px`, `gap: 24px`;
superficie de escáner `padding: 24px`; cuerpo de formulario manual `padding: 40px`;
`.field-group` `gap: 7px` (valor fuera de escala); botones `padding: 9px 16px`. Se
reduce en los breakpoints responsivos (`18px`, `15px`, `14px`, `10px`).

### Iconografía

También **lucide-react** (`package.json`: `^0.427.0`), usado en `App.tsx`,
`ResultPanel.tsx`, `SessionHistory.tsx`. Como no hay Tailwind, el tamaño se pasa como
prop numérica en píxeles, no como clase:

| Tamaño | Uso |
|---|---|
| `size={16}` | Estado de servicio, historial de sesión |
| `size={17}` / `size={18}` | Botón de refrescar / siguiente |
| `size={25}` | Marca |
| `size={42}` / `size={72}` / `size={96}` | Ilustraciones de estado grandes en el panel de resultado |

Misma convención de `aria-hidden="true"` en íconos decorativos junto a texto, aplicada
de forma consistente.

---

## Modo oscuro

**No implementado en ninguna de las dos apps.** `tailwind.config.ts` de
`mi-app-qr/client` declara `darkMode: ['class']`, pero ningún componente agrega la
clase `.dark` ni existe un bloque de variables CSS para modo oscuro — es andamiaje del
scaffold de shadcn/ui que nunca se activó, no una funcionalidad real. `verifier-web/`
no tiene ninguna referencia a modo oscuro. Se documenta como pendiente, no como
decisión tomada.

---

## Divergencias identificadas (a decidir en conjunto)

Estos puntos son decisiones de producto, no hechos del código — no se cierran con este
documento. Quedan explícitamente para acordar con Duverney antes de cerrar el issue #55:

1. **¿Un solo sistema de tokens o dos lenguajes visuales mantenidos a propósito?**
   Hoy son dos paletas distintas (índigo/shadcn vs. teal/coral). ADR-0012 exige
   independencia de código, no necesariamente de paleta. Definir si se unifica una
   paleta institucional compartida o si la separación visual queda como decisión
   consciente (por ejemplo, para que el personal distinga a simple vista en cuál de
   las dos herramientas está).
2. **Tokenizar éxito/advertencia en `mi-app-qr/client`.** Hoy son clases sueltas
   (`emerald-100/700`, `amber-100/700`), no variables `--success`/`--warning` como las
   que sí existen para `--destructive`. Decidir si se agregan como tokens formales.
3. **Normalizar los pesos de fuente de `verifier-web/`.** Los valores numéricos no
   convencionales (`680`–`800`) no tienen equivalente directo en la escala
   `medium`/`semibold`/`bold` de `mi-app-qr/client`. Decidir si se migra a una escala
   estándar o se documenta como intencional.
4. **Modo oscuro.** Decidir si se implementa (y en qué app primero) o si se retira el
   `darkMode: ['class']` inerte de `tailwind.config.ts` para no sugerir una capacidad
   que no existe.

## Aprobación

Borrador abierto por Jhunier. Pendiente de revisión explícita de Duverney sobre el
contenido completo — no basta con la aprobación de PR de rutina exigida por
`CONTRIBUTING.md` — antes de considerar cerrado el issue #55.
