// main.js

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const sudo = require('sudo-prompt');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');

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

ipcMain.handle('check-license', async () => {
    const now = Date.now();
    const licenseData = await readLicenseData();

    let { installationDate, lastExecutionDate, isTampered, signature } = licenseData;

    if (signature && signature !== createSignature({ installationDate, lastExecutionDate, isTampered })) {
        await writeLicenseData({ installationDate, lastExecutionDate, isTampered: true });
        return { status: 'TAMPERED' };
    }

    if (isTampered) {
        return { status: 'TAMPERED' };
    }

    if (!installationDate) {
        const newData = { installationDate: now, lastExecutionDate: now, isTampered: false };
        await writeLicenseData(newData);
        return { status: 'VALID' };
    }

    if (now < lastExecutionDate) {
        await writeLicenseData({ ...licenseData, isTampered: true });
        return { status: 'TAMPERED' };
    }

    const elapsedMilliseconds = now - installationDate;
    const elapsedDays = elapsedMilliseconds / (1000 * 60 * 60 * 24);

    if (elapsedDays > TRIAL_DAYS) {
        return { status: 'EXPIRED' };
    }

    await writeLicenseData({ ...licenseData, lastExecutionDate: now });
    return { status: 'VALID' };
});
// --- FIN: LÓGICA DE LICENCIA ---

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

    // NOTA: se usa el binario "node" del sistema (resuelto por PATH), no
    // process.execPath (el propio Electron) con ELECTRON_RUN_AS_NODE=1. Se probó
    // ese camino y falla: better-sqlite3 está compilado contra la ABI de Node del
    // sistema (NODE_MODULE_VERSION 115), que no coincide con la ABI del Node que
    // empaqueta Electron 30 (123) — el proceso hijo moría con un error de
    // NODE_MODULE_VERSION al cargar el módulo nativo. Usar un Node real evita el
    // mismatch sin recompilar nada.
    //
    // Esto significa que, por ahora, el equipo donde corre esta app como servidor
    // necesita tener Node.js instalable en el PATH — aceptable en esta fase, ya que
    // solo se corre sin empaquetar (`npm run electron-dev`). El plan de empaquetado
    // con electron-builder (fuera de alcance aquí) tendrá que resolver esto de raíz,
    // probablemente con electron-rebuild como paso del empaquetado — sin romper el
    // desarrollo/pruebas standalone de server/, que sigue usando Node del sistema.
    serverProcess = spawn('node', [path.join(SERVER_DIR, 'dist', 'index.js')], {
        env: {
            ...process.env,
            PORT: String(SERVER_PORT),
            SESSION_SECRET: secrets.sessionSecret,
            DB_PATH: path.join(userDataPath, 'server-data', 'app.db'),
            SEED_ADMIN_USERNAME: secrets.adminUsername,
            SEED_ADMIN_PASSWORD: secrets.adminPassword,
        },
        stdio: 'pipe',
        shell: process.platform === 'win32',
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
        icon: path.join(__dirname, 'build', 'favicon.ico'),
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

    win.loadURL(`http://localhost:${SERVER_PORT}`);

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
    // Cargar la configuración ANTES de crear la ventana
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
