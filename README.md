# SecureQR-ID

Modelo criptográfico de validación de credenciales QR organizacionales: firma ECDSA,
tokens efímeros anti-replay, bitácora de eventos encadenada por hash y anclaje periódico
de raíces de Merkle en blockchain permisionada.

> **Prototipo de investigación.** Trabajo de grado, Maestría en Ciberseguridad,
> Escuela de Ciencias Básicas, Tecnología e Ingeniería (ECBTI),
> Universidad Nacional Abierta y a Distancia (UNAD). 2026.
> **No apto para producción sin auditoría criptográfica independiente.**

---

## El problema

Las credenciales QR institucionales suelen almacenar datos en texto plano o sin firma.
Cualquiera puede leerlas, clonarlas y reutilizarlas. Y los registros de acceso que
generan viven en bases de datos que un administrador puede modificar sin dejar rastro.

SecureQR-ID ataca las tres propiedades a la vez —**autenticidad, integridad y
trazabilidad verificable**— en un solo flujo, en lugar de resolverlas por separado como
hace la literatura existente.

## Cómo funciona

```
Emisión            Validación               Registro              Anclaje
────────           ──────────               ────────              ───────
issuer             verifier                 evidence-log          anchor
  │                   │                        │                    │
  │ firma ECDSA       │ verifica firma         │ hash del evento    │ árbol de Merkle
  │ + nonce           │ + frescura del nonce   │ + hash anterior    │ cada N eventos
  │ + expiración      │ + lista de revocación  │ = cadena local     │ → Hyperledger Fabric
  ▼                   ▼                        ▼                    ▼
token SQRID/1      accept / reject          bitácora encadenada   raíz anclada
```

Ningún dato personal viaja a la blockchain: solo la raíz de Merkle. La verificación de
un evento puntual se hace recalculando el camino desde su hash hasta la raíz anclada.

## Módulos

| Módulo | Responsabilidad | Estado |
|---|---|---|
| [`issuer/`](issuer/) | Emisión y firma ECDSA de tokens QR; gestión del par de claves institucional | Implementado y probado — issue #5 |
| [`verifier/`](verifier/) | Motor del portal de escaneo; verifica firma, marca temporal, nonce y revocación | Implementado y probado — issue #6 |
| [`verifier-web/`](verifier-web/) | Portal accesible de escaneo; captura el token y consume el verificador sin persistir datos sensibles | Implementado y probado |
| [`evidence-log/`](evidence-log/) | Bitácora local de eventos encadenada por hash | Implementado e integrado |
| [`anchor/`](anchor/) | Merkle, anclaje real en Fabric y comandos de sellado OpenTimestamps | Implementado; integración Fabric probada |
| [`revocation/`](revocation/) | Lista firmada, recarga y distribución a los verificadores | Implementado e integrado |
| [`verifier-service/`](verifier-service/) | Servicio HTTP que compone verificador, revocación y bitácora | Implementado y probado |
| [`mi-app-qr/`](mi-app-qr/) | Registros administrativos, titulares y portal que solicita QR al emisor local | Implementado; cliente y servidor con pruebas |
| [`evaluation/`](evaluation/) | Batería controlada, brazo tradicional e informe comparable | Implementado; evidencia conservada |
| [`docs/`](docs/) | Arquitectura, resultados, manuales y criterios de entrega | Documentación de cierre preparada |

La línea base tradicional se conserva en la etiqueta `baseline-o3`; no es el estado
actual de `mi-app-qr`. La emisión, la verificación y el registro administrativo
mantienen sus límites de proceso y sus funciones separadas.

## Documentación

**Alcance del desarrollo:** la instalación en el CCAV Pitalito es un agregado opcional
que se realizará si es viable. El desarrollo completo, la evaluación controlada del
objetivo 3 y su documentación no dependen de instalar el sistema en esa sede.
Ver la aclaración de alcance en [`docs/ROADMAP.md`](docs/ROADMAP.md) y ADR-0019.

Lee esto antes de tocar código:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — cómo está montado el sistema
- [`docs/SQRID-1.md`](docs/SQRID-1.md) — especificación del formato de token `SQRID/1`
- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) — amenazas y controles asociados
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisiones de diseño y su justificación (ADR)
- [`docs/STATE.md`](docs/STATE.md) — qué está hecho, a medias y pendiente
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plan por fases
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — vocabulario del dominio
- [`docs/raw/`](docs/raw/) — material fuente destilado (propuesta de grado, entregas por etapa, artículo SMS)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — cómo trabajamos: ramas, PR, revisión cruzada y pruebas

Para utilizar, evaluar o entregar el sistema:

- [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) — titulares, operadores y administradores.
- [`docs/MANUAL-TECNICO.md`](docs/MANUAL-TECNICO.md) — instalación, custodia, operación y recuperación.
- [`docs/RESULTADOS-OBJETIVO-3.md`](docs/RESULTADOS-OBJETIVO-3.md) — método, métricas, comparación y límites.
- [`evaluation/evidencia/2026-10-28/README.md`](evaluation/evidencia/2026-10-28/README.md) — datos originales y reproducción.
- [`docs/ENTREGA.md`](docs/ENTREGA.md) — aceptación del instalador y pendientes reales de `v1.0.0`.

## Instalación

### Cliente administrativo `mi-app-qr/`

```bash
git clone https://github.com/rlases/SecureQR-ID.git
cd SecureQR-ID
npm --prefix mi-app-qr ci
npm --prefix mi-app-qr/server ci
npm --prefix mi-app-qr/client ci
npm --prefix mi-app-qr/server run build
npm --prefix mi-app-qr/client run build
npm --prefix mi-app-qr run electron-dev
```

Electron utiliza el cliente de `mi-app-qr/client` y el servidor compilados. El emisor
Python se configura y arranca por separado. El empaquetado Windows y sus límites se
describen en el [manual técnico](docs/MANUAL-TECNICO.md).

### Emisor criptográfico `issuer/`

```bash
cd SecureQR-ID/issuer
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -e ".[test]"
python -m pytest
```

La configuración de claves y los comandos de emisión están documentados en
[`issuer/README.md`](issuer/README.md).

### Verificador criptográfico `verifier/`

```bash
cd SecureQR-ID/verifier
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -e ../issuer -e ../evidence-log -e ".[test]"
python -m pytest
```

La configuración obligatoria de claves confiables, almacenamiento de replay, reloj y
revocación está documentada en [`verifier/README.md`](verifier/README.md). `issuer/` se
instala en el comando anterior solo para las pruebas de interoperabilidad; no es una
dependencia de producción del verificador.

### Portal de escaneo `verifier-web/`

```bash
cd SecureQR-ID/verifier-web
npm ci
npm run dev
```

El portal requiere una API en `/api`. La guía para levantar el fixture visual local o
conectarlo al adaptador real está en [`verifier-web/README.md`](verifier-web/README.md).

## Estado

**Fase 4 completada técnicamente:** módulos integrados, batería y comparación
controladas. La corrida oficial detectó 3400/3400 ataques del catálogo, con 0/1000
falsos rechazos. Son resultados de laboratorio, con los límites y procedencias del
[informe](docs/RESULTADOS-OBJETIVO-3.md).

**Fase 5:** documentación de entrega, validación del instalador y documento de grado
completo. La publicación `v0.3.0` identifica la evaluación; `v1.0.0` requiere los
criterios de [ENTREGA.md](docs/ENTREGA.md). El estado y los pendientes reales se
mantienen en [`docs/STATE.md`](docs/STATE.md).

## Seguridad

Este repositorio utiliza bibliotecas criptográficas establecidas. Antes de
contribuir o desplegar, lee [`SECURITY.md`](SECURITY.md). **Nunca** commitees claves
privadas, tokens reales ni datos personales de estudiantes.

## Citar este trabajo

Usa el botón *Cite this repository* de GitHub o el archivo [`CITATION.cff`](CITATION.cff).

## Licencia

**Todos los derechos reservados** — ver [`LICENSE`](LICENSE). No se permite usar, copiar,
modificar ni distribuir este proyecto sin autorización previa y por escrito de sus
autores. Sujeto a verificación frente al reglamento de propiedad intelectual de la UNAD
para trabajos de grado.

## Autores

- Duverney Torres Figueroa — <dtorresfi@unadvirtual.edu.co>
- <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/authors/rlases-icon-dark.png"><img src="docs/assets/authors/rlases-icon-light.png" width="16" height="16" alt=""></picture>
  Jhunier Libardo Hernández Calderón — <jlhernandezcal@unadvirtual.edu.co> —
  [rlases.dev](https://rlases.dev) · [@rlases](https://github.com/rlases)

Asesor: Edgar Roberto Dulce Villareal
