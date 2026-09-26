// scripts/rebuild-native.js
//
// Recompila los módulos nativos de mi-app-qr/server (better-sqlite3) contra la
// ABI de Electron en vez de la del Node del sistema — paso de empaquetado
// (issue #49). Sin esto, el binario que deja `npm ci` en server/node_modules
// (compilado contra el Node del sistema) no carga dentro del proceso Node
// embebido en el paquete final: falla con un error de NODE_MODULE_VERSION.
//
// Se ejecuta como parte de `npm run prepack`, después de instalar las
// dependencias de producción de server/ (prepare:server-prod-deps) y antes de
// invocar electron-builder.

const path = require('path');
const { rebuild } = require('@electron/rebuild');
const electronVersion = require('electron/package.json').version;

const buildPath = path.join(__dirname, '..', 'server');

rebuild({
    buildPath,
    electronVersion,
    onlyModules: ['better-sqlite3'],
    force: true,
}).then(
    () => {
        console.log(
            `[rebuild-native] better-sqlite3 recompilado contra Electron ${electronVersion} en ${buildPath}`
        );
    },
    (error) => {
        console.error(
            '[rebuild-native] No se pudo recompilar better-sqlite3 contra la ABI de Electron:',
            error
        );
        process.exit(1);
    }
);
