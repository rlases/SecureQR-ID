# Electron sirve el servidor real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `mi-app-qr` (la app de escritorio Electron) arranque el servidor real (`mi-app-qr/server`) al abrirse, que ese servidor sirva el build del cliente (`mi-app-qr/client`) además de la API, y que la ventana de Electron cargue esa misma URL — cerrando la brecha entre "cliente y servidor corren por separado en desarrollo" y el requerimiento de ADR-0008: una sola app que, al ejecutarse, es tanto el puesto de trabajo como el servidor de la red.

**Architecture:** `mi-app-qr/server` gana una capacidad nueva — servir archivos estáticos de `mi-app-qr/client/dist` con fallback a `index.html` (para que las rutas de React Router funcionen), activa solo cuando ese directorio existe (no rompe nada de lo ya probado). `mi-app-qr/main.js` deja de apuntar al dev server de Create React App; en su lugar arranca el servidor real como proceso hijo, genera y persiste su `SESSION_SECRET` y las credenciales del admin semilla en `userData` (mismo patrón que ya usa para la licencia), espera a que responda, y carga `http://localhost:4000`.

**Tech Stack:** el mismo de `server/` (Express, TypeScript) y de Electron ya existente (`child_process`, IPC). Sin dependencias nuevas.

---

## Decisiones que tomo aquí, explícitas

**No toco el sistema de licencia/prueba existente en `main.js`.** Sigue intacto — pero el cliente nuevo (Vite) no lo llama en ningún punto (`AuthContext` no usa `window.electronAPI`), así que queda como código muerto para este flujo hasta que alguien decida qué hacer con el concepto de licencia por prueba en un modelo multiusuario. Es una decisión de producto, no técnica — la dejo señalada en "Fuera de alcance", no la resuelvo yo.

**No toco el empaquetado de `electron-builder`** (el bloque `"build"` de `mi-app-qr/package.json`). Empaquetar un instalador que incluya `server/dist`, `server/node_modules` (con el binario nativo de `better-sqlite3` para la plataforma destino) y `client/dist` es un problema aparte, con riesgo real de bugs específicos de plataforma. Este plan cubre que la app funcione corriendo sin empaquetar (`npm run electron-dev`, que ya existe) — empaquetar para distribuir un instalador queda para un plan futuro, una vez esto esté probado.

---

## Mapa de archivos

```
mi-app-qr/
├── main.js                          ← Modify: arranca el servidor, carga su URL
└── server/
    └── src/
        └── app.ts                   ← Modify: sirve client/dist si existe
    └── test/
        └── staticClient.test.ts     ← Create
```

---

### Task 1: El servidor sirve el build del cliente (con fallback SPA)

**Files:**
- Modify: `mi-app-qr/server/src/app.ts`
- Test: `mi-app-qr/server/test/staticClient.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// mi-app-qr/server/test/staticClient.test.ts
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = './data/test-static.sqlite';
const FAKE_CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const INDEX_HTML_MARKER = '<!doctype html><html><body>cliente de prueba</body></html>';

let db: Database.Database;
let createdDistForTest = false;

beforeAll(() => {
  // Solo crea un dist de prueba si el real no existe todavía (p. ej. en CI antes
  // de que Task 2 del plan del cliente haya corrido `npm run build`). Si ya existe
  // un build real, lo dejamos intacto y usamos su contenido real.
  if (!fs.existsSync(FAKE_CLIENT_DIST)) {
    fs.mkdirSync(FAKE_CLIENT_DIST, { recursive: true });
    fs.writeFileSync(path.join(FAKE_CLIENT_DIST, 'index.html'), INDEX_HTML_MARKER);
    createdDistForTest = true;
  }
});

afterAll(() => {
  if (createdDistForTest) {
    fs.rmSync(FAKE_CLIENT_DIST, { recursive: true, force: true });
  }
});

beforeEach(() => {
  db = openDatabase(TEST_DB_PATH);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('archivos estáticos del cliente', () => {
  it('sirve index.html en la raíz', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('sirve index.html también para una ruta del lado del cliente (fallback SPA)', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/registros-inexistente-en-el-servidor');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('NO intercepta rutas de /api — siguen respondiendo como API, no como HTML', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('una ruta de /api inexistente sigue devolviendo 404, no el HTML del cliente', async () => {
    const app = createApp({ db, sessionSecret: 'test-secret' });
    const res = await request(app).get('/api/esto-no-existe');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- staticClient`
Expected: FAIL — las cuatro peticiones a `/` y a rutas no-API devuelven 404 (Express no tiene nada montado en esas rutas todavía).

- [ ] **Step 3: Modificar `mi-app-qr/server/src/app.ts`** — reemplaza el contenido completo por:

```typescript
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionMiddleware } from './auth/session.js';
import { createAuthRouter } from './auth/routes.js';
import { createRegistrosRouter } from './registros/routes.js';

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

  // 404 explícito para cualquier ruta de /api que no exista — debe ir ANTES del
  // fallback estático, o el fallback SPA le devolvería HTML a una API rota.
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

**Nota:** `CLIENT_DIST_PATH` es relativo al archivo compilado (`dist/app.js` dentro de `server/`), no al código fuente — por eso `../../client/dist` sube desde `server/dist/` hasta `mi-app-qr/`, y de ahí a `client/dist`. Verifica esto en el Step 4 con el build real, no solo con el test (el test usa `__dirname` del código fuente vía `ts-node`/`vitest`, que puede resolver distinto a como lo hace el JS ya compilado — si el path no coincide en la verificación manual del Step 6, ese es el bug a arreglar, no algo que puedas dar por sentado desde el test en verde).

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test -- staticClient`
Expected: PASS — 4 tests pasados

- [ ] **Step 5: Correr toda la suite y el build**

Run: `export PATH="/c/nvm4w/nodejs:$PATH" && cd mi-app-qr/server && npm test && npm run build`
Expected: todos los tests pasan (deberían ser 26: los 22 anteriores + 4 nuevos), build sin errores

- [ ] **Step 6: Verificación manual — confirmar que el path relativo funciona con el build real, no solo en el test**

```bash
export PATH="/c/nvm4w/nodejs:$PATH"
cd mi-app-qr/client && npm run build   # genera client/dist real
cd ../server
cp .env.example .env
rm -rf data
npm run build
node --env-file=.env dist/index.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/
curl -s http://localhost:4000/ | grep -o '<title>[^<]*</title>'
curl -s http://localhost:4000/api/health
```

Expected: el primer `curl` devuelve `200`, el segundo muestra `<title>Registro QR</title>` (el `index.html` real del cliente, no el marcador de prueba), el tercero `{"status":"ok"}`. Si el path no resuelve (404 en la raíz), el problema está en cómo `CLIENT_DIST_PATH` se calcula desde el JS compilado — depurarlo aquí, no adivinar. Detén el proceso (`kill %1` o `taskkill //F //IM node.exe`) y limpia `data/` y `.env` al terminar.

- [ ] **Step 7: Commit**

```bash
cd mi-app-qr
git add server/src/app.ts server/test/staticClient.test.ts
git commit -m "feat(server): servir el build del cliente con fallback SPA"
```

## Context

Task 1 de este plan. `mi-app-qr/server` (Tasks 1-12 de `docs/superpowers/plans/2026-08-15-server-foundation.md`) y `mi-app-qr/client` (Tasks 1-10 de `docs/superpowers/plans/2026-08-17-client-walking-skeleton.md`) ya están en `main`, completos y probados por separado. Hasta ahora, en desarrollo, corren como dos procesos en dos puertos (servidor en 4000 solo con API, cliente en 5173 vía Vite). Esta tarea hace que el servidor, además de la API, sirva el HTML/JS/CSS ya compilado del cliente — el primer paso para que sean un solo proceso en un solo puerto, que es lo que Electron va a arrancar en la Task 3.

---

### Task 2: Electron arranca el servidor real y le apunta

**Files:**
- Modify: `mi-app-qr/main.js`

- [ ] **Step 1: Reemplazar la sección de arranque de ventana en `mi-app-qr/main.js`**

Este archivo es JavaScript plano (no hay framework de pruebas para el proceso principal de Electron en este proyecto — ni lo había antes de esta tarea; la verificación es manual, Step 2). Agrega estos imports al inicio del archivo, junto a los que ya existen:

```javascript
const { spawn } = require('child_process');
const http = require('http');
```

Agrega esta sección **antes** de `function createWindow() {` (después del bloque de licencia, antes de `let win;`):

```javascript
// --- INICIO: ARRANQUE DEL SERVIDOR REAL ---
const SERVER_DIR = path.join(__dirname, 'server');
const SERVER_PORT = 4000;
const serverSecretsPath = path.join(userDataPath, 'server-secrets.json');

let serverProcess = null;

async function loadOrCreateServerSecrets() {
    try {
        const raw = await fs.readFile(serverSecretsPath, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        const secrets = {
            sessionSecret: crypto.randomBytes(32).toString('hex'),
            adminUsername: 'admin',
            adminPassword: crypto.randomBytes(9).toString('base64url'),
        };
        await fs.writeFile(serverSecretsPath, JSON.stringify(secrets, null, 2), 'utf-8');
        return secrets;
    }
}

function waitForServerHealth(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        function attempt() {
            const req = http.get(`http://localhost:${port}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else if (Date.now() > deadline) {
                    reject(new Error(`El servidor respondió ${res.statusCode} tras esperar ${timeoutMs}ms`));
                } else {
                    setTimeout(attempt, 300);
                }
            });
            req.on('error', () => {
                if (Date.now() > deadline) {
                    reject(new Error(`El servidor no respondió tras esperar ${timeoutMs}ms`));
                } else {
                    setTimeout(attempt, 300);
                }
            });
        }
        attempt();
    });
}

async function startServer() {
    const secrets = await loadOrCreateServerSecrets();
    const isFirstRun = !serverProcess && secrets.adminPassword;

    serverProcess = spawn(process.execPath, [path.join(SERVER_DIR, 'dist', 'index.js')], {
        env: {
            ...process.env,
            // Sin esto, process.execPath vuelve a lanzar Electron completo (con su
            // propia ventana) en vez de ejecutar el script como Node plano — es el
            // binario de Electron el que se está invocando, no un Node.js normal.
            ELECTRON_RUN_AS_NODE: '1',
            PORT: String(SERVER_PORT),
            SESSION_SECRET: secrets.sessionSecret,
            DB_PATH: path.join(userDataPath, 'server-data', 'app.db'),
            SEED_ADMIN_USERNAME: secrets.adminUsername,
            SEED_ADMIN_PASSWORD: secrets.adminPassword,
        },
        stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (data) => console.log(`[servidor] ${data}`.trim()));
    serverProcess.stderr.on('data', (data) => console.error(`[servidor] ${data}`.trim()));

    await waitForServerHealth(SERVER_PORT, 15000);

    return { isFirstRun, adminUsername: secrets.adminUsername, adminPassword: secrets.adminPassword };
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}
// --- FIN: ARRANQUE DEL SERVIDOR REAL ---
```

- [ ] **Step 2: Modificar `createWindow()` para cargar la URL del servidor en vez de la del CRA viejo**

Reemplaza estas líneas dentro de `createWindow()`:

```javascript
    win.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, 'build', 'index.html')}`
    );

    if (isDev) {
        win.webContents.openDevTools();
    }
```

por:

```javascript
    win.loadURL(`http://localhost:${SERVER_PORT}`);

    if (isDev) {
        win.webContents.openDevTools();
    }
```

- [ ] **Step 3: Arrancar el servidor antes de crear la ventana, y avisar las credenciales en el primer arranque**

Busca esta línea (dentro del bloque `else` de `gotTheLock`):

```javascript
    app.whenReady().then(loadConfiguration).then(createWindow);
```

Reemplázala por:

```javascript
    app.whenReady()
        .then(loadConfiguration)
        .then(startServer)
        .then(({ isFirstRun, adminUsername, adminPassword }) => {
            createWindow();
            if (isFirstRun) {
                dialog.showMessageBox(win, {
                    type: 'info',
                    title: 'Primer inicio del servidor',
                    message: 'Se generó un usuario administrador para este equipo.',
                    detail: `Usuario: ${adminUsername}\nContraseña: ${adminPassword}\n\nGuarda esta contraseña — no se volverá a mostrar. Se guardó en:\n${serverSecretsPath}`,
                });
            }
        })
        .catch((error) => {
            dialog.showErrorBox('No se pudo iniciar el servidor', error.message);
            app.quit();
        });
```

**Nota sobre `isFirstRun`:** tal como está escrito arriba, `isFirstRun` se calcula de forma aproximada (compara si `serverProcess` era `null` antes de arrancar, lo cual es casi siempre cierto en un arranque normal de la app — no distingue de forma confiable "primera vez que existe este archivo de secretos" de "enésimo arranque normal"). Esto es una simplificación deliberada para no complicar esta tarea con lógica adicional de estado persistido; el efecto práctico es que el diálogo de credenciales puede aparecer más de una vez en escenarios raros (ej. si se borra `server-secrets.json` a mano). Si en la verificación manual (Step 4) esto resulta molesto o incorrecto, es una mejora legítima para una tarea futura, no algo que debas "arreglar" silenciosamente aquí desviándote del código dado — repórtalo como hallazgo si lo notas.

- [ ] **Step 4: Detener el servidor al cerrar la app**

Busca:

```javascript
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
```

Reemplázala por:

```javascript
app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopServer();
});
```

- [ ] **Step 5: Verificación manual completa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH"
cd mi-app-qr/client && npm run build
cd ../server && npm run build
cd ..
npm run electron-dev
```

Con la ventana abierta:
1. Debe aparecer un diálogo con el usuario y contraseña generados (primer arranque). Anótalos.
2. Cierra el diálogo — debe verse la pantalla de login real del cliente (la misma del PR #16), servida por el propio proceso de Electron, no por Vite.
3. Inicia sesión con las credenciales del diálogo. Confirma que entras al layout con sidebar y `RegistrosPage`.
4. Crea un registro desde el formulario, confirma que aparece en la tabla.
5. Cierra la ventana de la app.
6. Desde una terminal aparte, confirma que no quedó un proceso `node` huérfano corriendo el servidor: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/health` debe fallar (conexión rechazada), no devolver `200`.
7. Vuelve a correr `npm run electron-dev` una segunda vez — esta vez NO debe pedir credenciales nuevas (usa las mismas persistidas), y el login con las credenciales anotadas en el paso 1 debe seguir funcionando (confirma que `server-data/app.db` persistió entre arranques).

Si cualquier paso falla, no lo reportes como DONE — describe exactamente qué paso falló y qué viste.

- [ ] **Step 6: Commit**

```bash
cd mi-app-qr
git add main.js
git commit -m "feat(electron): arrancar el servidor real y cargar su URL"
```

## Context

Task 2 de este plan, depende de la Task 1 (el servidor ya sirve el cliente). `mi-app-qr/main.js` es el proceso principal de Electron existente — ya tiene un sistema de licencia por prueba que persiste datos en `app.getPath('userData')` vía `fs`/`crypto`; esta tarea sigue exactamente ese mismo patrón para persistir el secreto de sesión del servidor y las credenciales del admin generado, en vez de inventar un mecanismo nuevo.

**No se modifica el bloque de licencia existente.** Sigue funcionando igual que antes (el cliente viejo ya no existe para llamarlo, pero el código no se toca en esta tarea — ver la nota de alcance al inicio del plan).

**Riesgo conocido a vigilar en el Step 5 (verificación manual):** `better-sqlite3` es un módulo nativo compilado contra la ABI de Node 20 "normal" (la que gestiona nvm-windows en este equipo). Electron empaqueta su propio Node internamente, y aunque Electron 30 usa una versión de Node 20.x, su ABI nativa a veces no coincide exactamente con la de un Node.js vanilla de la misma versión mayor — es un problema conocido en el ecosistema de Electron + módulos nativos, resoluble normalmente con `electron-rebuild` (recompila los módulos nativos contra la ABI exacta de Electron). Si el proceso hijo del servidor muere inmediatamente con un error tipo `NODE_MODULE_VERSION` o similar al cargar `better-sqlite3`, **esto es ese problema conocido, no un bug en el código de este plan** — repórtalo como BLOCKED con el error exacto en vez de intentar workarounds improvisados; resolverlo (agregar `electron-rebuild` al flujo) es trabajo legítimo pero debe decidirse, no adivinarse.

---

## Fuera de alcance de este plan

- **Empaquetado con `electron-builder`** (generar un instalador `.exe` distribuible que incluya `server/dist`, `server/node_modules` con el binario nativo de `better-sqlite3`, y `client/dist`). Riesgo real de problemas específicos de plataforma — necesita su propio plan, con su propia verificación (construir el instalador, instalarlo, correrlo).
- **Qué hacer con el sistema de licencia/prueba** frente al modelo multiusuario — decisión de producto, señalada pero no resuelta aquí.
- **Puerto configurable** — queda fijo en 4000; si hace falta cambiarlo (ej. conflicto con otro servicio en la red del CCAV), es una mejora futura sobre `config.json`, que ya existe para `TRIAL_DAYS`.
- **Catálogo de roles, gestión de usuarios más allá del admin semilla, HTTPS** — todo esto ya estaba señalado como pendiente en ADR-0008 y sigue igual.
