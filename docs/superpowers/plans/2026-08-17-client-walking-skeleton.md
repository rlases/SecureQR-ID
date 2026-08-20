# Cliente web — walking skeleton (`mi-app-qr/client`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir, dentro de `mi-app-qr/client/`, un cliente Vite + React + TypeScript funcional de punta a punta contra el servidor ya construido (`mi-app-qr/server/`): login real, sesión persistida, y una pantalla de registros (crear + listar) protegida — con el estilo visual y el stack de componentes ya validados en `docs/superpowers/specs/2026-08-15-cliente-web-multiusuario-design.md`.

**Architecture:** Paquete Vite/TypeScript nuevo y autocontenido en `mi-app-qr/client/`, con `@mi-app-qr/shared` como dependencia (mismos tipos que ya usa `server/`). Corre standalone durante desarrollo (`vite dev`, con proxy a la API en `localhost:4000`) — no toca la app Electron/CRA existente en `mi-app-qr/src/` ni el servidor ya aprobado. Dashboard, Informes, Usuarios y la integración con Electron quedan fuera de este plan (ver "Fuera de alcance").

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix + CLI), TanStack Query, React Hook Form + Zod, React Router, Vitest + React Testing Library.

---

## Mapa de archivos

```
mi-app-qr/client/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json          ← config de shadcn/ui (aliases, estilo, color base)
├── .gitignore
├── index.html
├── test/
│   └── setup.ts               ← jest-dom matchers para Vitest
└── src/
    ├── main.tsx                ← entry point: monta React, providers (Query, Router)
    ├── App.tsx                  ← define las rutas (/login, / protegida)
    ├── index.css                 ← Tailwind + variables de tema (índigo, claro)
    ├── lib/
    │   ├── utils.ts               ← cn() — helper estándar de shadcn
    │   └── apiClient.ts            ← fetch tipado contra la API (usa @mi-app-qr/shared)
    ├── auth/
    │   ├── AuthContext.tsx          ← estado de sesión (usuario actual, login, logout)
    │   └── RequireAuth.tsx           ← wrapper de ruta protegida
    ├── components/
    │   ├── ui/                        ← generados por shadcn CLI (button, input, label, toast)
    │   └── Sidebar.tsx                 ← navegación lateral (estilo aprobado: claro, índigo)
    └── pages/
        ├── LoginPage.tsx
        └── RegistrosPage.tsx
```

**Por qué esta división:** `lib/apiClient.ts` centraliza todas las llamadas HTTP — es lo único que los tests de páginas necesitan mockear, en vez de interceptar `fetch` directamente. `AuthContext` separa "quién soy" del resto de la app, así `RequireAuth` y `Sidebar` no duplican lógica de sesión. `components/ui/` es código generado (shadcn), no se edita a mano salvo necesidad real — se trata como vendored code.

---

### Task 1: Scaffold de Vite + React + TypeScript

**Files:**
- Create: `mi-app-qr/client/package.json`
- Create: `mi-app-qr/client/tsconfig.json`
- Create: `mi-app-qr/client/tsconfig.node.json`
- Create: `mi-app-qr/client/vite.config.ts`
- Create: `mi-app-qr/client/.gitignore`
- Create: `mi-app-qr/client/index.html`
- Create: `mi-app-qr/client/src/main.tsx`
- Create: `mi-app-qr/client/src/App.tsx`
- Create: `mi-app-qr/client/src/index.css`

- [ ] **Step 1: Crear `mi-app-qr/client/package.json`**

```json
{
  "name": "@mi-app-qr/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mi-app-qr/shared": "file:../shared",
    "@tanstack/react-query": "^5.51.23",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.427.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.52.2",
    "react-router-dom": "^6.26.0",
    "tailwind-merge": "^2.5.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Crear `mi-app-qr/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Crear `mi-app-qr/client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

**Nota:** `"composite": true` es obligatorio aquí porque `tsconfig.json` referencia este archivo vía `"references"` — sin él, `tsc -b` falla con `TS6306`. `"allowImportingTsExtensions": true` en `tsconfig.json` (arriba) es necesario porque `main.tsx` importa `./App.tsx` con la extensión explícita — sin él, falla con `TS5097`.

- [ ] **Step 4: Crear `mi-app-qr/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: Crear `mi-app-qr/client/.gitignore`**

```
node_modules/
dist/
.env
!.env.example
```

- [ ] **Step 6: Crear `mi-app-qr/client/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Registro QR</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Crear `mi-app-qr/client/src/index.css`** (placeholder mínimo — Task 2 lo reemplaza con Tailwind)

```css
body {
  margin: 0;
  font-family: 'Inter', sans-serif;
}
```

- [ ] **Step 8: Crear `mi-app-qr/client/src/App.tsx`** (placeholder mínimo — Task 5 lo reemplaza con rutas reales)

```typescript
function App() {
  return <div>Registro QR — cliente en construcción</div>;
}

export default App;
```

- [ ] **Step 9: Crear `mi-app-qr/client/src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 10: Instalar dependencias**

Run (Windows, Node gestionado por nvm en este equipo — ver nota de entorno del plan de servidor si aplica en tu máquina): `cd mi-app-qr/client && npm install`
Expected: `node_modules/` y `package-lock.json` generados sin errores.

- [ ] **Step 11: Verificar que arranca**

Run: `cd mi-app-qr/client && npm run dev &` luego `curl -s http://localhost:5173 | grep -o '<title>[^<]*</title>'`, después detener el proceso.
Expected: `<title>Registro QR</title>`

- [ ] **Step 12: Commit**

```bash
cd mi-app-qr
git add client/package.json client/package-lock.json client/tsconfig.json client/tsconfig.node.json client/vite.config.ts client/.gitignore client/index.html client/src/main.tsx client/src/App.tsx client/src/index.css
git commit -m "feat(client): scaffold de Vite + React + TypeScript"
```

---

### Task 2: Tailwind CSS + tema claro/índigo

**Files:**
- Create: `mi-app-qr/client/tailwind.config.ts`
- Create: `mi-app-qr/client/postcss.config.js`
- Modify: `mi-app-qr/client/src/index.css`

- [ ] **Step 1: Crear `mi-app-qr/client/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Crear `mi-app-qr/client/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Reemplazar `mi-app-qr/client/src/index.css`** — Tailwind + variables del tema claro/índigo (aprobado en el brainstorming visual):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 243 75% 59%;
    --primary: 243 75% 59%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 222 47% 11%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --muted: 220 14% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 220 14% 96%;
    --accent-foreground: 222 47% 11%;
    --radius: 0.5rem;
  }

  body {
    @apply bg-background text-foreground font-sans;
    margin: 0;
  }
}
```

**Nota:** `--primary` en `243 75% 59%` es el equivalente HSL de `indigo-600` de Tailwind — el acento validado en el brainstorming visual. No cambiar por otro tono sin volver a esa decisión.

- [ ] **Step 4: Confirmar que Tailwind compila**

Run: `cd mi-app-qr/client && npm run build`
Expected: build exitoso (puede haber warnings de TypeScript sobre `App.tsx` placeholder si `noUnusedLocals` estuviera activo — no lo está en este `tsconfig.json`, así que no debería fallar).

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add client/tailwind.config.ts client/postcss.config.js client/src/index.css
git commit -m "feat(client): Tailwind CSS con tema claro e índigo"
```

---

### Task 3: shadcn/ui — configuración y componentes base

**Files:**
- Create: `mi-app-qr/client/components.json`
- Create: `mi-app-qr/client/src/lib/utils.ts`
- Create (vía CLI): `mi-app-qr/client/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `toast.tsx`, `toaster.tsx`, `use-toast.ts`

- [ ] **Step 1: Crear `mi-app-qr/client/src/lib/utils.ts`** — el helper `cn()` estándar de shadcn:

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Crear `mi-app-qr/client/components.json`** — configuración de shadcn/ui (evita el wizard interactivo):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 3: Generar los componentes base con el CLI de shadcn**

Run (desde `mi-app-qr/client`): `npx shadcn@latest add button input label toast --yes`

Expected: crea `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `toast.tsx`, `toaster.tsx`, `use-toast.ts` (y posiblemente `hooks/use-toast.ts` según la versión del CLI — verifica dónde los puso). También puede instalar dependencias nuevas (`@radix-ui/react-label`, `@radix-ui/react-toast`, `@radix-ui/react-slot`) — si lo hace, confirma que `package.json`/`package-lock.json` quedaron actualizados.

**No agregues `form` a esta lista.** Las páginas de este plan (`LoginPage`, `RegistrosPage`) usan `register()` de React Hook Form directo sobre `Input`, no los wrappers `FormField`/`FormItem` que genera el componente `form` de shadcn — agregarlo generaría código sin usar. Si una tarea futura adopta ese patrón, se agrega entonces, con su propio uso real.

Si el comando pide confirmación interactiva a pesar de `--yes`, o falla, **no lo fuerces con más flags al azar** — reporta BLOCKED con el error exacto.

- [ ] **Step 4: Verificar que el build sigue compilando**

Run: `cd mi-app-qr/client && npm run build`
Expected: sin errores. Si hay errores de tipos en los componentes generados por el CLI, no los "arregles" reescribiéndolos — son código generado; reporta BLOCKED con el error exacto para decidir versión del CLI o de React.

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add client/components.json client/src/lib/utils.ts client/src/components/ui/ client/package.json client/package-lock.json
git commit -m "feat(client): configuración de shadcn/ui y componentes base (button, input, label, toast)"
```

---

### Task 4: Cliente de API tipado

**Files:**
- Create: `mi-app-qr/client/src/lib/apiClient.ts`
- Test: `mi-app-qr/client/test/apiClient.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/apiClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, getMe, logout, createRegistro, listRegistros, ApiError } from '../src/lib/apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login() envía credenciales y devuelve el usuario', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' } }),
    });

    const result = await login({ username: 'admin', password: 'x' });

    expect(result.user.username).toBe('admin');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username: 'admin', password: 'x' }),
      })
    );
  });

  it('login() lanza ApiError con el mensaje del servidor si falla', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'usuario o contraseña incorrectos' }),
    });

    await expect(login({ username: 'admin', password: 'mal' })).rejects.toThrow(ApiError);
    await expect(login({ username: 'admin', password: 'mal' })).rejects.toThrow(
      'usuario o contraseña incorrectos'
    );
  });

  it('getMe() consulta /api/auth/me con credenciales incluidas', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' } }),
    });

    await getMe();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('logout() hace POST a /api/auth/logout', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await logout();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('createRegistro() envía el registro y devuelve el creado', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        registro: { id: 1, nombre: 'Ana Ríos', documento: '123', rol: 'estudiante', tipo: 'entrada', timestamp: '2026-01-01', creadoPorUsuarioId: 1 },
      }),
    });

    const result = await createRegistro({ nombre: 'Ana Ríos', documento: '123', rol: 'estudiante', tipo: 'entrada' });

    expect(result.registro.nombre).toBe('Ana Ríos');
  });

  it('listRegistros() devuelve la lista', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ registros: [] }),
    });

    const result = await listRegistros();

    expect(result.registros).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/client && npm test -- apiClient`
Expected: FAIL — `Cannot find module '../src/lib/apiClient'` (o similar, el archivo no existe)

- [ ] **Step 3: Implementar `mi-app-qr/client/src/lib/apiClient.ts`**

```typescript
import type {
  LoginRequest,
  LoginResponse,
  CreateRegistroRequest,
  Registro,
  User,
} from '@mi-app-qr/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body.error ?? 'Error desconocido', res.status);
  }

  return body as T;
}

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function getMe(): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me');
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function createRegistro(
  data: CreateRegistroRequest
): Promise<{ registro: Registro }> {
  return request<{ registro: Registro }>('/api/registros', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listRegistros(): Promise<{ registros: Registro[] }> {
  return request<{ registros: Registro[] }>('/api/registros');
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/client && npm test -- apiClient`
Expected: PASS — 6 tests pasados

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add client/src/lib/apiClient.ts client/test/apiClient.test.ts
git commit -m "feat(client): cliente de API tipado contra el servidor"
```

## Context para Task 4

Este es el primer test del paquete `client/` — Vitest todavía no está configurado con entorno `jsdom` ni con Testing Library. **Esta tarea (Task 4) usa `vi.fn()` sobre `global.fetch`, que no requiere DOM**, así que puede correr con la configuración por defecto de Vitest. Task 5 configura `vitest.config.ts` con `environment: 'jsdom'` y `test/setup.ts` para los tests de componentes React que sí lo necesitan — sin eso, `apiClient.test.ts` de esta tarea seguiría pasando igual (no usa DOM), pero los tests de páginas de tareas posteriores fallarían por falta de entorno. No adelantes esa configuración aquí; es responsabilidad de Task 5.

---

### Task 5: Configuración de Vitest + Testing Library (entorno jsdom)

**Files:**
- Create: `mi-app-qr/client/vitest.config.ts`
- Create: `mi-app-qr/client/test/setup.ts`

- [ ] **Step 1: Crear `mi-app-qr/client/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: false,
  },
});
```

- [ ] **Step 2: Crear `mi-app-qr/client/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Confirmar que los tests existentes (Task 4) siguen pasando bajo la nueva configuración**

Run: `cd mi-app-qr/client && npm test`
Expected: PASS — los 6 tests de `apiClient.test.ts` siguen pasando (correr bajo `jsdom` no debería afectar tests que no tocan el DOM).

- [ ] **Step 4: Commit**

```bash
cd mi-app-qr
git add client/vitest.config.ts client/test/setup.ts
git commit -m "feat(client): configurar Vitest con jsdom y Testing Library"
```

---

### Task 6: `AuthContext` — estado de sesión

**Files:**
- Create: `mi-app-qr/client/src/auth/AuthContext.tsx`
- Test: `mi-app-qr/client/test/AuthContext.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/AuthContext.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function TestConsumer() {
  const { user, isLoading, login, logout } = useAuth();

  if (isLoading) return <p>Cargando...</p>;

  return (
    <div>
      <p>{user ? `Sesión: ${user.username}` : 'Sin sesión'}</p>
      <button onClick={() => login({ username: 'admin', password: 'x' })}>Entrar</button>
      <button onClick={() => logout()}>Salir</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('empieza sin sesión si /api/auth/me devuelve 401', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());
  });

  it('carga el usuario si ya hay sesión activa', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());
  });

  it('login() actualiza el usuario tras autenticar', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));
    vi.mocked(apiClient.login).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());
  });

  it('logout() limpia el usuario', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.logout).mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Sesión: admin')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Salir'));

    await waitFor(() => expect(screen.getByText('Sin sesión')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/client && npm test -- AuthContext`
Expected: FAIL — `Cannot find module '../src/auth/AuthContext'`

- [ ] **Step 3: Implementar `mi-app-qr/client/src/auth/AuthContext.tsx`**

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginRequest, User } from '@mi-app-qr/shared';
import * as apiClient from '../lib/apiClient';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(credentials: LoginRequest) {
    const res = await apiClient.login(credentials);
    setUser(res.user);
  }

  async function logout() {
    await apiClient.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/client && npm test -- AuthContext`
Expected: PASS — 4 tests pasados

- [ ] **Step 5: Correr toda la suite**

Run: `cd mi-app-qr/client && npm test`
Expected: PASS — todos los tests del paquete pasan

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/auth/AuthContext.tsx client/test/AuthContext.test.tsx
git commit -m "feat(client): AuthContext con estado de sesión"
```

---

### Task 7: `LoginPage`

**Files:**
- Create: `mi-app-qr/client/src/pages/LoginPage.tsx`
- Test: `mi-app-qr/client/test/LoginPage.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../src/pages/LoginPage';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));
  });

  it('muestra el formulario de inicio de sesión', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
    });
  });

  it('muestra un error de validación si se envía vacío', async () => {
    renderLoginPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
    expect(apiClient.login).not.toHaveBeenCalled();
  });

  it('envía las credenciales y llama a login() con valores correctos', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'clave-correcta-123');
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() =>
      expect(apiClient.login).toHaveBeenCalledWith({ username: 'admin', password: 'clave-correcta-123' })
    );
  });

  it('muestra el error del servidor si las credenciales son incorrectas', async () => {
    vi.mocked(apiClient.login).mockRejectedValue(new apiClient.ApiError('usuario o contraseña incorrectos', 401));

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'mal');
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText(/usuario o contraseña incorrectos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/client && npm test -- LoginPage`
Expected: FAIL — `Cannot find module '../src/pages/LoginPage'`

- [ ] **Step 3: Implementar `mi-app-qr/client/src/pages/LoginPage.tsx`**

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      await login(values);
      navigate('/');
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError('No se pudo conectar con el servidor');
      }
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-8"
      >
        <h1 className="text-xl font-semibold text-foreground">Registro QR</h1>

        <div className="space-y-2">
          <Label htmlFor="username">Usuario</Label>
          <Input id="username" autoComplete="username" {...register('username')} />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Iniciar sesión
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Instalar `@hookform/resolvers`** (conecta Zod con React Hook Form; no estaba en la lista de dependencias de Task 1 porque no se necesitaba hasta ahora)

Run: `cd mi-app-qr/client && npm install @hookform/resolvers@^3.9.0`

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/client && npm test -- LoginPage`
Expected: PASS — 4 tests pasados

- [ ] **Step 6: Correr toda la suite y el build**

Run: `cd mi-app-qr/client && npm test && npm run build`
Expected: todos los tests pasan, build sin errores

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add client/src/pages/LoginPage.tsx client/test/LoginPage.test.tsx client/package.json client/package-lock.json
git commit -m "feat(client): LoginPage con validación y manejo de error del servidor"
```

---

### Task 8: `RequireAuth` + layout con `Sidebar` + rutas en `App.tsx`

**Files:**
- Create: `mi-app-qr/client/src/auth/RequireAuth.tsx`
- Create: `mi-app-qr/client/src/components/Sidebar.tsx`
- Modify: `mi-app-qr/client/src/App.tsx`
- Test: `mi-app-qr/client/test/RequireAuth.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/RequireAuth.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from '../src/auth/RequireAuth';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderWithRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Página de login</p>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <p>Contenido protegido</p>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirige a /login si no hay sesión', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new apiClient.ApiError('no autenticado', 401));

    renderWithRoute('/');

    await waitFor(() => expect(screen.getByText('Página de login')).toBeInTheDocument());
  });

  it('muestra el contenido protegido si hay sesión', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'administrativo', createdAt: '2026-01-01' },
    });

    renderWithRoute('/');

    await waitFor(() => expect(screen.getByText('Contenido protegido')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/client && npm test -- RequireAuth`
Expected: FAIL — `Cannot find module '../src/auth/RequireAuth'`

- [ ] **Step 3: Implementar `mi-app-qr/client/src/auth/RequireAuth.tsx`**

```typescript
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Implementar `mi-app-qr/client/src/components/Sidebar.tsx`**

```typescript
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-border bg-background p-6">
      <div>
        <h1 className="mb-8 text-lg font-semibold text-foreground">Registro QR</h1>
        <nav className="space-y-1">
          <div className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
            Registros
          </div>
        </nav>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{user?.username}</p>
        <Button variant="outline" className="w-full" onClick={() => logout()}>
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Reemplazar `mi-app-qr/client/src/App.tsx`** con las rutas reales:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { Sidebar } from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import RegistrosPage from './pages/RegistrosPage';

const queryClient = new QueryClient();

function AppLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <RegistrosPage />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

**Nota:** `App.tsx` importa `RegistrosPage`, que todavía no existe — se crea en la Task 9. Esto es intencional y significa que el build fallará hasta que se complete esa tarea. Si estás ejecutando este plan tarea por tarea, es normal ver el build roto entre el final de esta tarea y el commit de la Task 9; no es un error tuyo. Si por alguna razón necesitas que el build pase en un estado intermedio, crea un `RegistrosPage.tsx` mínimo (`export default function RegistrosPage() { return null; }`) como parte de esta tarea y dilo explícitamente en tu reporte — no lo hagas en silencio.

- [ ] **Step 6: Correr los tests de esta tarea**

Run: `cd mi-app-qr/client && npm test -- RequireAuth`
Expected: PASS — 2 tests pasados. (El build completo del paquete SÍ fallará por el import de `RegistrosPage` — eso se espera, ver nota del Step 5. No lo reportes como fallo tuyo, pero sí confírmalo explícitamente.)

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add client/src/auth/RequireAuth.tsx client/src/components/Sidebar.tsx client/src/App.tsx client/test/RequireAuth.test.tsx
git commit -m "feat(client): RequireAuth, Sidebar y rutas protegidas"
```

---

### Task 9: `RegistrosPage` — crear y listar registros

**Files:**
- Create: `mi-app-qr/client/src/pages/RegistrosPage.tsx`
- Test: `mi-app-qr/client/test/RegistrosPage.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/RegistrosPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegistrosPage from '../src/pages/RegistrosPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrosPage />
    </QueryClientProvider>
  );
}

describe('RegistrosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista los registros existentes', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        { id: 1, nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', creadoPorUsuarioId: 1 },
      ],
    });

    renderPage();

    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay registros', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();

    expect(await screen.findByText(/sin registros/i)).toBeInTheDocument();
  });

  it('crea un registro nuevo y refresca la lista', async () => {
    vi.mocked(apiClient.listRegistros)
      .mockResolvedValueOnce({ registros: [] })
      .mockResolvedValueOnce({
        registros: [
          { id: 1, nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada', timestamp: '2026-01-01 10:05:00', creadoPorUsuarioId: 1 },
        ],
      });
    vi.mocked(apiClient.createRegistro).mockResolvedValue({
      registro: { id: 1, nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada', timestamp: '2026-01-01 10:05:00', creadoPorUsuarioId: 1 },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText(/sin registros/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/nombre/i), 'Luis Gómez');
    await userEvent.type(screen.getByLabelText(/documento/i), '2');
    await userEvent.type(screen.getByLabelText(/rol/i), 'docente');
    await userEvent.click(screen.getByRole('button', { name: /registrar entrada/i }));

    await waitFor(() =>
      expect(apiClient.createRegistro).toHaveBeenCalledWith({
        nombre: 'Luis Gómez',
        documento: '2',
        rol: 'docente',
        tipo: 'entrada',
      })
    );
    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument();
  });

  it('muestra un error de validación si el formulario está incompleto', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({ registros: [] });

    renderPage();
    await waitFor(() => expect(screen.getByText(/sin registros/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /registrar entrada/i }));

    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
    expect(apiClient.createRegistro).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/client && npm test -- RegistrosPage`
Expected: FAIL — `Cannot find module '../src/pages/RegistrosPage'` (o el placeholder mínimo de la Task 8, si se creó, no tiene el contenido esperado)

- [ ] **Step 3: Implementar `mi-app-qr/client/src/pages/RegistrosPage.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRegistro, listRegistros } from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const registroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
});

type RegistroFormValues = z.infer<typeof registroSchema>;

export default function RegistrosPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });

  const mutation = useMutation({
    mutationFn: createRegistro,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistroFormValues>({ resolver: zodResolver(registroSchema) });

  function onSubmit(values: RegistroFormValues) {
    mutation.mutate({ ...values, tipo: 'entrada' });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo registro</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" {...register('nombre')} />
            {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="documento">Documento</Label>
            <Input id="documento" {...register('documento')} />
            {errors.documento && <p className="text-sm text-destructive">{errors.documento.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rol">Rol</Label>
            <Input id="rol" {...register('rol')} />
            {errors.rol && <p className="text-sm text-destructive">{errors.rol.message}</p>}
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Registrar entrada
          </Button>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Registros recientes</h2>
        {isLoading && <p className="text-muted-foreground">Cargando...</p>}
        {!isLoading && data?.registros.length === 0 && (
          <p className="text-muted-foreground">Sin registros todavía.</p>
        )}
        {!isLoading && data && data.registros.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Nombre</th>
                <th className="py-2 font-medium">Rol</th>
                <th className="py-2 font-medium">Tipo</th>
                <th className="py-2 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {data.registros.map((registro) => (
                <tr key={registro.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{registro.nombre}</td>
                  <td className="py-2 text-foreground">{registro.rol}</td>
                  <td className="py-2 text-foreground">{registro.tipo}</td>
                  <td className="py-2 text-muted-foreground">{registro.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/client && npm test -- RegistrosPage`
Expected: PASS — 4 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `cd mi-app-qr/client && npm test && npm run build`
Expected: todos los tests pasan, build exitoso (el import roto de la Task 8 queda resuelto)

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/pages/RegistrosPage.tsx client/test/RegistrosPage.test.tsx
git commit -m "feat(client): RegistrosPage — crear y listar con refetch periódico"
```

---

### Task 10: Verificación manual end-to-end contra el servidor real

**Files:** ninguno (solo verificación — no se esperan cambios de código en esta tarea salvo que encuentres un defecto real)

- [ ] **Step 1: Levantar el servidor**

En una terminal, desde `mi-app-qr/server`:
```bash
cp .env.example .env
npm run build
npm run dev &
```
Espera a ver `Servidor escuchando en el puerto 4000`.

- [ ] **Step 2: Levantar el cliente**

En otra terminal (o en segundo plano), desde `mi-app-qr/client`:
```bash
npm run dev &
```
Espera a ver que Vite reporta el servidor listo en el puerto 5173.

- [ ] **Step 3: Verificar el flujo completo con `curl` (sustituto de una prueba manual en navegador, para un entorno sin interfaz gráfica)**

```bash
curl -s http://localhost:5173/api/health
```
Expected: `{"status":"ok"}` — esto confirma que el proxy de Vite (`/api` → `localhost:4000`) funciona.

```bash
curl -i -c cookies.txt -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"cambia-esto-en-el-primer-inicio-de-sesion"}'
```
Expected: `200 OK`, cuerpo con `"user":{"username":"admin",...}`, cookie `sqrid.sid` guardada en `cookies.txt`.

```bash
curl -s -b cookies.txt -X POST http://localhost:5173/api/registros \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Verificación E2E","documento":"999","rol":"estudiante","tipo":"entrada"}'
```
Expected: `201`, cuerpo con el registro creado.

```bash
curl -s -b cookies.txt http://localhost:5173/api/registros
```
Expected: `200`, incluye el registro "Verificación E2E" recién creado.

- [ ] **Step 4: Si tienes acceso a un navegador, verificación visual adicional (opcional pero recomendada)**

Abre `http://localhost:5173` — debe redirigir a `/login`. Inicia sesión con `admin` / la contraseña de `SEED_ADMIN_PASSWORD` en `.env`. Debes ver el layout con sidebar, el formulario de "Nuevo registro" y la tabla de "Registros recientes". Crea un registro desde el formulario y confirma que aparece en la tabla sin recargar la página.

- [ ] **Step 5: Detener ambos procesos y limpiar**

```bash
rm -f cookies.txt
```
Detén los procesos de `npm run dev` de cliente y servidor (ambos corren en segundo plano).

- [ ] **Step 6: Si todo funcionó, no hay commit en esta tarea** (es solo verificación). Si encontraste y arreglaste un defecto real, commitéalo por separado con un mensaje que describa el fix, y repite la verificación completa antes de reportar DONE.

## Context para Task 10

Esta es la primera vez que cliente y servidor corren juntos de verdad — todas las tareas anteriores probaron cada lado por separado con mocks. Es deliberadamente la última tarea del plan: si algo en el contrato entre `apiClient.ts` y las rutas reales de `mi-app-qr/server` no encaja (nombres de campos, códigos de estado, forma del cuerpo de la respuesta), es aquí donde debe aparecer — con las herramientas que ya construimos, no adivinando.

---

## Fuera de alcance de este plan

- `DashboardView`, `Informes`, `Usuarios` — pantallas adicionales, cada una merece su propio ciclo TDD.
- Migración de los componentes de dominio existentes (`EditRecordModal`, `ExportCsvModal`, `ForgottenOutModal`, `qrParser.js`) — la lógica de negocio se reutiliza más adelante, no en este walking skeleton.
- Integración con Electron (`main.js` apuntando al cliente nuevo) — explícitamente el último paso del plan de migración en la spec; requiere que el servidor sirva el build estático del cliente, lo cual tampoco está en este plan.
- WebSockets — el polling de 7s en `RegistrosPage` es la solución elegida por ahora (ver spec, sección "Datos y comunicación con el servidor").
- Manejo de errores de red globales tipo toast — el componente `Toast`/`Toaster` de shadcn ya se generó en la Task 3 pero no se conectó a nada; conectarlo es trabajo de una tarea futura, no de este plan.
