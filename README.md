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
| [`verifier-web/`](verifier-web/) | Portal accesible de escaneo; captura el token y consume el verificador sin persistir datos sensibles | En desarrollo — issue #30 |
| `evidence-log/` | Bitácora local de eventos encadenada por hash | Pendiente |
| `anchor/` | Construcción del árbol de Merkle y anclaje periódico en Hyperledger Fabric | Pendiente — ver ADR-0007 |
| `revocation/` | Lista de revocación firmada y su distribución a los verificadores | Pendiente |
| [`mi-app-qr/`](mi-app-qr/) | Prototipo de escritorio ya funcional: registro de asistencia por QR de texto plano, sin las capas de seguridad de este diseño. Línea base para la evaluación comparativa (Fase 4). | Hecho, sin cifrado |
| `docs/` | Arquitectura, decisiones, modelo de amenazas, especificación del formato | En curso |

## Documentación

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

## Instalación

### Prototipo `mi-app-qr/` (funcional hoy)

```bash
git clone https://github.com/rlases/SecureQR-ID.git
cd SecureQR-ID/mi-app-qr
npm install
npm run electron-dev   # modo desarrollo
npm run dist           # empaqueta el instalador de escritorio
```

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
python -m pip install -e ../issuer -e ".[test]"
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

**Fase actual:** diseño y desarrollo tecnológico. `issuer/` y `verifier/` forman el
núcleo criptográfico funcional; `verifier-web/` incorpora el flujo visual de escaneo y
`mi-app-qr/` sigue siendo la línea base de registro por QR sin esas capas de seguridad.
El detalle vive en [`docs/STATE.md`](docs/STATE.md), que se actualiza al cierre de cada
sesión de trabajo.

## Seguridad

Este repositorio implementa (o implementará) primitivas criptográficas. Antes de
contribuir o desplegar, lee [`SECURITY.md`](SECURITY.md). **Nunca** commitees claves
privadas, tokens reales ni datos personales de estudiantes.

## Citar este trabajo

Usa el botón *Cite this repository* de GitHub o el archivo [`CITATION.cff`](CITATION.cff).

## Licencia

Apache-2.0 — ver [`LICENSE`](LICENSE).
Sujeto a verificación frente al reglamento de propiedad intelectual de la UNAD para
trabajos de grado.

## Autores

- Duverney Torres Figueroa — <dtorresfi@unadvirtual.edu.co>
- <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/authors/rlases-icon-dark.png"><img src="docs/assets/authors/rlases-icon-light.png" width="16" height="16" alt=""></picture>
  Jhunier Libardo Hernández Calderón — <jlhernandezcal@unadvirtual.edu.co> —
  [rlases.dev](https://rlases.dev) · [@rlases](https://github.com/rlases)

Asesor: Edgar Roberto Dulce Villareal
