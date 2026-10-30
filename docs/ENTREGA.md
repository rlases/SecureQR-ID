# Registro de entrega y criterios de cierre

## `v0.3.0`: evaluación controlada

La versión de Fase 4 corresponde al código integrado en `main` hasta
`2d09e4edc9156ba86e0c0a13448720949128a782` (PR #159, #165 y #166 incluidos).
La etiqueta de fase es independiente de la versión del paquete Electron.

| Evidencia | Estado comprobado |
|---|---|
| Cinco módulos y verificador web | Implementados e integrados |
| Batería oficial con Fabric | 3400/3400 ataques detectados; 0/1000 falsos rechazos |
| Comparación con `baseline-o3` | Archivos comunes, métricas y procedencia conservados |
| Flujo conjunto de ambos brazos | Probado con Fabric en [40808907607](https://github.com/rlases/SecureQR-ID/actions/runs/40808907607) |
| CI funcional del código de `main` | [40810867311](https://github.com/rlases/SecureQR-ID/actions/runs/40810867311) y [40811758348](https://github.com/rlases/SecureQR-ID/actions/runs/40811758348), correctos |
| Cambio posterior a `6eeef12` | Solo `docs/STATE.md`, documentado en #165 |
| Informe desarrollado | [RESULTADOS-OBJETIVO-3.md](RESULTADOS-OBJETIVO-3.md) |
| Manuales desarrollados | [Técnico](MANUAL-TECNICO.md) y [usuario](MANUAL-USUARIO.md) |

Los documentos nuevos se integran por PR y revisión cruzada. La publicación de una
versión no constituye una aprobación de código nuevo ni modifica las protecciones de
`main`. Las [notas de versión](releases/v0.3.0.md) indican qué revisión contienen.

El informe documenta el objetivo 3 en laboratorio. No sustituye el documento de grado
completo ni acredita por sí mismo conformidad editorial APA 7 de sus demás capítulos.

## Evidencia de una entrega ejecutable

La publicación `v0.3.0` conserva fuentes y resultados. No se ofrece su evidencia ZIP
como si fuera un instalador. La disponibilidad de un instalador aceptado en una
máquina Windows limpia es un criterio separado de la entrega final `v1.0.0`.

Para esa comprobación se debe usar un equipo o VM desechable autorizado, sin bases,
cuentas ni claves de una instalación real. No se prueba sobre un perfil de producción.

| Paso | Resultado que se debe conservar | Estado |
|---|---|---|
| Registrar revisión, Node, Electron, Windows y arquitectura | Metadatos de compilación, log y SHA-256 del instalador | Pendiente |
| Instalar el NSIS en Windows sin dependencias de desarrollo | Instalación completada y ruta del ejecutable | Pendiente |
| Primer arranque con perfil nuevo | Servidor HTTPS sano; cliente visible; credenciales iniciales entregadas de forma privada | Pendiente |
| Crear cuenta y registro sintéticos | Inicio/cierre de sesión, registro e informe correctos | Pendiente |
| Cerrar y volver a abrir | Datos y certificado persisten; no se regenera la clave HMAC | Pendiente |
| Comprobar módulo nativo empaquetado | Arranque sin error de ABI de `better-sqlite3` | Pendiente |
| Configurar emisor de prueba por separado | Portal genera un QR y servicio real lo valida | Pendiente |
| Confirmar errores de dependencia | Sin emisor no se entrega QR; fallo del servicio no se presenta como aceptación | Pendiente |
| Retirar instalación de prueba | Desinstalación documentada y tratamiento explícito del perfil de datos | Pendiente |

No se adjuntan a la entrega `server-secrets.json`, PEM privados, bases con titulares,
tokens vigentes ni contraseñas de prueba. El informe público registra resultados y
hashes; el material efímero del ensayo se destruye al terminar.

## Cierre de `v1.0.0`

- [ ] Integrar por revisión cruzada el informe y los manuales.
- [ ] Registrar la prueba del instalador y resolver cualquier fallo reproducible.
- [ ] Reunir el documento de grado completo; incorporar resultados, límites,
      referencias y anexos con revisión editorial APA 7.
- [ ] Comprobar que todos los enlaces y archivos de la entrega corresponden a la
      revisión publicada, sin material privado ni resultados atribuidos a otra versión.
- [ ] Publicar la entrega final con su commit, notas, instalador aceptado y hashes.

La instalación del CCAV (#133), el piloto con participantes y su capacitación en sede
son opcionales. No se añaden a esta lista como bloqueos técnicos. Si se realizan,
se documentan de forma separada con [INSTALACION-CCAV.md](INSTALACION-CCAV.md) y
[PROTOCOLO-PILOTO.md](PROTOCOLO-PILOTO.md).

El DOI y los envíos a revistas o congresos pertenecen a la etapa posterior al grado
según [ROADMAP.md](ROADMAP.md); no se presentan aquí como publicaciones realizadas.
