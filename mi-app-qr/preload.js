// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    checkLicense: () => ipcRenderer.invoke('check-license'),
    requestAdminPrivileges: () => ipcRenderer.invoke('request-admin-privileges'),
    saveCsvDialog: (fileName, csvContent) => {
        // Validación: Asegurarse de que los argumentos son strings
        if (typeof fileName === 'string' && typeof csvContent === 'string') {
            return ipcRenderer.invoke('save-csv-dialog', fileName, csvContent);
        }
    },
    fetchUrlContent: (url) => {
        // Validación: Asegurarse de que la URL es un string
        if (typeof url === 'string' && url.startsWith('http')) {
            return ipcRenderer.invoke('fetch-url-content', url);
        }
    }
});
