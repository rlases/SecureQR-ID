# Accesibilidad del frontend

> **Estado: borrador para decisión conjunta (issue #58).** Redactado y auditado por
> Duverney. El estándar de la sección 1 (qué es obligatorio y qué es deseable) **no está
> cerrado** hasta que Jhunier lo revise y ambos lo acuerden, igual que un ADR. Los
> hallazgos de la sección 3 son hechos medidos; no se corrigen en este issue.

ADR-0012 ya exige contraste AA, teclado, foco visible, anuncios de estado y movimiento
reducido, pero solo para `verifier-web/`. `mi-app-qr/client` lo usa el mismo personal
institucional, que puede incluir personas con discapacidad. Este documento propone un
estándar único para los dos frontends y audita el estado actual de `mi-app-qr/client`.

## 1. Estándar propuesto para todo el frontend

Referencia: **WCAG 2.2 nivel AA**. La columna "Nivel" es la propuesta a discutir.

| # | Criterio | Qué se exige en la práctica | WCAG | Nivel |
|---|---|---|---|---|
| E1 | Contraste | Texto ≥ 4.5:1 (≥ 3:1 si es grande); bordes de controles e indicador de foco ≥ 3:1 | 1.4.3, 1.4.11 | Obligatorio |
| E2 | Teclado | Todo se puede hacer sin ratón, en un orden que sigue la lectura | 2.1.1, 2.4.3 | Obligatorio |
| E3 | Foco visible | Todo elemento con foco muestra un indicador claro; nada lo oculta | 2.4.7, 2.4.11 | Obligatorio |
| E4 | Diálogos | Al abrir: el foco entra al diálogo. Mientras está abierto: Tab no sale de él. Escape lo cierra. Al cerrar: el foco vuelve a quien lo abrió. `role="dialog"`, `aria-modal="true"` y nombre accesible | 2.4.3, 4.1.2 | Obligatorio |
| E5 | Formularios | Cada campo tiene `<label>`. Un campo con error lleva `aria-invalid="true"` y `aria-describedby` apuntando a su mensaje | 1.3.1, 3.3.1, 3.3.2 | Obligatorio |
| E6 | Mensajes de estado | Errores del servidor con `role="alert"`; confirmaciones con `role="status"`; se anuncian sin mover el foco | 4.1.3 | Obligatorio |
| E7 | Sin ruido | Las regiones `aria-live` no se disparan con cada sondeo periódico (el refetch de 7 s), solo con cambios que la persona provocó o necesita saber | 4.1.3 (buena práctica) | Deseable |
| E8 | Movimiento | Animaciones solo para comunicar cambios de estado y desactivadas con `prefers-reduced-motion` | 2.3.3 | Obligatorio si hay animación |
| E9 | Idioma | `<html lang="es">` | 3.1.1 | Obligatorio |
| E10 | Título de página | Cada ruta tiene un `<title>` propio ("Informes · Registro QR") | 2.4.2 | Obligatorio |
| E11 | Estructura | Un `<main>` por página, encabezados en orden, tablas con `<th>` | 1.3.1, 2.4.1 | Obligatorio |
| E12 | Reflujo | Usable a 320 px de ancho sin desplazamiento horizontal de la página (las tablas pueden desplazarse dentro de su contenedor) | 1.4.10 | Obligatorio |
| E13 | Tamaño de objetivos | Controles de al menos 24 × 24 px | 2.5.8 | Obligatorio |
| E14 | Nombres únicos | Botones repetidos por fila dicen sobre qué actúan ("Corregir registro de Ana Pérez") | 2.4.6 | Deseable |

`verifier-web/` ya cumple E1–E4, E6, E8 y E12 por ADR-0012 y sus pruebas Playwright + axe;
este estándar no le cambia nada, solo extiende el mismo nivel a `mi-app-qr/client`.

## 2. Cómo se hizo la auditoría

- **Fecha y versión:** 2026-10-11, `main` en `9e4f6ff`.
- **Herramienta automática:** axe-core 4.13.0 (la misma de `verifier-web/`), con las
  reglas WCAG 2.0/2.1/2.2 A y AA más las de buenas prácticas.
- **Navegador:** Chromium 124 (el de Electron 30), conducido con Playwright contra el
  servidor y el cliente reales, con sesión de administrador y registros de prueba
  sintéticos.
- **Pruebas de comportamiento:** recorrido con Tab por cada pantalla, comparación del
  estilo de cada control con y sin foco, apertura y cierre de cada diálogo con teclado,
  envío de formularios vacíos o con errores, y anchos de 1280, 390 y 320 px.
- **Revisión de código** de cada página y componente para lo que axe no detecta.

**Límites:** no se probó con lectores de pantalla reales (NVDA, JAWS, VoiceOver) ni con
el modo de alto contraste de Windows. axe detecta solo una parte de los problemas; por
eso se combinó con las pruebas manuales.

## 3. Auditoría de `mi-app-qr/client`

Leyenda: ✅ cumple · ⚠️ cumple con reparos · ❌ no cumple.

### Común a todas las pantallas (barra lateral y estructura)

| Criterio | Estado | Evidencia |
|---|---|---|
| E1 Contraste | ✅ | axe sin violaciones de contraste en ninguna pantalla, tampoco en el texto `muted-foreground` |
| E2 Teclado | ✅ | Navegación, cerrar sesión y todas las acciones alcanzables con Tab, en orden de lectura |
| E3 Foco visible | ✅ | Todos los controles cambian de estilo al recibir foco. Botones, enlaces y campos usan el anillo `ring`; los `<select>` de Registros y Usuarios no tienen clases de foco y dependen del contorno por defecto del navegador, que es visible pero inconsistente con el resto |
| E9 Idioma | ✅ | `index.html` declara `lang="es"` |
| E10 Título | ❌ | Todas las rutas comparten `<title>Registro QR</title>` |
| E11 Estructura | ✅ | `<main>`, `<nav aria-label="Navegación principal">`, `aria-current="page"` en el enlace activo; `h1` en la barra y `h2`/`h3` en cada página |
| E12 Reflujo | ✅ | Sin desplazamiento horizontal a 320 px en Dashboard, Registros, Informes y Usuarios |
| E8 Movimiento | ✅ | Solo transiciones de color; no hay animaciones en uso |
| E13 Objetivos | ✅ | axe (regla `target-size`) sin violaciones |

### Inicio de sesión (`LoginPage`)

| Criterio | Estado | Evidencia |
|---|---|---|
| E5 Formularios | ❌ | Los mensajes "El usuario es obligatorio" no están ligados al campo (`aria-describedby`) y el campo no se marca `aria-invalid` |
| E6 Mensajes | ❌ | El error del servidor (contraseña incorrecta, por ejemplo) aparece como texto sin `role="alert"`: un lector de pantalla no lo anuncia |
| E11 Estructura | ❌ | axe: la página no tiene `<main>` y su contenido queda fuera de regiones (`landmark-one-main`, `region`) |

### Dashboard

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones |
| E7 Sin ruido | ⚠️ | Las 4 métricas tienen `aria-live="polite"` y se actualizan con el sondeo de 7 s: en un día con tráfico, el lector anunciaría números continuamente |
| Tabla | ✅ | Contenedor desplazable con `tabindex`, nombre accesible y foco visible |

### Registros (`RegistrosPage`)

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones |
| E5 Formularios | ⚠️ | Los campos se marcan `aria-invalid`, pero sin `aria-describedby`; además se muestra un solo mensaje para todos los errores, debajo del formulario |
| E6 Mensajes | ✅ | Errores al guardar con `role="alert"`; la carga desde QR con `role="status"` |
| E14 Nombres únicos | ⚠️ | "Ver historial de Ana Pérez" es específico, pero cada fila tiene un botón llamado solo "Corregir" |
| Estados | ✅ | Cargando, vacío, error con "Reintentar" |

### Diálogo "Corregir registro" (`CorregirRegistroModal`)

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones estáticas |
| E4 Diálogos | ❌ | **El hallazgo más serio.** Al abrirlo, el foco se queda en la tabla de atrás; con Tab se recorren los botones de las filas antes de llegar al formulario; Escape no lo cierra; al cerrarlo el foco no vuelve al botón "Corregir". El componente no usa `useModalFocus`, que los otros tres diálogos sí usan. Además declara `aria-modal="true"` sin serlo en la práctica |
| E5 Formularios | ⚠️ | Etiquetas correctas, pero los errores no están ligados a sus campos |

### Diálogos de historial, exportación y salida olvidada

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones |
| E4 Diálogos | ✅ | Usan `useModalFocus`. Comprobado en vivo: el foco entra en los tres; Escape cierra historial y exportación; al cerrar historial el foco vuelve a su botón. Salida olvidada usa el mismo hook |

### Informes (`InformesPage`)

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones |
| E6/E7 | ✅ | El conteo de resultados usa `aria-live="polite"` y solo cambia cuando la persona filtra |
| Filtros | ✅ | Etiquetados, en orden de lectura, con foco visible |

### Usuarios (`UsuariosPage`)

| Criterio | Estado | Evidencia |
|---|---|---|
| axe | ✅ | Sin violaciones |
| E5 Formularios | ❌ | Errores sin `aria-invalid` ni `aria-describedby` |
| E6 Mensajes | ❌ | La contraseña generada del usuario nuevo ("cópiala ahora, no se volverá a mostrar") aparece sin `role="status"`: un lector de pantalla no la anuncia, y es información que solo se muestra una vez |

### Hallazgos priorizados

| Prioridad | Hallazgo | Criterio |
|---|---|---|
| Alta | El diálogo de corrección no gestiona el foco ni cierra con Escape | E4 |
| Media | La contraseña generada en Usuarios no se anuncia | E6 |
| Media | El error de inicio de sesión no se anuncia | E6 |
| Media | Errores de formulario no ligados a sus campos (login, registros, corrección, usuarios) | E5 |
| Media | Título de página igual en todas las rutas | E10 |
| Baja | Login sin `<main>` | E11 |
| Baja | Métricas del Dashboard anunciadas con cada sondeo | E7 |
| Baja | Botón "Corregir" con el mismo nombre en cada fila | E14 |
| Baja | `<select>` sin el estilo de foco del resto de controles | E3 |

Los arreglos se reparten después, como trabajo de implementación aparte.

## 4. Lista de revisión para cada PR que toque interfaz

1. ¿Se puede completar todo con teclado, y el foco se ve en cada paso?
2. Si abre un diálogo: ¿usa `useModalFocus` (foco adentro, Tab contenido, Escape, foco de vuelta)?
3. ¿Cada campo nuevo tiene `<label>`, y su error usa `aria-invalid` + `aria-describedby`?
4. ¿Los errores y confirmaciones nuevos usan `role="alert"` o `role="status"`?
5. ¿Un `aria-live` nuevo se dispara solo por acciones de la persona, no por el sondeo?
6. ¿Funciona a 320 px de ancho sin desplazamiento horizontal?
7. ¿Los botones repetidos dicen sobre qué actúan?
8. ¿Pasa axe sin violaciones nuevas?

## 5. Herramientas: propuesta

- **Extender Playwright + axe a `mi-app-qr/client`**, como ya hace `verifier-web/`, con un
  job de CI que recorra las cuatro pantallas y los diálogos con sesión y datos
  sintéticos. La auditoría de este documento muestra que es viable: se hizo así, con el
  servidor real.
- **Pruebas de comportamiento en Testing Library** para cada diálogo (foco inicial,
  Escape, foco de vuelta), porque axe no las detecta: el diálogo de corrección pasa axe
  sin violaciones y aun así es el hallazgo más grave.
- **Revisión manual** con la lista de la sección 4 para lo que no se automatiza, y una
  pasada con NVDA antes del piloto en el CCAV Pitalito.

## 6. Para decidir entre los dos autores

1. ¿WCAG 2.2 AA como referencia, o 2.1 AA (la que cita ADR-0012)?
2. ¿E7 (sin ruido) y E14 (nombres únicos) quedan como deseables u obligatorios?
3. ¿Se adopta el job de Playwright + axe en CI para `mi-app-qr/client`, o por ahora
   solo la lista manual?
4. ¿La prueba con lector de pantalla antes del piloto es requisito o recomendación?
