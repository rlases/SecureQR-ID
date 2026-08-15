# Diseño: frontend nuevo de `mi-app-qr` como cliente web multiusuario

**Fecha:** 2026-08-15
**Estado:** diseño aprobado por Jhunier, pendiente de implementación
**Depende de:** [ADR-0008](../../DECISIONS.md#adr-0008--mi-app-qr-pasa-de-app-monopuesto-a-servidor-en-red-con-usuarios) (PR [#11](https://github.com/rlases/SecureQR-ID/pull/11), en revisión por Duverney)

## Contexto y objetivo

`mi-app-qr` es hoy una app de escritorio Electron + React de un solo puesto: los
registros viven en `localStorage` del equipo donde corre. ADR-0008 estableció el
requerimiento de que, al ejecutarse, la app levante un servidor accesible por su IP en
la red institucional, con login para personal (nunca estudiantes) y roles
diferenciados, para que varias personas registren, consulten, corrijan y generen
informes desde sus propios equipos.

Este documento diseña el frontend nuevo para ese cliente multiusuario — "moderno y
robusto" según lo pedido — reemplazando el frontend actual (Create React App + Tailwind
escrito a mano, sin sistema de diseño).

**Este trabajo es el frontend/cliente únicamente.** El servidor (API, autenticación,
persistencia) es un proyecto hermano que debe avanzar en paralelo — este spec asume su
contrato de API pero no lo diseña en detalle (ver "Fuera de alcance").

## Decisiones ya validadas (brainstorming con visual companion)

| Decisión | Elegido |
|---|---|
| Alcance | El frontend nuevo ES el cliente del servidor multiusuario, no un refresco aparte de la app actual |
| Framework/build | Vite + TypeScript (reemplaza Create React App) |
| Componentes | shadcn/ui + Tailwind CSS (no una librería de estilo cerrado tipo MUI) |
| Rol del equipo servidor | Conserva ventana Electron; los demás equipos entran por navegador. Un solo código de frontend sirve ambos casos |
| Estilo visual | Claro corporativo — blanco, bordes finos, acento índigo (`indigo-600`), estilo Linear/Notion: silencioso, mucho aire |
| Navegación | Barra lateral (continuidad con la app actual), no barra superior |

## Arquitectura

```
mi-app-qr/
├── server/          ← Express (Node.js) — API REST + autenticación + sirve el build del cliente
│   ├── auth/          (login, sesiones, hashing con librería establecida — ver SECURITY.md)
│   ├── routes/        (registros, informes, usuarios)
│   └── db/             (SQLite embebido vía better-sqlite3 — sin servidor de BD aparte)
├── client/          ← React + Vite + TypeScript — este diseño
│   └── src/
│       ├── components/
│       │   └── ui/      (shadcn/ui — código propio, no dependencia opaca)
│       ├── pages/        (Login, Registro, Dashboard, Informes, Usuarios)
│       ├── api/           (fetch + TanStack Query)
│       └── styles/
├── electron/         ← main.js, preload.js — arranca server/ y abre la ventana
│                        apuntando a http://localhost:<puerto>, igual que hoy
└── shared/           ← tipos TypeScript compartidos entre client/ y server/
```

El equipo que hoy corre la app sigue abriendo la ventana Electron. Al arrancar, esa
ventana levanta el servidor Express en su IP de red. Los demás equipos entran por
navegador normal a `http://<ip-del-servidor>:<puerto>`. Electron carga esa misma URL en
su ventana — mismo patrón que hoy (`isDev ? 'http://localhost:3000' : ...`), pero ahora
apuntando al servidor propio en vez de al dev server de CRA.

`localStorage` deja de ser la fuente de verdad; la reemplaza el servidor + SQLite.

## Componentes y sistema visual

- **Tema:** claro corporativo, acento índigo, tipografía Inter (ya en uso). Iconos con
  `lucide-react` (el set convencional de shadcn/ui).
- **shadcn/ui:** se instalan solo los componentes usados — `Button`, `Table`, `Dialog`,
  `Form`, `Sheet` (sidebar en pantallas angostas), `Toast` (reemplaza
  `Notification.jsx`). Viven en `client/src/components/ui/`, editables libremente.
- **Formularios:** `react-hook-form` + `zod`. Reemplaza el parseo manual con regex de
  `qrParser.js` por un esquema validado con mensajes de error claros.
- **Componentes de dominio existentes** (`DashboardView`, `RegistrationForm`,
  `EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`) se migran conservando su
  lógica de negocio, reconstruidos sobre los primitivos de shadcn/ui.

## Datos y comunicación con el servidor

- **TanStack Query** para todas las llamadas a la API: caché, reintentos y refetch
  automático.
- **Actualización entre usuarios:** polling corto (refetch cada 5–10 s) en las vistas de
  Dashboard y Registros, para que un usuario vea llegar registros de otro sin recargar.
  Suficiente para el volumen de un CCAV; **mejora futura explícita** pasar a WebSockets
  si se necesita algo más inmediato — no se construye ahora (YAGNI).
- **Manejo de errores de red visible:** toast de "sin conexión al servidor" cuando la
  API no responde, dado que el cliente ahora depende de la red LAN.

## Robustez

- **TypeScript de punta a punta.** `shared/` contiene los tipos de la API que usan tanto
  `client/` como `server/`, para que un cambio de contrato rompa la compilación en vez
  de fallar en producción.
- **Autorización siempre verificada en el servidor**, nunca solo ocultando botones en la
  UI — regla ya establecida en ADR-0008 y `THREAT-MODEL.md`, se reafirma aquí porque el
  frontend es donde es más tentador saltársela "por ahora".
- **Pruebas:** Vitest + React Testing Library (mismo motor que Vite; reemplaza el setup
  de Jest heredado de CRA). El workflow `.github/workflows/ci.yml` y `CONTRIBUTING.md`
  se actualizan para reflejar el comando nuevo cuando se implemente.
- **Errores de compilación de TypeScript y lint bloquean el build**, no solo advierten.

## Plan de migración (alto nivel, no big-bang)

1. **`server/` primero:** Express + SQLite + auth básica, con migración única de los
   datos existentes en `localStorage` (exportados manualmente una vez).
2. **`client/` en Vite**, reutilizando la lógica de negocio de los componentes actuales
   (roles, parseo de QR, dashboard) mientras se reemplaza la capa visual por shadcn/ui
   progresivamente, pantalla por pantalla.
3. **Electron apunta al cliente nuevo al final**, cuando ya sirve tanto en local como en
   red — evita tener, a mitad de camino, dos apps corriendo en paralelo sin integrarse.

## Fuera de alcance de este documento

- Diseño detallado de la API del servidor (rutas, esquema de la base de datos,
  modelo de sesiones) — es un spec hermano, no este.
- Catálogo definitivo de roles y permisos — pendiente en ADR-0008.
- Transporte cifrado (HTTP vs HTTPS en la LAN) — pendiente en ADR-0008.
- Migración de `evidence-log/` — este cliente no implementa bitácora encadenada; solo
  se cuidó que la forma de "corrección de registro" (evento nuevo, no sobrescritura) sea
  compatible con ella cuando exista.

## Riesgo a vigilar

Adoptar Node.js/Express para `server/` es, en la práctica, una señal de dirección para
ADR-0005 (stack de `issuer/`, `verifier/`, etc., todavía abierto) — ver la nota ya
dejada en el PR #11. No se resuelve aquí, pero conviene que la conversación de ADR-0005
lo tenga en cuenta en vez de decidirse en el vacío.
