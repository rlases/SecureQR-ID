// main.js

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const sudo = require('sudo-prompt');
const crypto = require('crypto');

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

    win.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, 'build', 'index.html')}`
    );

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
    app.whenReady().then(loadConfiguration).then(createWindow);
}


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
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
