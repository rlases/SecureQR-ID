# Fundación del servidor (`mi-app-qr/server`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir, dentro de `mi-app-qr/server/`, una API Express + SQLite + TypeScript independiente y probada — con autenticación de sesión y un endpoint mínimo de registros — que el cliente Vite (plan aparte) pueda consumir.

**Architecture:** Paquete Node/TypeScript nuevo y autocontenido en `mi-app-qr/server/`, con tipos compartidos en `mi-app-qr/shared/`. No toca ni depende del código Electron/CRA existente en `mi-app-qr/` — la app actual sigue funcionando exactamente igual durante todo este plan. La integración con Electron y el cliente nuevo es un plan posterior.

**Tech Stack:** Node.js 20+, TypeScript, Express 4, better-sqlite3, bcryptjs, express-session, zod, Vitest + Supertest.

---

## Mapa de archivos

```
mi-app-qr/
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts          ← User, Session, Registro, request/response DTOs
│       └── index.ts           ← re-exporta types.ts
└── server/
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── .env.example
    ├── .gitignore
    ├── README.md
    └── src/
        ├── db/
        │   ├── connection.ts      ← abre/crea el archivo SQLite
        │   ├── migrate.ts          ← crea tablas si no existen
        │   └── seed.ts              ← siembra el usuario admin inicial
        ├── auth/
        │   ├── passwords.ts         ← hash/verify con bcryptjs
        │   ├── session.ts            ← config de express-session
        │   └── routes.ts              ← POST /login, GET /me, POST /logout
        ├── registros/
        │   └── routes.ts              ← POST /api/registros, GET /api/registros
        ├── app.ts                    ← crea y configura la app Express (sin escuchar puerto)
        └── index.ts                   ← punto de entrada: escucha el puerto
    └── test/
        ├── health.test.ts
        ├── auth.test.ts
        └── registros.test.ts
```

**Por qué esta división:** `app.ts` separado de `index.ts` es lo que permite que Supertest levante la app en memoria sin abrir un puerto real — más rápido y sin choques de puerto entre tests en paralelo. `shared/` existe desde ya aunque hoy solo lo consuma `server/`, porque el cliente (plan siguiente) lo necesitará sin duplicar tipos.

---

### Task 1: Paquete `shared/` con los tipos compartidos

**Files:**
- Create: `mi-app-qr/shared/package.json`
- Create: `mi-app-qr/shared/tsconfig.json`
- Create: `mi-app-qr/shared/src/types.ts`
- Create: `mi-app-qr/shared/src/index.ts`

- [ ] **Step 1: Crear `mi-app-qr/shared/package.json`**

```json
{
  "name": "@mi-app-qr/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

- [ ] **Step 2: Crear `mi-app-qr/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Escribir los tipos en `mi-app-qr/shared/src/types.ts`**

```typescript
export type UserRole = 'vigilancia' | 'administrativo' | 'docente';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}

export interface Registro {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
  timestamp: string;
  creadoPorUsuarioId: number;
}

export interface CreateRegistroRequest {
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
}

export interface ApiErrorResponse {
  error: string;
}
```

- [ ] **Step 4: Crear `mi-app-qr/shared/src/index.ts`**

```typescript
export * from './types.js';
```

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add shared/
git commit -m "feat(shared): agregar tipos TypeScript compartidos entre server y client"
```

---

### Task 2: Scaffold de `server/` — dependencias y configuración

**Files:**
- Create: `mi-app-qr/server/package.json`
- Create: `mi-app-qr/server/tsconfig.json`
- Create: `mi-app-qr/server/vitest.config.ts`
- Create: `mi-app-qr/server/.gitignore`
- Create: `mi-app-qr/server/.env.example`

- [ ] **Step 1: Crear `mi-app-qr/server/package.json`**

```json
{
  "name": "@mi-app-qr/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mi-app-qr/shared": "file:../shared",
    "better-sqlite3": "^11.3.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Crear `mi-app-qr/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `mi-app-qr/server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Crear `mi-app-qr/server/.gitignore`**

```
node_modules/
dist/
data/
.env
!.env.example
```

- [ ] **Step 5: Crear `mi-app-qr/server/.env.example`**

```
PORT=4000
SESSION_SECRET=reemplaza-esto-por-un-valor-aleatorio-largo
DB_PATH=./data/app.db
```

- [ ] **Step 6: Instalar dependencias**

Run: `cd mi-app-qr/server && npm install`
Expected: se crea `node_modules/` y `package-lock.json` sin errores.

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts server/.gitignore server/.env.example
git commit -m "feat(server): scaffold del paquete Express + TypeScript"
```

---

### Task 3: Endpoint de salud (`GET /api/health`) — primer ciclo TDD

**Files:**
- Create: `mi-app-qr/server/src/app.ts`
- Create: `mi-app-qr/server/src/index.ts`
- Test: `mi-app-qr/server/test/health.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('responde 200 con status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- health`
Expected: FAIL — `Cannot find module '../src/app.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/app.ts`**

```typescript
import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
```

- [ ] **Step 4: Implementar `mi-app-qr/server/src/index.ts`**

```typescript
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
```

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/server && npm test -- health`
Expected: PASS — 1 test pasado

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add server/src/app.ts server/src/index.ts server/test/health.test.ts
git commit -m "feat(server): endpoint de salud GET /api/health"
```

---

### Task 4: Conexión SQLite y migraciones

**Files:**
- Create: `mi-app-qr/server/src/db/connection.ts`
- Create: `mi-app-qr/server/src/db/migrate.ts`
- Test: `mi-app-qr/server/test/db.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/db.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

const TEST_DB_PATH = './data/test-db.sqlite';

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('migraciones', () => {
  it('crea las tablas users y registros', () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain('users');
    expect(tables).toContain('registros');
    db.close();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- db`
Expected: FAIL — `Cannot find module '../src/db/connection.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/db/connection.ts`**

```typescript
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
```

- [ ] **Step 4: Implementar `mi-app-qr/server/src/db/migrate.ts`**

```typescript
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      documento TEXT NOT NULL,
      rol TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      creado_por_usuario_id INTEGER NOT NULL,
      FOREIGN KEY (creado_por_usuario_id) REFERENCES users(id)
    );
  `);
}
```

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/server && npm test -- db`
Expected: PASS — 1 test pasado

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add server/src/db/connection.ts server/src/db/migrate.ts server/test/db.test.ts
git commit -m "feat(server): conexión SQLite y migraciones de users/registros"
```

---

### Task 5: Hashing y verificación de contraseñas

**Files:**
- Create: `mi-app-qr/server/src/auth/passwords.ts`
- Test: `mi-app-qr/server/test/passwords.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/passwords.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';

describe('passwords', () => {
  it('verifica correctamente una contraseña contra su hash', async () => {
    const hash = await hashPassword('correcto-caballo-batería-grapadora');
    expect(await verifyPassword('correcto-caballo-batería-grapadora', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('correcto-caballo-batería-grapadora');
    expect(await verifyPassword('otra-cosa', hash)).toBe(false);
  });

  it('nunca guarda la contraseña en texto plano dentro del hash', async () => {
    const hash = await hashPassword('mi-secreto');
    expect(hash).not.toContain('mi-secreto');
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- passwords`
Expected: FAIL — `Cannot find module '../src/auth/passwords.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/auth/passwords.ts`**

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/server && npm test -- passwords`
Expected: PASS — 3 tests pasados

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add server/src/auth/passwords.ts server/test/passwords.test.ts
git commit -m "feat(server): hashing y verificación de contraseñas con bcryptjs"
```

---

### Task 6: Siembra del usuario administrador inicial

**Files:**
- Create: `mi-app-qr/server/src/db/seed.ts`
- Test: `mi-app-qr/server/test/seed.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/seed.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import { verifyPassword } from '../src/auth/passwords.js';

const TEST_DB_PATH = './data/test-seed.sqlite';

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('seedAdminUser', () => {
  it('crea un usuario admin si no existe ninguno', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);

    await seedAdminUser(db, { username: 'admin', password: 'cambia-esto-ya' });

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get('admin') as { password_hash: string; role: string } | undefined;

    expect(user).toBeDefined();
    expect(user!.role).toBe('administrativo');
    expect(await verifyPassword('cambia-esto-ya', user!.password_hash)).toBe(true);
    db.close();
  });

  it('no duplica el admin si ya existe', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);

    await seedAdminUser(db, { username: 'admin', password: 'primera' });
    await seedAdminUser(db, { username: 'admin', password: 'segunda' });

    const count = db
      .prepare('SELECT COUNT(*) as c FROM users WHERE username = ?')
      .get('admin') as { c: number };

    expect(count.c).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- seed`
Expected: FAIL — `Cannot find module '../src/db/seed.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/db/seed.ts`**

```typescript
import type Database from 'better-sqlite3';
import { hashPassword } from '../auth/passwords.js';

interface SeedAdminOptions {
  username: string;
  password: string;
}

export async function seedAdminUser(
  db: Database.Database,
  options: SeedAdminOptions
): Promise<void> {
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(options.username);

  if (existing) return;

  const passwordHash = await hashPassword(options.password);

  db.prepare(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`
  ).run(options.username, passwordHash, 'administrativo');
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd mi-app-qr/server && npm test -- seed`
Expected: PASS — 2 tests pasados

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add server/src/db/seed.ts server/test/seed.test.ts
git commit -m "feat(server): siembra idempotente del usuario administrador inicial"
```

---

### Task 7: Sesión de Express y middleware de base de datos

**Files:**
- Create: `mi-app-qr/server/src/auth/session.ts`
- Modify: `mi-app-qr/server/src/app.ts`
- Modify: `mi-app-qr/server/src/index.ts`

- [ ] **Step 1: Implementar `mi-app-qr/server/src/auth/session.ts`**

```typescript
import session, { type SessionOptions } from 'express-session';

export function createSessionMiddleware(secret: string) {
  const options: SessionOptions = {
    secret,
    name: 'sqrid.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  };
  return session(options);
}
```

- [ ] **Step 2: Modificar `mi-app-qr/server/src/app.ts` para aceptar la base de datos y el secreto de sesión**

Reemplaza el contenido completo de `mi-app-qr/server/src/app.ts` por:

```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { createSessionMiddleware } from './auth/session.js';

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

  return app;
}
```

- [ ] **Step 3: Actualizar `mi-app-qr/server/test/health.test.ts` para pasar las dependencias nuevas**

```typescript
// mi-app-qr/server/test/health.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

const TEST_DB_PATH = './data/test-health.sqlite';

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('GET /api/health', () => {
  it('responde 200 con status ok', async () => {
    const db = openDatabase(TEST_DB_PATH);
    runMigrations(db);
    const app = createApp({ db, sessionSecret: 'test-secret' });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    db.close();
  });
});
```

- [ ] **Step 4: Actualizar `mi-app-qr/server/src/index.ts` para que siga compilando con la firma nueva de `createApp`**

`createApp` ahora exige `db` y `sessionSecret`. Reemplaza el contenido completo de
`mi-app-qr/server/src/index.ts` por esta versión mínima (Task 10 la reemplaza por la
versión final con configuración de entorno; esto solo evita dejar el build roto
mientras tanto):

```typescript
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';

const PORT = Number(process.env.PORT ?? 4000);
const db = openDatabase('./data/app.db');
runMigrations(db);

const app = createApp({ db, sessionSecret: 'secreto-interino-hasta-task-10' });
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
```

- [ ] **Step 5: Correr todos los tests y confirmar que pasan**

Run: `cd mi-app-qr/server && npm test`
Expected: PASS — todos los tests existentes (health, db, passwords, seed) pasan

- [ ] **Step 6: Confirmar que el paquete compila**

Run: `cd mi-app-qr/server && npm run build`
Expected: termina sin errores de TypeScript (genera `dist/`)

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add server/src/app.ts server/src/auth/session.ts server/src/index.ts server/test/health.test.ts
git commit -m "feat(server): middleware de sesión y app configurable con dependencias"
```

---

### Task 8: Endpoints de autenticación (`/api/auth/login`, `/me`, `/logout`)

**Files:**
- Create: `mi-app-qr/server/src/auth/routes.ts`
- Modify: `mi-app-qr/server/src/app.ts`
- Test: `mi-app-qr/server/test/auth.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-auth.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;

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

describe('POST /api/auth/login', () => {
  it('acepta credenciales válidas y devuelve el usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('administrativo');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rechaza una contraseña incorrecta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rechaza un usuario que no existe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nadie', password: 'lo-que-sea' });

    expect(res.status).toBe(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos consecutivos', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'incorrecta' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/bloqueada/i);
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve 401 sin sesión iniciada', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('devuelve el usuario actual con sesión válida', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
  });
});

describe('POST /api/auth/logout', () => {
  it('cierra la sesión y /me vuelve a devolver 401', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    await agent.post('/api/auth/logout').expect(200);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- auth`
Expected: FAIL — `Cannot find module '../src/auth/routes.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/auth/routes.ts`**

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { verifyPassword } from './passwords.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'usuario y contraseña son obligatorios' });
    }
    const { username, password } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;

    if (!user) {
      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'cuenta bloqueada temporalmente por intentos fallidos' });
    }

    const validPassword = await verifyPassword(password, user.password_hash);

    if (!validPassword) {
      const attempts = user.failed_attempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
          : null;

      db.prepare(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'
      ).run(attempts, lockedUntil, user.id);

      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
    ).run(user.id);

    req.session.userId = user.id;
    res.json({ user: toPublicUser(user) });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'no autenticado' });
    }
    const db = req.app.locals.db as Database.Database;
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(req.session.userId) as UserRow | undefined;

    if (!user) {
      return res.status(401).json({ error: 'no autenticado' });
    }
    res.json({ user: toPublicUser(user) });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  return router;
}
```

- [ ] **Step 4: Montar el router en `mi-app-qr/server/src/app.ts`**

Agrega el import y el `app.use` en `mi-app-qr/server/src/app.ts`:

```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';

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

  return app;
}
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `cd mi-app-qr/server && npm test -- auth`
Expected: PASS — 7 tests pasados (3 de login, 2 de /me, 1 de logout, 1 de bloqueo)

- [ ] **Step 6: Correr toda la suite**

Run: `cd mi-app-qr/server && npm test`
Expected: PASS — todos los tests del paquete pasan

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add server/src/auth/routes.ts server/src/app.ts server/test/auth.test.ts
git commit -m "feat(server): login/me/logout con bloqueo tras 5 intentos fallidos"
```

---

### Task 9: Middleware `requireAuth` y endpoints de registros

**Files:**
- Create: `mi-app-qr/server/src/auth/requireAuth.ts`
- Create: `mi-app-qr/server/src/registros/routes.ts`
- Modify: `mi-app-qr/server/src/app.ts`
- Test: `mi-app-qr/server/test/registros.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/registros.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedAdminUser } from '../src/db/seed.js';
import type Database from 'better-sqlite3';

const TEST_DB_PATH = './data/test-registros.sqlite';
let db: Database.Database;
let app: ReturnType<typeof createApp>;

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

describe('POST /api/registros', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1234567890', rol: 'estudiante', tipo: 'entrada' });

    expect(res.status).toBe(401);
  });

  it('crea un registro con sesión válida', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1234567890', rol: 'estudiante', tipo: 'entrada' });

    expect(res.status).toBe(201);
    expect(res.body.registro.nombre).toBe('Ana Ríos');
    expect(res.body.registro.id).toBeDefined();
  });

  it('rechaza un cuerpo inválido', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent.post('/api/registros').send({ nombre: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/registros', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app).get('/api/registros');
    expect(res.status).toBe(401);
  });

  it('devuelve los registros creados, más reciente primero', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'clave-correcta-123' });

    await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    await agent
      .post('/api/registros')
      .send({ nombre: 'Luis Gómez', documento: '2', rol: 'docente', tipo: 'entrada' });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(2);
    expect(res.body.registros[0].nombre).toBe('Luis Gómez');
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd mi-app-qr/server && npm test -- registros`
Expected: FAIL — `Cannot find module '../src/registros/routes.js'`

- [ ] **Step 3: Implementar `mi-app-qr/server/src/auth/requireAuth.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'no autenticado' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Implementar `mi-app-qr/server/src/registros/routes.ts`**

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';

const createRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
});

interface RegistroRow {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: string;
  timestamp: string;
  creado_por_usuario_id: number;
}

function toPublicRegistro(row: RegistroRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    documento: row.documento,
    rol: row.rol,
    tipo: row.tipo,
    timestamp: row.timestamp,
    creadoPorUsuarioId: row.creado_por_usuario_id,
  };
}

export function createRegistrosRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const parsed = createRegistroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de registro inválidos' });
    }
    const { nombre, documento, rol, tipo } = parsed.data;
    const db = req.app.locals.db as Database.Database;

    const result = db
      .prepare(
        `INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(nombre, documento, rol, tipo, req.session.userId);

    const row = db
      .prepare('SELECT * FROM registros WHERE id = ?')
      .get(result.lastInsertRowid) as RegistroRow;

    res.status(201).json({ registro: toPublicRegistro(row) });
  });

  router.get('/', (req, res) => {
    const db = req.app.locals.db as Database.Database;
    const rows = db
      .prepare('SELECT * FROM registros ORDER BY timestamp DESC')
      .all() as RegistroRow[];

    res.json({ registros: rows.map(toPublicRegistro) });
  });

  return router;
}
```

- [ ] **Step 5: Montar el router en `mi-app-qr/server/src/app.ts`**

```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createRegistrosRouter } from './registros/routes.js';

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

  return app;
}
```

- [ ] **Step 6: Correr los tests y confirmar que pasan**

Run: `cd mi-app-qr/server && npm test -- registros`
Expected: PASS — 5 tests pasados

- [ ] **Step 7: Correr toda la suite del paquete**

Run: `cd mi-app-qr/server && npm test`
Expected: PASS — todos los tests pasan (health, db, passwords, seed, auth, registros)

- [ ] **Step 8: Commit**

```bash
cd mi-app-qr
git add server/src/auth/requireAuth.ts server/src/registros/routes.ts server/src/app.ts server/test/registros.test.ts
git commit -m "feat(server): endpoints de registros protegidos con requireAuth"
```

---

### Task 10: Punto de entrada real (`index.ts`) con configuración desde entorno

**Files:**
- Modify: `mi-app-qr/server/src/index.ts`
- Create: `mi-app-qr/server/README.md`

- [ ] **Step 1: Reescribir `mi-app-qr/server/src/index.ts`**

```typescript
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedAdminUser } from './db/seed.js';

async function main(): Promise<void> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error(
      'SESSION_SECRET no está definido. Copia .env.example a .env y ponle un valor real.'
    );
  }

  const dbPath = process.env.DB_PATH ?? './data/app.db';
  const port = Number(process.env.PORT ?? 4000);

  const db = openDatabase(dbPath);
  runMigrations(db);

  const seedUsername = process.env.SEED_ADMIN_USERNAME;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (seedUsername && seedPassword) {
    await seedAdminUser(db, { username: seedUsername, password: seedPassword });
  }

  const app = createApp({ db, sessionSecret });
  app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
  });
}

main().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Actualizar `mi-app-qr/server/.env.example` con las variables del admin semilla**

```
PORT=4000
SESSION_SECRET=reemplaza-esto-por-un-valor-aleatorio-largo
DB_PATH=./data/app.db
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=cambia-esto-en-el-primer-inicio-de-sesion
```

- [ ] **Step 3: Escribir `mi-app-qr/server/README.md`**

```markdown
# `mi-app-qr/server`

API Express + SQLite + TypeScript para el cliente multiusuario de `mi-app-qr`
(ver `docs/DECISIONS.md` ADR-0008 y `docs/superpowers/specs/2026-08-15-cliente-web-multiusuario-design.md`).

## Ejecutar en desarrollo

\`\`\`bash
cp .env.example .env   # y edita SESSION_SECRET con un valor real
npm install
npm run dev
\`\`\`

El servidor queda escuchando en `http://localhost:4000` (o el `PORT` que definas).

## Pruebas

\`\`\`bash
npm test
\`\`\`

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | No | Confirma que el servidor está vivo |
| POST | `/api/auth/login` | No | `{ username, password }` → cookie de sesión + usuario |
| GET | `/api/auth/me` | Sí | Usuario de la sesión actual |
| POST | `/api/auth/logout` | Sí | Cierra la sesión |
| POST | `/api/registros` | Sí | Crea un registro de entrada/salida |
| GET | `/api/registros` | Sí | Lista los registros, más reciente primero |

## Notas de seguridad

- Las contraseñas se hashean con bcryptjs (12 rounds) — nunca en texto plano.
- Una cuenta se bloquea 15 minutos tras 5 intentos fallidos consecutivos.
- `SESSION_SECRET` es obligatorio; el servidor no arranca sin él (falla cerrado).
- La autorización se verifica siempre en el servidor (`requireAuth`), nunca solo en el cliente.
```

- [ ] **Step 4: Verificar que el build de TypeScript compila sin errores**

Run: `cd mi-app-qr/server && npm run build`
Expected: se genera `dist/` sin errores de tipos

- [ ] **Step 5: Commit**

```bash
cd mi-app-qr
git add server/src/index.ts server/.env.example server/README.md
git commit -m "feat(server): punto de entrada configurable por entorno y README"
```

---

### Task 11: CI para el paquete `server/`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Agregar el job nuevo a `.github/workflows/ci.yml`**

Añade este job junto al job `test` existente (no lo reemplaces):

```yaml
  server-test:
    name: mi-app-qr/server — tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mi-app-qr/server
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: mi-app-qr/server/package-lock.json

      - run: npm install
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Verificar el YAML resultante**

Run: `cat .github/workflows/ci.yml`
Expected: dos jobs bajo `jobs:` — `test` (cliente CRA existente) y `server-test` (nuevo)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: agregar pruebas de mi-app-qr/server al workflow"
```

---

### Task 12: Actualizar la documentación del proyecto

**Files:**
- Modify: `CONTRIBUTING.md`
- Modify: `docs/STATE.md`

- [ ] **Step 1: Actualizar la sección "Pruebas" de `CONTRIBUTING.md`**

Busca el bullet que dice:

```
- **Los módulos del modelo criptográfico** (`issuer/`, `verifier/`, `evidence-log/`,
  `anchor/`, `revocation/`) todavía no tienen framework de pruebas definido porque
  depende del stack (ADR-0005, issue #2). Cuando se resuelva, este documento se
  actualiza con el comando exacto y se añade su job correspondiente al workflow de CI.
```

Y agrega, justo antes, un bullet nuevo:

```
- **`mi-app-qr/server`** usa Vitest + Supertest (`npm test` dentro de `mi-app-qr/server`).
  El flujo de CI lo ejecuta en cada PR que toque esa carpeta.
```

- [ ] **Step 2: Agregar entrada en `docs/STATE.md`**

Agrega al final de la sección "Hecho" de `docs/STATE.md`:

```
- **`mi-app-qr/server`**: fundación del servidor multiusuario (ADR-0008) — Express +
  TypeScript + SQLite, autenticación con sesión, bloqueo tras intentos fallidos, y
  endpoints de registros protegidos. Probado con Vitest + Supertest, sin conectar
  todavía al cliente ni a Electron — eso es el siguiente plan
  (`docs/superpowers/plans/`).
```

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md docs/STATE.md
git commit -m "docs: reflejar la fundación del servidor en CONTRIBUTING y STATE"
```

---

## Fuera de alcance de este plan

- Conectar Electron a este servidor (plan posterior).
- El cliente Vite/React que lo consume (plan posterior: `2026-08-15-client-multiusuario.md`).
- Gestión de usuarios (crear/editar/desactivar personal) — hoy solo existe el admin semilla.
- Migración de los datos reales de `localStorage`.
- HTTPS/transporte cifrado — pendiente de decidir en ADR-0008 antes de exponer esto en una red real.
