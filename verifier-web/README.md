# Portal web del verificador

Interfaz React/TypeScript para capturar un QR y enviar su token opaco al adaptador HTTP
de `verifier/`. El navegador no interpreta `SQRID/1`, no replica validaciones
criptográficas y no conserva tokens ni identificadores.

## Desarrollo local

Requiere Node.js 22.12 o posterior. Instala las dependencias y abre dos terminales:

```bash
cd verifier-web
npm ci
npm run dev:api-fixture
```

```bash
cd verifier-web
npm run dev
```

Vite publica el portal en `http://127.0.0.1:5174` y redirige `/api` al fixture local en
`http://127.0.0.1:8000`. Usa `LAB-ACCEPTED` para recorrer el estado aceptado; cualquier
otro valor sintético muestra el rechazo genérico.

`dev:api-fixture` existe solo para inspección visual y pruebas manuales. No verifica
firmas, está ligado a loopback y nunca se debe desplegar. Un entorno real debe montar
`secureqr_verifier.web.create_app()` con todas las dependencias obligatorias del
verificador y publicar frontend/API bajo el mismo origen HTTPS.

## Pruebas

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest cubre contratos de API, privacidad, bloqueo de envíos duplicados y ciclo de
cámara. Playwright verifica escritorio, tableta y móvil, incluyendo axe, desbordamiento
horizontal y los estados aceptado/rechazado.

## Controles de privacidad y accesibilidad

- La cámara se activa únicamente tras una acción explícita y se detiene al primer QR.
- El token se borra del estado del formulario al enviarse y nunca aparece en resultados,
  historial, logs ni almacenamiento web.
- El historial de sesión es volátil, limitado y solo conserva hora y decisión.
- Los rechazos criptográficos son genéricos; los fallos de transporte se distinguen para
  permitir reintento sin revelar detalles del token.
- La navegación funciona con teclado, el foco es visible, los cambios se anuncian y las
  animaciones respetan `prefers-reduced-motion`.

Las decisiones completas están en ADR-0012 de
[`docs/DECISIONS.md`](../docs/DECISIONS.md).
