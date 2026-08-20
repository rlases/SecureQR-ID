# Gestión de Usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario con permiso `admin` pueda crear otros usuarios (personal operativo) desde una pantalla nueva en el cliente, y ver la lista de usuarios existentes — cerrando la brecha de que hoy solo puede existir el admin sembrado.

**Architecture:** Nuevo router `mi-app-qr/server/src/users/routes.ts` (crear + listar), protegido por un middleware `requireAdmin` nuevo que verifica el nivel de permiso (`admin`/`operador`, ADR-0009) contra la sesión, no solo que haya sesión. El servidor genera la contraseña inicial del usuario nuevo (CSPRNG, mismo patrón que ya usa `main.js` para el admin sembrado) y la devuelve **una sola vez** en la respuesta — nunca se puede recuperar después. En el cliente, `UsuariosPage.tsx` (formulario + tabla) y el link de navegación en `Sidebar` solo se muestran si `user.role === 'admin'` — como recordatorio: eso es UX, no seguridad; la autorización real vive en `requireAdmin`.

**Tech Stack:** el mismo de `server/` y `client/` ya establecido — Express, Zod, better-sqlite3, TanStack Query, React Hook Form.

---

## Mapa de archivos

```
mi-app-qr/
├── shared/src/types.ts               ← Modify: CreateUserRequest, CreateUserResponse
└── server/src/
│   ├── auth/requireAdmin.ts          ← Create
│   ├── users/routes.ts               ← Create
│   ├── app.ts                        ← Modify: montar el router de usuarios
│   └── test/users.test.ts            ← Create
└── client/src/
    ├── lib/apiClient.ts               ← Modify: createUser, listUsers
    ├── pages/UsuariosPage.tsx          ← Create
    ├── components/Sidebar.tsx          ← Modify: link condicional a Usuarios
    ├── App.tsx                          ← Modify: ruta /usuarios
    └── test/UsuariosPage.test.tsx        ← Create
```

---

### Task 1: Tipos compartidos

**Files:**
- Modify: `mi-app-qr/shared/src/types.ts`

- [ ] **Step 1: Agregar al final de `mi-app-qr/shared/src/types.ts`**

```typescript
export interface CreateUserRequest {
  username: string;
  role: UserRole;
  cargo?: string;
}

export interface CreateUserResponse {
  user: User;
  // Se devuelve UNA sola vez, generada por el servidor. No se puede recuperar
  // después — no se guarda en texto plano en ningún lado, solo su hash.
  generatedPassword: string;
}

export interface ListUsersResponse {
  users: User[];
}
```

- [ ] **Step 2: Confirmar que el servidor y el cliente siguen compilando** (todavía no usan estos tipos, solo verificamos que la sintaxis es válida)

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm run build && cd ../client && npm run build`
Expected: ambos sin errores

- [ ] **Step 3: Commit**

```bash
cd mi-app-qr
git add shared/src/types.ts
git commit -m "feat(shared): tipos para creación y listado de usuarios"
```

## Context

Task 1 de este plan. `mi-app-qr/shared`, `server` y `client` ya están en `main`, completos (ADR-0009 ya resolvió el modelo de roles: `role` es `'admin' | 'operador'`, fijo; `cargo` es texto libre). Repo root: `c:\Users\rlas\Documents\CODE\RegistroQR`, branch a crear desde `main`.

---

### Task 2: Middleware `requireAdmin`

**Files:**
- Create: `mi-app-qr/server/src/auth/requireAdmin.ts`
- Test: `mi-app-qr/server/test/requireAdmin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/requireAdmin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import { createSessionMiddleware } from '../src/auth/session.js';
import { requireAdmin } from '../src/auth/requireAdmin.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/passwords.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-require-admin.sqlite';
let db: Database.Database;

beforeEach(() => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware('test-secret'));
  app.locals.db = db;

  // Ruta de prueba mínima que solo existe para ejercitar el middleware.
  app.post('/login-como', express.json(), (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  app.get('/solo-admin', requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('requireAdmin', () => {
  it('rechaza con 401 si no hay sesión iniciada', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/solo-admin');
    expect(res.status).toBe(401);
  });

  it('rechaza con 403 si el usuario tiene sesión pero no es admin', async () => {
    const passwordHash = await hashPassword('clave-123');
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('operador1', passwordHash, 'operador');

    const app = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/login-como').send({ userId: result.lastInsertRowid });

    const res = await agent.get('/solo-admin');
    expect(res.status).toBe(403);
  });

  it('deja pasar si el usuario es admin', async () => {
    const passwordHash = await hashPassword('clave-123');
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin1', passwordHash, 'admin');

    const app = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/login-como').send({ userId: result.lastInsertRowid });

    const res = await agent.get('/solo-admin');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- requireAdmin`
Expected: FAIL — el módulo `../src/auth/requireAdmin.js` no existe

- [ ] **Step 3: Implementar `mi-app-qr/server/src/auth/requireAdmin.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

interface UserRoleRow {
  role: string;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'no autenticado' });
    return;
  }

  const db = req.app.locals.db as Database.Database;
  const user = db
    .prepare('SELECT role FROM users WHERE id = ?')
    .get(req.session.userId) as UserRoleRow | undefined;

  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'requiere permiso de administrador' });
    return;
  }

  next();
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- requireAdmin`
Expected: PASS — 3 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test && npm run build`
Expected: todos pasan (30: 27 anteriores + 3 nuevos), build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add server/src/auth/requireAdmin.ts server/test/requireAdmin.test.ts
git commit -m "feat(server): middleware requireAdmin — autorización por nivel de permiso"
```

## Context

Task 2 de este plan. `requireAuth` (ya existente) solo verifica que haya sesión — no distingue `admin` de `operador`. Este middleware nuevo sí lo hace, consultando el rol real en la base de datos (la sesión solo guarda `userId`, no el rol — consultarlo en cada petición evita que un cambio de rol tarde en aplicarse porque quedó cacheado en la sesión). Es el primer punto del código que depende del modelo de roles de ADR-0009.

---

### Task 3: Endpoints de usuarios — crear y listar

**Files:**
- Create: `mi-app-qr/server/src/users/routes.ts`
- Modify: `mi-app-qr/server/src/app.ts`
- Test: `mi-app-qr/server/test/users.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/users.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { verifyPassword } from '../src/auth/passwords.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-users.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;

async function loginAsAdmin(agent: ReturnType<typeof request.agent>) {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });
}

beforeEach(async () => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
  await seedAdminUser(db, { username: 'admin', password: 'clave-correcta-123' });
  app = createApp({ db, sessionSecret: 'test-secret' });
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('POST /api/users', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ username: 'nuevo1', role: 'operador' });
    expect(res.status).toBe(401);
  });

  it('rechaza si el usuario en sesión no es admin', async () => {
    // Flujo completo, sin atajos: se crea el operador de verdad vía la API (como
    // admin), y se usa su contraseña generada real para loguearlo — así el propio
    // ciclo de creación de usuarios queda ejercitado dentro del test de autorización.
    const adminAgent = request.agent(app);
    await loginAsAdmin(adminAgent);

    const createRes = await adminAgent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });
    const { generatedPassword } = createRes.body;

    const operadorAgent = request.agent(app);
    await operadorAgent
      .post('/api/auth/login')
      .send({ username: 'operador1', password: generatedPassword });

    const res = await operadorAgent
      .post('/api/users')
      .send({ username: 'otro-mas', role: 'operador' });

    expect(res.status).toBe(403);
  });

  it('crea un usuario con contraseña generada por el servidor', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    const res = await agent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('operador1');
    expect(res.body.user.role).toBe('operador');
    expect(res.body.user.cargo).toBe('vigilancia');
    expect(typeof res.body.generatedPassword).toBe('string');
    expect(res.body.generatedPassword.length).toBeGreaterThanOrEqual(10);

    const row = db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get('operador1') as { password_hash: string };
    expect(await verifyPassword(res.body.generatedPassword, row.password_hash)).toBe(true);
  });

  it('rechaza un username duplicado con 409, no con un error crudo de SQLite', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    await agent.post('/api/users').send({ username: 'duplicado', role: 'operador' });
    const res = await agent.post('/api/users').send({ username: 'duplicado', role: 'operador' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('rechaza un role inválido', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);

    const res = await agent.post('/api/users').send({ username: 'malrol', role: 'superadmin' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/users', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lista los usuarios sin exponer password_hash', async () => {
    const agent = request.agent(app);
    await loginAsAdmin(agent);
    await agent.post('/api/users').send({ username: 'operador2', role: 'operador' });

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2); // admin sembrado + operador2
    for (const user of res.body.users) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- users`
Expected: FAIL — el módulo `../src/users/routes.js` no existe

- [ ] **Step 3: Implementar `mi-app-qr/server/src/users/routes.ts`**

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import { hashPassword } from '../auth/passwords.js';

const createUserSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['admin', 'operador']),
  cargo: z.string().min(1).optional(),
});

interface UserRow {
  id: number;
  username: string;
  role: string;
  cargo: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    cargo: row.cargo,
    createdAt: row.created_at,
  };
}

function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function createUsersRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.post('/', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de usuario inválidos' });
    }
    const { username, role, cargo } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const generatedPassword = generatePassword();
    const passwordHash = await hashPassword(generatedPassword);

    let result;
    try {
      result = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, cargo) VALUES (?, ?, ?, ?)`
        )
        .run(username, passwordHash, role, cargo ?? null);
    } catch (error) {
      return res.status(409).json({ error: 'ese nombre de usuario ya existe' });
    }

    const row = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(result.lastInsertRowid) as UserRow;

    res.status(201).json({ user: toPublicUser(row), generatedPassword });
  });

  router.get('/', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    const rows = db
      .prepare('SELECT id, username, role, cargo, created_at FROM users ORDER BY created_at DESC')
      .all() as UserRow[];

    res.json({ users: rows.map(toPublicUser) });
  });

  return router;
}
```

- [ ] **Step 4: Montar el router en `mi-app-qr/server/src/app.ts`** — contenido final completo:

```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createRegistrosRouter } from './registros/routes.js';
import { createUsersRouter } from './users/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_PATH = path.resolve(__dirname, '../../client/dist');

export interface AppDependencies {
  db: Database.Database;
  sessionSecret: string;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware(deps.sessionSecret));
  app.locals.db = deps.db;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/registros', createRegistrosRouter());
  app.use('/api/users', createUsersRouter());

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'no encontrado' });
  });

  if (fs.existsSync(CLIENT_DIST_PATH)) {
    app.use(express.static(CLIENT_DIST_PATH));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
    });
  }

  return app;
}
```

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- users`
Expected: PASS — 7 tests pasados

- [ ] **Step 6: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test && npm run build`
Expected: todos pasan (37: 30 anteriores + 7 nuevos), build sin errores

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add server/src/users/routes.ts server/src/app.ts server/test/users.test.ts
git commit -m "feat(server): endpoints de usuarios — crear (admin) y listar"
```

## Context

Task 3 de este plan, depende de la Task 2 (`requireAdmin`). La contraseña la genera el servidor (nunca la elige el admin que crea la cuenta) — mismo patrón de seguridad que ya usa `main.js` para el admin sembrado de Electron (CSPRNG, `crypto.randomBytes`), consistente con `.claude/rules/criptografia.md`. Se devuelve una sola vez en la respuesta del `POST`; después de eso solo existe su hash.

---

### Task 4: Cliente de API — crear y listar usuarios

**Files:**
- Modify: `mi-app-qr/client/src/lib/apiClient.ts`
- Modify: `mi-app-qr/client/test/apiClient.test.ts`

- [ ] **Step 1: Agregar tests al final de `describe('apiClient', ...)` en `mi-app-qr/client/test/apiClient.test.ts`** (antes del cierre del `describe`, junto a los tests existentes):

```typescript
  it('createUser() envía los datos y devuelve el usuario más la contraseña generada', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
        generatedPassword: 'xJ3-generada',
      }),
    });

    const result = await createUser({ username: 'operador1', role: 'operador', cargo: 'vigilancia' });

    expect(result.user.username).toBe('operador1');
    expect(result.generatedPassword).toBe('xJ3-generada');
  });

  it('listUsers() devuelve la lista de usuarios', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    });

    const result = await listUsers();

    expect(result.users).toEqual([]);
  });
```

Y agrega `createUser, listUsers` al import existente de `'../src/lib/apiClient'` al inicio del archivo.

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- apiClient`
Expected: FAIL — `createUser`/`listUsers` no están exportados por `apiClient.ts`

- [ ] **Step 3: Agregar al final de `mi-app-qr/client/src/lib/apiClient.ts`**

```typescript
export function createUser(
  data: CreateUserRequest
): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listUsers(): Promise<ListUsersResponse> {
  return request<ListUsersResponse>('/api/users');
}
```

Y agrega `CreateUserRequest, CreateUserResponse, ListUsersResponse` al import existente de `'@mi-app-qr/shared'` al inicio del archivo.

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- apiClient`
Expected: PASS — 8 tests pasados (6 anteriores + 2 nuevos)

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/lib/apiClient.ts client/test/apiClient.test.ts
git commit -m "feat(client): apiClient — createUser y listUsers"
```

## Context

Task 4 de este plan, depende de la Task 3 (endpoints reales ya existen) y de la Task 1 (tipos compartidos). Mismo patrón exacto que `createRegistro`/`listRegistros` ya establecido en `apiClient.ts` — nada nuevo conceptualmente, solo dos funciones más sobre el mismo `request<T>()` helper.

---

### Task 5: `UsuariosPage`

**Files:**
- Create: `mi-app-qr/client/src/pages/UsuariosPage.tsx`
- Test: `mi-app-qr/client/test/UsuariosPage.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/UsuariosPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsuariosPage from '../src/pages/UsuariosPage';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsuariosPage />
    </QueryClientProvider>
  );
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista los usuarios existentes', async () => {
    vi.mocked(apiClient.listUsers).mockResolvedValue({
      users: [
        { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
      ],
    });

    renderPage();

    expect(await screen.findByText('admin')).toBeInTheDocument();
  });

  it('crea un usuario y muestra la contraseña generada una sola vez', async () => {
    vi.mocked(apiClient.listUsers)
      .mockResolvedValueOnce({ users: [{ id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' }] })
      .mockResolvedValueOnce({
        users: [
          { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
          { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-02' },
        ],
      });
    vi.mocked(apiClient.createUser).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-02' },
      generatedPassword: 'xJ3-generada-de-prueba',
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/usuario/i), 'operador1');
    await userEvent.type(screen.getByLabelText(/cargo/i), 'vigilancia');
    await userEvent.selectOptions(screen.getByLabelText(/permiso/i), 'operador');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() =>
      expect(apiClient.createUser).toHaveBeenCalledWith({
        username: 'operador1',
        role: 'operador',
        cargo: 'vigilancia',
      })
    );

    expect(await screen.findByText(/xJ3-generada-de-prueba/)).toBeInTheDocument();
    expect(await screen.findByText('operador1')).toBeInTheDocument();
  });

  it('muestra un error de validación si el usuario está vacío', async () => {
    vi.mocked(apiClient.listUsers).mockResolvedValue({ users: [] });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /crear usuario/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
    expect(apiClient.createUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- UsuariosPage`
Expected: FAIL — el módulo `../src/pages/UsuariosPage` no existe

- [ ] **Step 3: Implementar `mi-app-qr/client/src/pages/UsuariosPage.tsx`**

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, listUsers } from '../lib/apiClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const createUserSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio'),
  cargo: z.string().min(1, 'El cargo es obligatorio'),
  role: z.enum(['admin', 'operador']),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const [lastCreatedPassword, setLastCreatedPassword] = useState<{ username: string; password: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setLastCreatedPassword({ username: result.user.username, password: result.generatedPassword });
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'operador' },
  });

  function onSubmit(values: CreateUserFormValues) {
    mutation.mutate(values);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo usuario</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" {...register('username')} />
            {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" {...register('cargo')} placeholder="ej. vigilancia" />
            {errors.cargo && <p className="text-sm text-destructive">{errors.cargo.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Permiso</Label>
            <select
              id="role"
              {...register('role')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Crear usuario
          </Button>
        </form>

        {lastCreatedPassword && (
          <div className="mt-4 rounded-md border border-primary bg-secondary p-4">
            <p className="text-sm text-foreground">
              Usuario <strong>{lastCreatedPassword.username}</strong> creado. Contraseña generada
              (cópiala ahora — no se volverá a mostrar):
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">{lastCreatedPassword.password}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Usuarios</h2>
        {isLoading && <p className="text-muted-foreground">Cargando...</p>}
        {!isLoading && data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 font-medium">Usuario</th>
                <th className="py-2 font-medium">Cargo</th>
                <th className="py-2 font-medium">Permiso</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{user.username}</td>
                  <td className="py-2 text-foreground">{user.cargo ?? '—'}</td>
                  <td className="py-2 text-muted-foreground">{user.role}</td>
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

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- UsuariosPage`
Expected: PASS — 3 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/pages/UsuariosPage.tsx client/test/UsuariosPage.test.tsx
git commit -m "feat(client): UsuariosPage — crear y listar, contraseña generada visible una vez"
```

## Context

Task 5 de este plan, depende de la Task 4. Reutiliza el mismo patrón visual y de formulario que `RegistrosPage` (ya aprobado: react-hook-form + zod + shadcn/ui). La contraseña generada se muestra en un banner simple después de crear — no en un modal ni con auto-copiado al portapapeles (fuera de alcance, YAGNI para esta primera versión).

---

### Task 6: Navegación condicional a Usuarios (solo `admin`)

**Files:**
- Modify: `mi-app-qr/client/src/components/Sidebar.tsx`
- Modify: `mi-app-qr/client/src/App.tsx`
- Test: `mi-app-qr/client/test/Sidebar.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/Sidebar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../src/components/Sidebar';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('NO muestra el link a Usuarios si el usuario es operador', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('operador1')).toBeInTheDocument());
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  it('muestra el link a Usuarios si el usuario es admin', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- Sidebar`
Expected: FAIL — hoy `Sidebar` no tiene ningún texto "Usuarios" en ningún caso (ambos tests fallan, cada uno por una razón distinta — léelos con cuidado)

- [ ] **Step 3: Reemplazar `mi-app-qr/client/src/components/Sidebar.tsx`**

```typescript
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-border bg-background p-6">
      <div>
        <h1 className="mb-8 text-lg font-semibold text-foreground">Registro QR</h1>
        <nav className="space-y-1">
          <Link
            to="/"
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              location.pathname === '/' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
            }`}
          >
            Registros
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/usuarios"
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                location.pathname === '/usuarios' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
              }`}
            >
              Usuarios
            </Link>
          )}
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

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- Sidebar`
Expected: PASS — 2 tests pasados

- [ ] **Step 5: Agregar la ruta `/usuarios` en `mi-app-qr/client/src/App.tsx`** — contenido final completo:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { Sidebar } from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import RegistrosPage from './pages/RegistrosPage';
import UsuariosPage from './pages/UsuariosPage';

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">{children}</main>
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
                  <AppLayout>
                    <RegistrosPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireAuth>
                  <AppLayout>
                    <UsuariosPage />
                  </AppLayout>
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

**Nota de seguridad, no la pases por alto:** `/usuarios` queda protegida por `RequireAuth` (exige sesión), **no** por un chequeo de `role === 'admin'` en el cliente. Un operador que navegue manualmente a `/usuarios` vería la pantalla (aunque no el link en el Sidebar) — pero el `GET /api/users` y el `POST /api/users` reales exigen `requireAdmin` en el servidor (Task 2), así que un operador vería la pantalla vacía/con error, nunca datos ni podría crear usuarios. Esto es consistente con la regla ya establecida en `CONTRIBUTING.md`/`THREAT-MODEL.md`: la autorización real vive en el servidor. Si quieres además ocultar la ruta del lado del cliente (mejor UX, no más seguridad), es una mejora legítima para una tarea futura — no la agregues aquí sin que se pida explícitamente, para no exceder el alcance de esta tarea.

- [ ] **Step 6: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add client/src/components/Sidebar.tsx client/src/App.tsx client/test/Sidebar.test.tsx
git commit -m "feat(client): mostrar Usuarios en el Sidebar solo para admin, agregar la ruta"
```

## Context

Task 6 (última) de este plan, depende de las Tasks 3 y 5. Cierra el ciclo: servidor con autorización real (`requireAdmin`), cliente con la pantalla (`UsuariosPage`) y con la navegación condicionada por UX (no por seguridad, eso ya está en el servidor).

---

## Fuera de alcance de este plan

- Desactivar o eliminar usuarios — solo crear y listar, mismo alcance mínimo que tuvo `RegistrosPage` en su primera versión.
- Cambiar la contraseña de un usuario existente, o que un usuario cambie la suya propia.
- Editar `cargo`/`role` de un usuario ya creado.
- Ocultar la ruta `/usuarios` del lado del cliente para operadores (hoy solo se oculta el link del Sidebar; la ruta sigue montada, protegida solo por `RequireAuth` + la autorización real del servidor — ver nota de seguridad en la Task 6).
- Verificación manual end-to-end contra el servidor real corriendo — dado que el patrón (TDD + mocks + build limpio) ya se verificó exhaustivamente en los planes anteriores para exactamente este mismo tipo de flujo (crear + listar, con sesión), no se repite aquí como tarea aparte. Si al fusionar esto se quiere esa verificación, es razonable pedirla como paso manual antes de dar por cerrado el issue #12, no como parte de este plan.
