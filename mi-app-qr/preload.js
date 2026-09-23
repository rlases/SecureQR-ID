// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// checkLicense ya no se expone aquí (issue #50): la licencia se verifica una vez
// al arrancar el servidor, en main.js, no por renderer/sesión — ver ese archivo.
contextBridge.exposeInMainWorld('electronAPI', {
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
