# Corrección de Registros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un `admin` pueda corregir un registro mal capturado (nombre, documento, rol, tipo o la hora) sin sobrescribirlo — la corrección se guarda como fila nueva con autor y motivo, consistente con la invariante append-only de ADR-0008, y la vista de registros solo muestra la versión vigente de cada uno.

**Architecture:** Se agregan dos columnas nulables (`corrige_registro_id`, `motivo`) a la tabla `registros` ya existente — no hay tabla nueva. Un endpoint nuevo, `POST /api/registros/:id/correcciones`, protegido por el `requireAdmin` que ya existe (`mi-app-qr/server/src/auth/requireAdmin.ts`), inserta la fila de corrección; `GET /api/registros` cambia su filtro para excluir cualquier fila que ya haya sido corregida. En el cliente, un componente nuevo `CorregirRegistroModal` (controlado por props, sin lógica de red propia) se integra en `RegistrosPage` con un botón "Corregir" por fila, visible solo si `user.role === 'admin'` — UX, no autorización real.

**Tech Stack:** el mismo ya establecido — Express, Zod, better-sqlite3, Vitest + Supertest en el servidor; React, TanStack Query, react-hook-form + zod, shadcn/ui, Testing Library en el cliente.

---

## Mapa de archivos

```
mi-app-qr/
├── shared/src/types.ts                        ← Modify: Registro, CorregirRegistroRequest
└── server/src/
│   ├── db/migrate.ts                          ← Modify: columnas nuevas + CHECK
│   ├── registros/routes.ts                    ← Modify: nuevo endpoint, GET cambia el filtro
│   └── test/
│       ├── db.test.ts                          ← Modify: test del CHECK nuevo
│       └── registros.test.ts                   ← Modify: tests del endpoint y del filtro
└── client/src/
    ├── lib/apiClient.ts                        ← Modify: correctRegistro
    ├── components/CorregirRegistroModal.tsx     ← Create
    ├── pages/RegistrosPage.tsx                  ← Modify: botón Corregir, integra el modal
    └── test/
        ├── apiClient.test.ts                    ← Modify: test de correctRegistro
        ├── CorregirRegistroModal.test.tsx        ← Create
        └── RegistrosPage.test.tsx                ← Modify: envuelve en AuthProvider, tests nuevos
```

---

### Task 1: Esquema — columnas nuevas en `registros`

**Files:**
- Modify: `mi-app-qr/server/src/db/migrate.ts`
- Test: `mi-app-qr/server/test/db.test.ts`

- [ ] **Step 1: Escribir el test que falla, al final de `describe('migraciones', ...)` en `mi-app-qr/server/test/db.test.ts`**

```typescript
  it('fuerza el CHECK entre corrige_registro_id y motivo', () => {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);
    const insertRegistro = db.prepare(`
      INSERT INTO registros (nombre, documento, rol, tipo, creado_por_usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const userResult = insertUser.run('user1', 'hash1', 'admin');
    const userId = userResult.lastInsertRowid as number;
    const original = insertRegistro.run('Juan', '123456', 'estudiante', 'entrada', userId);
    const originalId = original.lastInsertRowid as number;

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, corrige_registro_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, originalId);
    }).toThrow();

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, motivo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, 'typo en el nombre');
    }).toThrow();

    expect(() => {
      db.prepare(`
        INSERT INTO registros
          (nombre, documento, rol, tipo, creado_por_usuario_id, corrige_registro_id, motivo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('Juan Pérez', '123456', 'estudiante', 'entrada', userId, originalId, 'typo en el nombre');
    }).not.toThrow();
  });
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- db`
Expected: FAIL — las columnas `corrige_registro_id`/`motivo` no existen todavía, las dos primeras aserciones fallan porque el `INSERT` da error por columna inexistente en vez de por el `CHECK`, o la tercera falla porque no hay tabla que las acepte.

- [ ] **Step 3: Modificar `mi-app-qr/server/src/db/migrate.ts`** — reemplaza la sentencia `CREATE TABLE IF NOT EXISTS registros` completa:

```typescript
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operador')),
      cargo TEXT,
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
      corrige_registro_id INTEGER REFERENCES registros(id),
      motivo TEXT,
      FOREIGN KEY (creado_por_usuario_id) REFERENCES users(id),
      CHECK (
        (corrige_registro_id IS NULL AND motivo IS NULL) OR
        (corrige_registro_id IS NOT NULL AND motivo IS NOT NULL)
      )
    );
  `);
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- db`
Expected: PASS

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add server/src/db/migrate.ts server/test/db.test.ts
git commit -m "feat(server): esquema de correccion de registros - corrige_registro_id + motivo"
```

## Context

Task 1 de este plan. Mismo patrón que ya se usó para agregar `role`/`cargo` a `users` en ADR-0009: se reescribe la sentencia `CREATE TABLE IF NOT EXISTS` completa — no hay sistema de migraciones incrementales en este proyecto, es un prototipo de investigación (ver spec, sección "Modelo de datos"). El `CHECK` ata las dos columnas nuevas entre sí: un registro original tiene ambas en `NULL`, una corrección tiene ambas presentes — nunca una sola.

---

### Task 2: Tipos compartidos

**Files:**
- Modify: `mi-app-qr/shared/src/types.ts`

- [ ] **Step 1: Reemplazar la interfaz `Registro` existente y agregar `CorregirRegistroRequest`**

```typescript
export interface Registro {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
  timestamp: string;
  creadoPorUsuarioId: number;
  // NULL en un registro original. En una corrección, apunta a la fila que
  // reemplaza (el original o una corrección previa, si se encadena).
  corrigeRegistroId: number | null;
  // NULL en un registro original. Obligatorio en una corrección: por qué se
  // corrigió (ADR-0008, invariante append-only — nunca se sobrescribe).
  motivo: string | null;
}
```

Y agrega, junto a `CreateRegistroRequest`:

```typescript
export interface CorregirRegistroRequest {
  nombre: string;
  documento: string;
  rol: string;
  tipo: 'entrada' | 'salida';
  timestamp: string;
  motivo: string;
}
```

- [ ] **Step 2: Confirmar que el servidor y el cliente siguen compilando**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm run build && cd ../client && npm run build`
Expected: ambos sin errores. (Los archivos de test del cliente no se type-checkean en `npm run build` — `tsconfig.json` solo incluye `src`, así que los objetos `Registro` de prueba que todavía no tienen `corrigeRegistroId`/`motivo` no rompen nada; se actualizan igual en la Task 6 cuando se tocan esos archivos por otra razón.)

- [ ] **Step 3: Commit**

```bash
cd mi-app-qr
git add shared/src/types.ts
git commit -m "feat(shared): tipos para correccion de registros"
```

## Context

Task 2 de este plan, depende de la Task 1 (el esquema ya tiene las columnas). `Registro` gana dos campos obligatorios pero nulables — mismo patrón que `User.cargo: string | null` en ADR-0009, no opcionales (`?:`), para que sea explícito en cada sitio que los consume que el valor puede ser `null` pero siempre está presente.

---

### Task 3: Endpoint de corrección + filtro de `GET /api/registros`

**Files:**
- Modify: `mi-app-qr/server/src/registros/routes.ts`
- Modify: `mi-app-qr/server/test/registros.test.ts`

- [ ] **Step 1: Agregar los tests que fallan, al final de `mi-app-qr/server/test/registros.test.ts`** (después del `describe('GET /api/registros', ...)` existente, dentro del mismo archivo)

Primero, dos tests nuevos **dentro** del `describe('GET /api/registros', ...)` ya existente (agrégalos después del test `'devuelve los registros creados, más reciente primero'`, antes del `});` que cierra ese describe):

```typescript
  it('después de corregir, ya no incluye la fila original, solo la corrección', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba la tilde',
      });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(1);
    expect(res.body.registros[0].nombre).toBe('Ana Ríos');
  });

  it('una cadena de dos correcciones muestra solo la más reciente', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const primeraCorreccion = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'tilde',
      });
    const primeraCorreccionId = primeraCorreccion.body.registro.id;

    await agent
      .post(`/api/registros/${primeraCorreccionId}/correcciones`)
      .send({
        nombre: 'Ana Ríos Gómez',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'apellido',
      });

    const res = await agent.get('/api/registros');
    expect(res.status).toBe(200);
    expect(res.body.registros).toHaveLength(1);
    expect(res.body.registros[0].nombre).toBe('Ana Ríos Gómez');
  });
```

Después, un `describe` nuevo al final del archivo, con todo el bloque de autorización y reglas de negocio del endpoint:

```typescript
describe('POST /api/registros/:id/correcciones', () => {
  it('rechaza la petición sin sesión iniciada', async () => {
    const res = await request(app)
      .post('/api/registros/1/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(401);
  });

  it('rechaza si el usuario en sesión no es admin', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await adminAgent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const createOperadorRes = await adminAgent
      .post('/api/users')
      .send({ username: 'operador1', role: 'operador' });
    const { generatedPassword } = createOperadorRes.body;

    const operadorAgent = request.agent(app);
    await operadorAgent
      .post('/api/auth/login')
      .send({ username: 'operador1', password: generatedPassword });

    const res = await operadorAgent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'x',
      });

    expect(res.status).toBe(403);
  });

  it('rechaza un id no numérico con 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros/abc/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(400);
  });

  it('rechaza un cuerpo inválido con 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Ríos', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const res = await agent.post(`/api/registros/${registroId}/correcciones`).send({ nombre: '' });
    expect(res.status).toBe(400);
  });

  it('rechaza un id inexistente con 404', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const res = await agent
      .post('/api/registros/9999/correcciones')
      .send({ nombre: 'x', documento: '1', rol: 'x', tipo: 'entrada', timestamp: '2026-01-01 10:00:00', motivo: 'x' });

    expect(res.status).toBe(404);
  });

  it('corrige un registro y lo marca con corrigeRegistroId y motivo', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const res = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'faltaba la tilde en el nombre',
      });

    expect(res.status).toBe(201);
    expect(res.body.registro.nombre).toBe('Ana Ríos');
    expect(res.body.registro.corrigeRegistroId).toBe(registroId);
    expect(res.body.registro.motivo).toBe('faltaba la tilde en el nombre');
  });

  it('rechaza corregir un registro que ya tiene una corrección más reciente, con 409', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'primera corrección',
      });

    const res = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos G.',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'segunda corrección sobre el original',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('permite corregir una corrección ya hecha (encadenar)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'clave-correcta-123' });

    const createRes = await agent
      .post('/api/registros')
      .send({ nombre: 'Ana Rios', documento: '1', rol: 'estudiante', tipo: 'entrada' });
    const registroId = createRes.body.registro.id;

    const primeraCorreccion = await agent
      .post(`/api/registros/${registroId}/correcciones`)
      .send({
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'primera corrección',
      });
    const primeraCorreccionId = primeraCorreccion.body.registro.id;

    const res = await agent
      .post(`/api/registros/${primeraCorreccionId}/correcciones`)
      .send({
        nombre: 'Ana Ríos Gómez',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        motivo: 'segunda corrección, apellido',
      });

    expect(res.status).toBe(201);
    expect(res.body.registro.corrigeRegistroId).toBe(primeraCorreccionId);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- registros`
Expected: FAIL — la ruta `POST /:id/correcciones` no existe (404 genérico en vez de los códigos esperados), y los dos tests nuevos de `GET` fallan porque el filtro todavía no excluye nada.

- [ ] **Step 3: Reemplazar `mi-app-qr/server/src/registros/routes.ts`** — contenido final completo:

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireAdmin } from '../auth/requireAdmin.js';

const createRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
});

const corregirRegistroSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  rol: z.string().min(1),
  tipo: z.enum(['entrada', 'salida']),
  timestamp: z.string().min(1),
  motivo: z.string().min(1),
});

interface RegistroRow {
  id: number;
  nombre: string;
  documento: string;
  rol: string;
  tipo: string;
  timestamp: string;
  creado_por_usuario_id: number;
  corrige_registro_id: number | null;
  motivo: string | null;
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
    corrigeRegistroId: row.corrige_registro_id,
    motivo: row.motivo,
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
      .prepare(
        `SELECT * FROM registros
         WHERE id NOT IN (
           SELECT corrige_registro_id FROM registros WHERE corrige_registro_id IS NOT NULL
         )
         ORDER BY timestamp DESC, id DESC`
      )
      .all() as RegistroRow[];

    res.json({ registros: rows.map(toPublicRegistro) });
  });

  router.post('/:id/correcciones', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id de registro inválido' });
    }

    const parsed = corregirRegistroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'datos de corrección inválidos' });
    }

    const db = req.app.locals.db as Database.Database;

    const original = db.prepare('SELECT id FROM registros WHERE id = ?').get(id);
    if (!original) {
      return res.status(404).json({ error: 'registro no encontrado' });
    }

    const yaCorregido = db
      .prepare('SELECT id FROM registros WHERE corrige_registro_id = ?')
      .get(id);
    if (yaCorregido) {
      return res.status(409).json({
        error: 'este registro ya tiene una corrección más reciente; corrige esa en su lugar',
      });
    }

    const { nombre, documento, rol, tipo, timestamp, motivo } = parsed.data;
    const result = db
      .prepare(
        `INSERT INTO registros
           (nombre, documento, rol, tipo, timestamp, creado_por_usuario_id, corrige_registro_id, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nombre, documento, rol, tipo, timestamp, req.session.userId, id, motivo);

    const row = db
      .prepare('SELECT * FROM registros WHERE id = ?')
      .get(result.lastInsertRowid) as RegistroRow;

    res.status(201).json({ registro: toPublicRegistro(row) });
  });

  return router;
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- registros`
Expected: PASS

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add server/src/registros/routes.ts server/test/registros.test.ts
git commit -m "feat(server): endpoint de correccion de registros y filtro de vigentes en GET"
```

## Context

Task 3 de este plan, depende de las Tasks 1 y 2. `requireAdmin` se aplica solo a esta ruta (`router.post('/:id/correcciones', requireAdmin, ...)`), no a todo el router — `GET /` y `POST /` (crear registro original) siguen abiertos a cualquier sesión válida, sin cambios. El orden de validación (id numérico → cuerpo válido → existe → no está ya corregido) es deliberado: primero lo barato de verificar, antes de tocar la base de datos dos veces.

---

### Task 4: Cliente de API — `correctRegistro`

**Files:**
- Modify: `mi-app-qr/client/src/lib/apiClient.ts`
- Modify: `mi-app-qr/client/test/apiClient.test.ts`

- [ ] **Step 1: Agregar el test al final de `describe('apiClient', ...)` en `mi-app-qr/client/test/apiClient.test.ts`**

```typescript
  it('correctRegistro() envía la corrección al endpoint anidado y devuelve el registro corregido', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        registro: {
          id: 2,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: 1,
          motivo: 'faltaba la tilde',
        },
      }),
    });

    const result = await correctRegistro(1, {
      nombre: 'Ana Ríos',
      documento: '1',
      rol: 'estudiante',
      tipo: 'entrada',
      timestamp: '2026-01-01 10:00:00',
      motivo: 'faltaba la tilde',
    });

    expect(result.registro.corrigeRegistroId).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/registros/1/correcciones',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          motivo: 'faltaba la tilde',
        }),
      })
    );
  });
```

Y agrega `correctRegistro` al import existente de `'../src/lib/apiClient'` al inicio del archivo.

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- apiClient`
Expected: FAIL — `correctRegistro` no está exportado por `apiClient.ts`

- [ ] **Step 3: Agregar al final de `mi-app-qr/client/src/lib/apiClient.ts`**

```typescript
export function correctRegistro(
  id: number,
  data: CorregirRegistroRequest
): Promise<{ registro: Registro }> {
  return request<{ registro: Registro }>(`/api/registros/${id}/correcciones`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

Y agrega `CorregirRegistroRequest` al import existente de `'@mi-app-qr/shared'` al inicio del archivo (junto a `LoginRequest`, `LoginResponse`, etc.).

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- apiClient`
Expected: PASS

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/lib/apiClient.ts client/test/apiClient.test.ts
git commit -m "feat(client): apiClient - correctRegistro"
```

## Context

Task 4 de este plan, depende de la Task 3 (endpoint real ya existe) y de la Task 2 (tipos compartidos). Mismo patrón que `createRegistro`/`createUser`, con el `id` en la URL en vez de en el cuerpo — refleja que la corrección pertenece al registro que corrige, no es un recurso independiente.

---

### Task 5: `CorregirRegistroModal`

**Files:**
- Create: `mi-app-qr/client/src/components/CorregirRegistroModal.tsx`
- Test: `mi-app-qr/client/test/CorregirRegistroModal.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/client/test/CorregirRegistroModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Registro } from '@mi-app-qr/shared';
import { CorregirRegistroModal } from '../src/components/CorregirRegistroModal';

const registro: Registro = {
  id: 1,
  nombre: 'Ana Ríos',
  documento: '123',
  rol: 'estudiante',
  tipo: 'entrada',
  timestamp: '2026-01-01 10:00:00',
  creadoPorUsuarioId: 1,
  corrigeRegistroId: null,
  motivo: null,
};

describe('CorregirRegistroModal', () => {
  it('no renderiza nada si registro es null', () => {
    const { container } = render(
      <CorregirRegistroModal registro={null} onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('precarga los campos del registro que se va a corregir', () => {
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue('Ana Ríos');
    expect(screen.getByLabelText(/^documento$/i)).toHaveValue('123');
    expect(screen.getByLabelText(/^rol$/i)).toHaveValue('estudiante');
    expect(screen.getByLabelText(/fecha y hora/i)).toHaveValue('2026-01-01T10:00');
    expect(screen.getByLabelText(/motivo/i)).toHaveValue('');
  });

  it('exige motivo antes de enviar', async () => {
    const onSubmit = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />
    );

    await userEvent.click(screen.getByRole('button', { name: /guardar corrección/i }));

    expect(await screen.findByText(/motivo es obligatorio/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía los datos corregidos con el timestamp convertido de vuelta al formato del servidor', async () => {
    const onSubmit = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={vi.fn()} onSubmit={onSubmit} isSubmitting={false} />
    );

    await userEvent.clear(screen.getByLabelText(/^nombre$/i));
    await userEvent.type(screen.getByLabelText(/^nombre$/i), 'Ana María Ríos');
    await userEvent.type(screen.getByLabelText(/motivo/i), 'corrigiendo el nombre completo');
    await userEvent.click(screen.getByRole('button', { name: /guardar corrección/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: 'Ana María Ríos',
      documento: '123',
      rol: 'estudiante',
      tipo: 'entrada',
      timestamp: '2026-01-01 10:00:00',
      motivo: 'corrigiendo el nombre completo',
    });
  });

  it('llama a onCancel al hacer clic en Cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <CorregirRegistroModal registro={registro} onCancel={onCancel} onSubmit={vi.fn()} isSubmitting={false} />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- CorregirRegistroModal`
Expected: FAIL — el módulo `../src/components/CorregirRegistroModal` no existe

- [ ] **Step 3: Implementar `mi-app-qr/client/src/components/CorregirRegistroModal.tsx`**

```typescript
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CorregirRegistroRequest, Registro } from '@mi-app-qr/shared';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const corregirRegistroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
  tipo: z.enum(['entrada', 'salida']),
  timestamp: z.string().min(1, 'La fecha es obligatoria'),
  motivo: z.string().min(1, 'El motivo es obligatorio'),
});

type CorregirRegistroFormValues = z.infer<typeof corregirRegistroSchema>;

interface CorregirRegistroModalProps {
  registro: Registro | null;
  onCancel: () => void;
  onSubmit: (data: CorregirRegistroRequest) => void;
  isSubmitting: boolean;
}

function toDatetimeLocalValue(sqliteTimestamp: string): string {
  return sqliteTimestamp.replace(' ', 'T').slice(0, 16);
}

function toSqliteTimestamp(datetimeLocalValue: string): string {
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}

export function CorregirRegistroModal({
  registro,
  onCancel,
  onSubmit,
  isSubmitting,
}: CorregirRegistroModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CorregirRegistroFormValues>({
    resolver: zodResolver(corregirRegistroSchema),
  });

  useEffect(() => {
    if (registro) {
      reset({
        nombre: registro.nombre,
        documento: registro.documento,
        rol: registro.rol,
        tipo: registro.tipo,
        timestamp: toDatetimeLocalValue(registro.timestamp),
        motivo: '',
      });
    }
  }, [registro, reset]);

  if (!registro) {
    return null;
  }

  function onFormSubmit(values: CorregirRegistroFormValues) {
    onSubmit({ ...values, timestamp: toSqliteTimestamp(values.timestamp) });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Corregir registro de ${registro.nombre}`}
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Corregir registro de {registro.nombre}
        </h2>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="corregir-nombre">Nombre</Label>
            <Input id="corregir-nombre" {...register('nombre')} />
            {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-documento">Documento</Label>
            <Input id="corregir-documento" {...register('documento')} />
            {errors.documento && <p className="text-sm text-destructive">{errors.documento.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-rol">Rol</Label>
            <Input id="corregir-rol" {...register('rol')} />
            {errors.rol && <p className="text-sm text-destructive">{errors.rol.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-tipo">Tipo</Label>
            <select
              id="corregir-tipo"
              {...register('tipo')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-timestamp">Fecha y hora</Label>
            <Input id="corregir-timestamp" type="datetime-local" {...register('timestamp')} />
            {errors.timestamp && <p className="text-sm text-destructive">{errors.timestamp.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corregir-motivo">Motivo de la corrección</Label>
            <textarea
              id="corregir-motivo"
              {...register('motivo')}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {errors.motivo && <p className="text-sm text-destructive">{errors.motivo.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Guardar corrección
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- CorregirRegistroModal`
Expected: PASS — 5 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/components/CorregirRegistroModal.tsx client/test/CorregirRegistroModal.test.tsx
git commit -m "feat(client): CorregirRegistroModal - componente controlado, sin logica de red propia"
```

## Context

Task 5 de este plan, depende de la Task 2 (tipos). El componente es puramente controlado por props — no llama a `apiClient` ni usa `useMutation` directamente, eso vive en `RegistrosPage` (Task 6). Esto lo hace testeable de forma aislada, sin mockear `apiClient`, y reutilizable si en el futuro se corrige desde otro lugar. `role="dialog"` no es decorativo: la Task 6 lo usa para distinguir, en los tests de `RegistrosPage`, los campos del modal de los campos idénticamente nombrados del formulario de "Nuevo registro" que coexisten en la misma página. Las funciones `toDatetimeLocalValue`/`toSqliteTimestamp` son manipulación de string pura, sin pasar por `Date` — evita cualquier ambigüedad de zona horaria al convertir ida y vuelta.

---

### Task 6: Integrar en `RegistrosPage` — botón "Corregir" solo para `admin`

**Files:**
- Modify: `mi-app-qr/client/src/pages/RegistrosPage.tsx`
- Modify: `mi-app-qr/client/test/RegistrosPage.test.tsx`

- [ ] **Step 1: Reemplazar `mi-app-qr/client/test/RegistrosPage.test.tsx`** — contenido final completo (envuelve en `AuthProvider`, que antes no hacía falta porque la página no leía el usuario en sesión; agrega dos tests nuevos al final):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegistrosPage from '../src/pages/RegistrosPage';
import { AuthProvider } from '../src/auth/AuthContext';
import * as apiClient from '../src/lib/apiClient';

vi.mock('../src/lib/apiClient');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegistrosPage />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('RegistrosPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 1, username: 'admin', role: 'admin', cargo: null, createdAt: '2026-01-01' },
    });
  });

  it('lista los registros existentes', async () => {
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        {
          id: 1,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: null,
          motivo: null,
        },
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
          {
            id: 1,
            nombre: 'Luis Gómez',
            documento: '2',
            rol: 'docente',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:05:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: null,
            motivo: null,
          },
        ],
      });
    vi.mocked(apiClient.createRegistro).mockResolvedValue({
      registro: {
        id: 1,
        nombre: 'Luis Gómez',
        documento: '2',
        rol: 'docente',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:05:00',
        creadoPorUsuarioId: 1,
        corrigeRegistroId: null,
        motivo: null,
      },
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

  it('NO muestra el botón Corregir si el usuario es operador', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue({
      user: { id: 2, username: 'operador1', role: 'operador', cargo: 'vigilancia', createdAt: '2026-01-01' },
    });
    vi.mocked(apiClient.listRegistros).mockResolvedValue({
      registros: [
        {
          id: 1,
          nombre: 'Ana Ríos',
          documento: '1',
          rol: 'estudiante',
          tipo: 'entrada',
          timestamp: '2026-01-01 10:00:00',
          creadoPorUsuarioId: 1,
          corrigeRegistroId: null,
          motivo: null,
        },
      ],
    });

    renderPage();

    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: /^corregir$/i })).not.toBeInTheDocument();
  });

  it('corrige un registro y refresca la lista con la versión corregida', async () => {
    vi.mocked(apiClient.listRegistros)
      .mockResolvedValueOnce({
        registros: [
          {
            id: 1,
            nombre: 'Ana Rios',
            documento: '1',
            rol: 'estudiante',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:00:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: null,
            motivo: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        registros: [
          {
            id: 2,
            nombre: 'Ana Ríos',
            documento: '1',
            rol: 'estudiante',
            tipo: 'entrada',
            timestamp: '2026-01-01 10:00:00',
            creadoPorUsuarioId: 1,
            corrigeRegistroId: 1,
            motivo: 'faltaba la tilde',
          },
        ],
      });
    vi.mocked(apiClient.correctRegistro).mockResolvedValue({
      registro: {
        id: 2,
        nombre: 'Ana Ríos',
        documento: '1',
        rol: 'estudiante',
        tipo: 'entrada',
        timestamp: '2026-01-01 10:00:00',
        creadoPorUsuarioId: 1,
        corrigeRegistroId: 1,
        motivo: 'faltaba la tilde',
      },
    });

    renderPage();
    await screen.findByText('Ana Rios');

    await userEvent.click(screen.getByRole('button', { name: /^corregir$/i }));

    const dialog = within(screen.getByRole('dialog'));
    await userEvent.clear(dialog.getByLabelText(/^nombre$/i));
    await userEvent.type(dialog.getByLabelText(/^nombre$/i), 'Ana Ríos');
    await userEvent.type(dialog.getByLabelText(/motivo/i), 'faltaba la tilde');
    await userEvent.click(dialog.getByRole('button', { name: /guardar corrección/i }));

    await waitFor(() =>
      expect(apiClient.correctRegistro).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ nombre: 'Ana Ríos', motivo: 'faltaba la tilde' })
      )
    );
    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- RegistrosPage`
Expected: FAIL — `RegistrosPage` no llama a `useAuth()` todavía, así que no hay botón "Corregir" en ningún caso; los dos tests nuevos fallan.

- [ ] **Step 3: Reemplazar `mi-app-qr/client/src/pages/RegistrosPage.tsx`** — contenido final completo:

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CorregirRegistroRequest, CreateRegistroRequest, Registro } from '@mi-app-qr/shared';
import { correctRegistro, createRegistro, listRegistros } from '../lib/apiClient';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { CorregirRegistroModal } from '../components/CorregirRegistroModal';

const registroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  documento: z.string().min(1, 'El documento es obligatorio'),
  rol: z.string().min(1, 'El rol es obligatorio'),
});

type RegistroFormValues = z.infer<typeof registroSchema>;

export default function RegistrosPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [registroACorregir, setRegistroACorregir] = useState<Registro | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['registros'],
    queryFn: listRegistros,
    refetchInterval: 7000,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateRegistroRequest) => createRegistro(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      reset();
    },
  });

  const correccionMutation = useMutation({
    mutationFn: (values: CorregirRegistroRequest) => correctRegistro(registroACorregir!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      setRegistroACorregir(null);
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
            <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="documento">Documento</Label>
            <Input id="documento" aria-invalid={!!errors.documento} {...register('documento')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rol">Rol</Label>
            <Input id="rol" aria-invalid={!!errors.rol} {...register('rol')} />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Registrar entrada
          </Button>
          {(errors.nombre ?? errors.documento ?? errors.rol) && (
            <p className="w-full text-sm text-destructive">
              {(errors.nombre ?? errors.documento ?? errors.rol)?.message}
            </p>
          )}
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
                {user?.role === 'admin' && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {data.registros.map((registro) => (
                <tr key={registro.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{registro.nombre}</td>
                  <td className="py-2 text-foreground">{registro.rol}</td>
                  <td className="py-2 text-foreground">{registro.tipo}</td>
                  <td className="py-2 text-muted-foreground">{registro.timestamp}</td>
                  {user?.role === 'admin' && (
                    <td className="py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setRegistroACorregir(registro)}>
                        Corregir
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CorregirRegistroModal
        registro={registroACorregir}
        onCancel={() => setRegistroACorregir(null)}
        onSubmit={(values) => correccionMutation.mutate(values)}
        isSubmitting={correccionMutation.isPending}
      />
    </div>
  );
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test -- RegistrosPage`
Expected: PASS — 6 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/client && npm test && npm run build`
Expected: todos pasan, build sin errores

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add client/src/pages/RegistrosPage.tsx client/test/RegistrosPage.test.tsx
git commit -m "feat(client): boton Corregir en RegistrosPage, visible solo para admin"
```

## Context

Task 6 (última) de este plan, depende de las Tasks 4 y 5. `RegistrosPage` ahora llama a `useAuth()` — por eso los tests existentes, que antes renderizaban la página sin `AuthProvider`, tienen que envolverla ahora; se mockea `apiClient.getMe` con un usuario `admin` por defecto en `beforeEach` para que los tests que no les importa el rol sigan pasando sin cambios de comportamiento. El botón "Corregir" y la columna extra de la tabla son puramente condicionales a `user?.role === 'admin'` — **UX, no autorización real**: la autorización real ya vive en `requireAdmin` del servidor (Task 3), igual que ya se estableció con `Usuarios` en el Sidebar.

---

## Fuera de alcance de este plan

- UI para ver el historial completo de una cadena (original + cada corrección) — la cadena queda en la base de datos, sin pantalla para recorrerla. Ver spec, sección "Fuera de alcance".
- Que un operador corrija sus propios registros.
- Deshacer una corrección.
- Ocultar del lado del cliente la ruta que muestra `RegistrosPage` para no-admin — no aplica aquí, ya que `RegistrosPage` es la ruta `/` y todos los roles la necesitan para ver/crear registros; solo el botón "Corregir" se oculta.
- Verificación manual end-to-end contra el servidor real corriendo — mismo criterio que en el plan de gestión de usuarios: el patrón (TDD + mocks + build limpio) ya se verificó exhaustivamente para este mismo tipo de flujo. Si al fusionar esto se quiere esa verificación, es razonable pedirla como paso manual aparte.
