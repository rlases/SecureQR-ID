# Registro administrativo y portal del titular

Aplicación Electron que inicia un servidor Express/SQLite y el cliente actual de
`client/`. Gestiona registros administrativos, usuarios, estamentos, titulares y
el vínculo del teléfono. El portal solicita los tokens SQRID/1 al servicio local
de `issuer/`, que debe arrancar el custodio por separado.

La versión histórica de lectura de texto se conserva en `baseline-o3`. El cliente
actual no se arranca con el antiguo `npm start` de Create React App.

## Desarrollo

Desde la raíz del repositorio, con Node 22.12 o posterior:

```bash
npm --prefix mi-app-qr ci
npm --prefix mi-app-qr/server ci
npm --prefix mi-app-qr/client ci
npm --prefix mi-app-qr/server run build
npm --prefix mi-app-qr/client run build
npm --prefix mi-app-qr run electron-dev
```

Electron crea el certificado y los secretos de la instalación, y abre el servidor
HTTPS en el puerto 4000. El primer inicio entrega las credenciales del administrador.
No se copian `server-secrets.json`, bases ni claves privadas al repositorio.

## Pruebas y empaquetado

- Raíz: `npm test -- --watchAll=false` con el modo CI correspondiente.
- Servidor: `npm test` y `npm run build` dentro de `server/`.
- Cliente: `npm test` y `npm run build` dentro de `client/`.
- Instalador: instalar las dependencias anteriores y ejecutar `npm run dist` en
  esta carpeta. `prepack` compila servidor y cliente, reinstala las dependencias
  de producción del servidor y reconstruye el módulo nativo para Electron.

El instalador no configura por sí solo el emisor Python, la revocación ni Fabric.
El flujo `windows-instalador.yml` prepara un NSIS y prueba su instalación y persistencia
en un runner desechable; consultar su resultado antes de dar por aceptado un binario.

## Guías

- [Manual de usuario](../docs/MANUAL-USUARIO.md).
- [Manual técnico](../docs/MANUAL-TECNICO.md).
- [API, variables y operación del servidor](server/README.md).
- [Criterios de entrega y comprobación Windows](../docs/ENTREGA.md).
- [Instalación opcional del CCAV](../docs/INSTALACION-CCAV.md).

Validar un token en `verifier-web` y guardar una asistencia en Registros son
operaciones diferentes. No se interpreta una lectura de texto del carné como
una verificación criptográfica de SQRID/1.
