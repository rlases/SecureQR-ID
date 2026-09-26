// main.js

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const sudo = require('sudo-prompt');
const crypto = require('crypto');
const { spawn } = require('child_process');
const https = require('https');
const { loadOrCreateCertificate } = require('./src/lib/tls');

const isDev = !app.isPackaged;

// --- INICIO: LÓGICA DE LICENCIA CONFIGURABLE ---
const LICENSE_SECRET_KEY = 'una-clave-muy-secreta-y-dificil-de-adivinar-12345!';
const userDataPath = app.getPath('userData');
const licenseFilePath = path.join(userDataPath, 'license-data.json');
const configFilePath = path.join(userDataPath, 'config.json'); // <-- Archivo de configuración

let TRIAL_DAYS = 500; // <-- Valor por defecto

// Función para leer la configuración al inicio
async function loadConfiguration() {
    try {
        const configData = await fs.readFile(configFilePath, 'utf-8');
        const config = JSON.parse(configData);
        if (config && typeof config.trialDays === 'number' && config.trialDays > 0) {
            TRIAL_DAYS = config.trialDays;
            console.log(`Licencia configurada para ${TRIAL_DAYS} días.`);
        }
    } catch (error) {
        console.log('No se encontró config.json. Usando duración de prueba por defecto (500 días).');
    }
}

// Función para generar la firma de los datos
function createSignature(data) {
    const dataString = `${data.installationDate}-${data.lastExecutionDate}-${data.isTampered}`;
    return crypto.createHmac('sha256', LICENSE_SECRET_KEY).update(dataString).digest('hex');
}

async function readLicenseData() {
    try {
        const data = await fs.readFile(licenseFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function writeLicenseData(data) {
    const signature = createSignature(data);
    const dataToStore = { ...data, signature };
    await fs.writeFile(licenseFilePath, JSON.stringify(dataToStore, null, 2), 'utf-8');
}

// Adaptada al modelo cliente-servidor (issue #50): ya no existe un renderer que
// consulte esto por IPC (el proceso Electron ahora sirve el cliente nuevo en
// localhost:4000, un solo puesto que actúa como servidor para toda la red
// institucional — no una instalación por persona). El chequeo pasa a bloquear el
// arranque del servidor mismo: si la licencia no es válida, nadie en la red llega
// a usar la app, en vez de comprobarse una vez por sesión de un renderer que nadie
// carga ya.
async function checkLicense() {
    const now = Date.now();
    const licenseData = await readLicenseData();

    let { installationDate, lastExecutionDate, isTampered, signature } = licenseData;

    if (signature && signature !== createSignature({ installationDate, lastExecutionDate, isTampered })) {
        await writeLicenseData({ installationDate, lastExecutionDate, isTampered: true });
        throw new Error('Los datos de licencia fueron manipulados. Contacta al administrador del sistema.');
    }

    if (isTampered) {
        throw new Error('Los datos de licencia fueron manipulados. Contacta al administrador del sistema.');
    }

    if (!installationDate) {
        await writeLicenseData({ installationDate: now, lastExecutionDate: now, isTampered: false });
        return;
    }

    if (now < lastExecutionDate) {
        await writeLicenseData({ ...licenseData, isTampered: true });
        throw new Error('Se detectó una manipulación del reloj del sistema. Contacta al administrador del sistema.');
    }

    const elapsedMilliseconds = now - installationDate;
    const elapsedDays = elapsedMilliseconds / (1000 * 60 * 60 * 24);

    if (elapsedDays > TRIAL_DAYS) {
        throw new Error(`El periodo de prueba (${TRIAL_DAYS} días) expiró. Contacta al administrador para renovar la licencia.`);
    }

    await writeLicenseData({ ...licenseData, lastExecutionDate: now });
}
// --- FIN: LÓGICA DE LICENCIA ---

// --- INICIO: ARRANQUE DEL SERVIDOR REAL ---
// Empaquetado (issue #49): server/ y client/ viajan como extraResources, junto
// a app.asar, no dentro — better-sqlite3 (nativo) no podría cargarse desde
// dentro del asar, y así tampoco hace falta desempaquetarlo aparte.
const SERVER_DIR = isDev ? path.join(__dirname, 'server') : path.join(process.resourcesPath, 'server');
const SERVER_PORT = 4000;
const serverSecretsPath = path.join(userDataPath, 'server-secrets.json');
const TLS_DIR = path.join(userDataPath, 'tls');

let serverProcess = null;
let trustedServerCertPem = null;

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

function waitForServerHealth(port, timeoutMs, cert) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        function attempt() {
            // ca: cert verifica contra el certificado autofirmado que se acaba de
            // generar/cargar para esta misma instalación (ADR-0008) — no se
            // desactiva la verificación (rejectUnauthorized), se valida contra la
            // única CA que tiene sentido aquí: la nuestra.
            const req = https.get(`https://localhost:${port}/api/health`, { ca: cert }, (res) => {
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

    // Certificado autofirmado por instalación (ADR-0008, docs/DECISIONS.md): el
    // mismo equipo que actúa como servidor lo genera y lo persiste en `userData`;
    // no hay CA externa. Se regenera solo si cambiaron las IP de la red local.
    const { certPath, keyPath, cert, regenerated } = await loadOrCreateCertificate(TLS_DIR);
    trustedServerCertPem = cert;

    // En desarrollo (`npm run electron-dev`) `server/node_modules/better-sqlite3`
    // está compilado contra la ABI del Node del sistema (instalado con un `npm
    // install` normal en server/), así que se spawnea con el binario "node" real
    // resuelto por PATH — usar process.execPath (Electron) aquí falla con un
    // error de NODE_MODULE_VERSION, porque la ABI de Electron no coincide con la
    // del Node del sistema.
    //
    // Empaquetado (app.isPackaged), en cambio, recompila ese mismo módulo nativo
    // contra la ABI de Electron como paso de build (scripts/rebuild-native.js,
    // issue #49) — ahí sí se puede, y se debe, usar el propio Node embebido en
    // Electron (process.execPath + ELECTRON_RUN_AS_NODE=1), porque ya no se puede
    // asumir que el equipo servidor tenga Node.js instalado por separado. Esto es
    // lo que resuelve de raíz la limitación documentada abajo para el caso
    // empaquetado; en desarrollo sigue existiendo tal cual.
    const [command, commandArgs, extraEnv] = !isDev
        ? [process.execPath, [path.join(SERVER_DIR, 'dist', 'index.js')], { ELECTRON_RUN_AS_NODE: '1' }]
        : ['node', [path.join(SERVER_DIR, 'dist', 'index.js')], {}];

    serverProcess = spawn(command, commandArgs, {
        env: {
            ...process.env,
            ...extraEnv,
            PORT: String(SERVER_PORT),
            SESSION_SECRET: secrets.sessionSecret,
            DB_PATH: path.join(userDataPath, 'server-data', 'app.db'),
            SEED_ADMIN_USERNAME: secrets.adminUsername,
            SEED_ADMIN_PASSWORD: secrets.adminPassword,
            TLS_CERT_PATH: certPath,
            TLS_KEY_PATH: keyPath,
        },
        stdio: 'pipe',
        shell: process.platform === 'win32',
    });

    serverProcess.stdout.on('data', (data) => console.log(`[servidor] ${data}`.trim()));
    serverProcess.stderr.on('data', (data) => console.error(`[servidor] ${data}`.trim()));

    await waitForServerHealth(SERVER_PORT, 15000, cert);

    return {
        isFirstRun,
        adminUsername: secrets.adminUsername,
        adminPassword: secrets.adminPassword,
        certRegenerated: regenerated,
    };
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}

// Acepta en la ventana de Electron exactamente el certificado autofirmado que
// esta misma instalación generó para localhost (ver loadOrCreateCertificate) y
// rechaza cualquier otro — nunca se baja la verificación de forma general
// (ignore-certificate-errors), solo se confía en esta huella puntual, igual que
// un usuario aceptaría manualmente una excepción de certificado en un navegador,
// pero sin el diálogo de advertencia en cada arranque.
function trustGeneratedCertificate() {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
        const isOurCert =
            request.hostname === 'localhost' &&
            trustedServerCertPem &&
            request.certificate.data.trim() === trustedServerCertPem.trim();
        callback(isOurCert ? 0 : -2);
    });
}
// --- FIN: ARRANQUE DEL SERVIDOR REAL ---

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'public', 'favicon.ico'),
        show: false,
        autoHideMenuBar: true,
    });

    win.maximize();
    win.show();
    Menu.setApplicationMenu(null);

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.loadURL(`https://localhost:${SERVER_PORT}`);

    if (isDev) {
        win.webContents.openDevTools();
    }

    win.on('closed', () => {
        win = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
    // Cargar la configuración y verificar la licencia ANTES de arrancar el
    // servidor — si la licencia no es válida, el servidor nunca se levanta y
    // nadie en la red institucional puede usar la app.
    app.whenReady()
        .then(loadConfiguration)
        .then(checkLicense)
        .then(startServer)
        .then(({ isFirstRun, adminUsername, adminPassword }) => {
            trustGeneratedCertificate();
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
}


app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopServer();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('fetch-url-content', async (event, url) => {
    const allowedDomain = 'carnetsunad.halconerp.com';
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== allowedDomain) {
            return { success: false, error: 'Acceso a dominio no autorizado.' };
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const text = await response.text();
        return { success: true, data: text };
    } catch (error) {
        console.error('[Main Process] Error fetching URL:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-csv-dialog', async (event, fileName, csvContent) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Guardar Reporte CSV',
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'Archivos CSV', extensions: ['csv'] }]
    });

    if (canceled) {
        return { success: false, canceled: true };
    }

    try {
        await fs.writeFile(filePath, csvContent, 'utf-8');
        return { success: true, filePath };
    } catch (error) {
        console.error('Error al guardar el archivo CSV:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('request-admin-privileges', async () => {
    return new Promise((resolve) => {
        const options = { name: 'Registro QR Admin' };
        const command = 'net session > nul';
        sudo.exec(command, options, (error) => {
            if (error) {
                resolve({ success: false, error: 'Permisos de administrador no concedidos.' });
                return;
            }
            resolve({ success: true });
        });
    });
});
