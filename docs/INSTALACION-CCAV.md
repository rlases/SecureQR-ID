# Instalación del piloto en el servidor del CCAV Pitalito

Guía operativa para dejar SecureQR-ID funcionando en el servidor del CCAV (issue #133).
Reúne lo que está repartido en los README de cada módulo y en ADR-0008 y ADR-0014 a ADR-0018.
También incluye los pendientes que salieron de las revisiones de #121 a #126 y #131.

> **Estado:** escrita y probada por partes fuera del CCAV. La red Fabric, el ciclo de
> anclaje y el hash del último bloque se probaron con Docker contra una red real. El
> arranque del servidor de `mi-app-qr` se probó con el entorno que arma Electron. **Nadie
> la ha seguido todavía en el servidor del CCAV.** Al hacerlo, completa el
> [registro de ejecución](#registro-de-ejecución) al final y corrige aquí lo que no
> coincida.

Rutas de ejemplo para Linux. En Windows, las equivalentes están en los README enlazados.

---

## 0. Antes de ir a la sede

| Requisito | Para qué |
|---|---|
| Equipo servidor con 8 GB de RAM o más (Fabric usa unos 4 GB) | Todo corre en el mismo equipo |
| **IP fija** en la red del CCAV (reserva de DHCP o dirección estática) | El certificado autofirmado se regenera si cambia la IP, y con él la huella publicada (ADR-0008, ADR-0016) |
| **Disco cifrado** (LUKS2 o BitLocker) desde la instalación del sistema operativo | Las bases quedan en claro en el disco sin él (ADR-0018) |
| Docker Engine, `git`, `curl`, Go (solo para empaquetar el contrato) | Red Fabric (`infra/fabric/README.md`) |
| `age` (`apt install age`) | Respaldo diario cifrado de las bases (§11) |
| Python 3.11 o superior | `issuer/`, `evidence-log/`, `revocation/`, `verifier-service/` |
| Node.js 22 | `anchor/`, `verifier-web/` |
| Instalador de la app de escritorio `mi-app-qr` (Registro QR), versión con #131 | Registro de credenciales y portal del titular |
| Dos medios externos para respaldos, que no sean equipos de trabajo | Custodia de claves y respaldo de Fabric |
| Gestor de contraseñas de Jhunier listo para recibir copias | Respaldo de contraseñas (ADR-0016, punto 6) |

### Cifrado del disco (ADR-0018)

La base de `mi-app-qr` (`~secureqr/.config/registro-qr/server-data/app.db`) guarda nombres,
documentos y correos en claro, y la bitácora guarda el `cid` de cada validación. La
aplicación no las cifra: las protege el cifrado del disco completo. Se configura **al
instalar el sistema operativo**, antes de crear ningún dato; después ya no se puede
activar sin reinstalar o sin una conversión arriesgada.

- **Linux:** en el instalador (Ubuntu: «Funciones avanzadas» → «Usar LVM y cifrado»), que
  crea un volumen LUKS2. Comprobación: `lsblk -f` muestra `crypto_LUKS` bajo el disco
  del sistema.
- **Windows:** BitLocker con **TPM y PIN de arranque** (no solo TPM). Comprobación:
  `manage-bde -status C:` dice `Protección activada`.
- **Frase de paso o PIN:** la escribe el custodio al encender el equipo. **No** se
  configura desbloqueo automático con TPM sin PIN: quien se lleve el equipo entero lo
  arrancaría con el disco abierto.
- La frase de paso y la clave de recuperación (BitLocker) van al gestor de Jhunier, nunca
  en el servidor ni en el medio de respaldos.

El cifrado de disco protege el equipo apagado o robado, no el equipo encendido. Contra
eso siguen las cuentas separadas (§1) y el HMAC del historial.

---

## 1. Cuentas del sistema operativo

Cada cuenta lee solo lo suyo. Es lo que impide que `mi-app-qr` llegue a la clave de emisión.

| Cuenta | Ejecuta | Puede leer |
|---|---|---|
| `secureqr-issuer` | `secureqr-issuer serve` | El PEM de emisión (`0600`) y el secreto compartido |
| `secureqr` | `mi-app-qr`, `verifier-service`, el ciclo de `evidence-log` y el sellado | El secreto compartido (por grupo, `0640`), sus bases y la carpeta de anclaje |
| Custodio (Duverney) | Arranca el emisor y refirma la lista de revocación | Las contraseñas de las claves; nunca quedan escritas en el servidor |

```bash
sudo useradd --system --home /var/lib/secureqr-issuer --shell /usr/sbin/nologin secureqr-issuer
sudo useradd --system --create-home --home /var/lib/secureqr-id secureqr
sudo install -d -o secureqr-issuer -g secureqr-issuer -m 0700 /var/lib/secureqr-issuer
sudo install -d -o secureqr -g secureqr -m 0750 /var/lib/secureqr-id/anclaje /var/lib/secureqr-id/sellos
sudo install -d -o secureqr -g secureqr -m 0750 /var/log/secureqr-id
```

---

## 2. Red Fabric (una sola vez)

Detalle completo en [`infra/fabric/README.md`](../infra/fabric/README.md).

```bash
sudo -u secureqr env SQRID_FABRIC_HOME=/var/lib/secureqr-id/fabric infra/fabric/crear-red.sh
sudo -u secureqr env SQRID_FABRIC_HOME=/var/lib/secureqr-id/fabric infra/fabric/probar-persistencia.sh
```

- **Nunca** `network.sh down` ni `network.sh up`: borran el ledger.
- Los contenedores quedan con reinicio `unless-stopped` y vuelven solos tras un reinicio del servidor.
- **Respaldo inicial**, apenas creada la red, y luego **uno por semana**:

```bash
infra/fabric/detener-red.sh
infra/fabric/respaldar-red.sh /media/respaldo/fabric
infra/fabric/arrancar-red.sh
```

  El respaldo contiene claves privadas de la red: el medio se cifra y lo guarda el custodio.

- Guarda las variables `SQRID_FABRIC_*` que imprime `infra/fabric/entorno-anchor.sh`, en
  `/etc/secureqr-id/anchor.env` (dueño `secureqr`, `0600`). Las usa el ciclo de anclaje.

---

## 3. Claves y secretos

Se crean una vez, en la sede, con el custodio presente.

| Qué | Cómo se crea | Dónde vive | Respaldo | Si se pierde |
|---|---|---|---|---|
| Clave de **emisión** (PEM cifrado) | `secureqr-issuer generate-key` (`issuer/README.md`) | `/var/lib/secureqr-issuer/emision.pem`, `0600`, cuenta `secureqr-issuer` | PEM cifrado en un medio externo; su contraseña, en el gestor de Jhunier | Hay que emitir con una clave nueva y distribuir la pública a los puntos de control |
| Clave de **revocación** (distinta, con otra contraseña) | `secureqr-revocation generate-key` (`revocation/README.md`) | Fuera del servidor, con el custodio; la pública va a `SQRID_REVOCATION_KEYS_DIR` | Igual que la de emisión; Jhunier firma con el respaldo si pasan 24 h sin refirmado (ADR-0016) | Vencida la lista (48 a 72 h), **todos los puntos de control rechazan** |
| **Secreto compartido** del emisor | `secureqr-issuer generate-secret --output /var/lib/secureqr-issuer/issuer.secret` | Dueño `secureqr-issuer`, grupo `secureqr`, `0640` | No hace falta: se regenera y se reinician emisor y `mi-app-qr` | El portal deja de entregar QR hasta regenerarlo |
| `ASIGNACIONES_KEY` (HMAC del historial cid → titular) | La crea `mi-app-qr` al primer arranque, en `server-secrets.json` | `userData` de `mi-app-qr` (ver §5), fuera de `server-data/` | **Copia en un medio externo, separada del respaldo de la base** | Toda consulta cid → persona responde **503** por integridad |
| Certificado TLS de `mi-app-qr` | Lo genera `mi-app-qr` (ADR-0008) | `userData/tls/` | No hace falta; se regenera | Cambia la huella publicada: hay que reemplazar el cartel |
| Material criptográfico de Fabric | `crear-red.sh` | `/var/lib/secureqr-id/fabric` | Respaldo semanal cifrado (§2) | No se puede seguir anclando en esa red |
| Identidad de **respaldo** (`age`) | `age-keygen \| age -p > respaldo.age.key.age`, en el equipo del custodio (§11) | **Fuera del servidor**, con el custodio; en el servidor solo su pública, `/etc/secureqr-id/respaldo.age.pub` | Copia en el medio externo de claves; su frase de paso, en el gestor de Jhunier | No se pueden descifrar los respaldos de las bases |
| Frase de paso del **disco** (LUKS o BitLocker) | Al instalar el sistema (§0) | La escribe el custodio al encender | Gestor de Jhunier, con la clave de recuperación de BitLocker | Sin ella el servidor no arranca y los datos son irrecuperables |

> Ningún respaldo de claves va en el mismo medio que el respaldo de la base de
> `mi-app-qr` o de la bitácora. Quien tenga la base y la clave HMAC juntas puede
> reescribir el historial sin que el HMAC lo note (riesgo residual de #119).

---

## 4. Servicio de emisión

Lo arranca **el custodio**, no la app de escritorio (ADR-0016, punto 6; #131). Escribe la
contraseña una sola vez y la clave queda solo en la memoria del proceso.

```bash
sudo -u secureqr-issuer env \
  SQRID_PRIVATE_KEY_PATH=/var/lib/secureqr-issuer/emision.pem \
  SQRID_TOKEN_TTL_SECONDS=60 \
  SQRID_ISSUER_SECRET_FILE=/var/lib/secureqr-issuer/issuer.secret \
  secureqr-issuer serve --port 8765
```

- Escucha solo en `127.0.0.1`.
- Comprobación: `curl http://127.0.0.1:8765/health` responde `{"status": "ready"}`.
- **Tras cada reinicio del servidor hay que volver a arrancarlo.** Mientras tanto, el
  portal no entrega QR, aunque todo lo demás funcione.

---

## 5. `mi-app-qr` (registro de credenciales y portal)

1. Instala la app con la cuenta `secureqr`. Su `userData` queda en
   `~secureqr/.config/registro-qr/` (en Windows, `%APPDATA%\registro-qr\`).
2. Antes del primer arranque, crea `userData/config.json` (#131):

   ```json
   {
     "emisor": {
       "url": "http://127.0.0.1:8765",
       "archivoSecreto": "/var/lib/secureqr-issuer/issuer.secret"
     },
     "anclaje": {
       "cabeza": "/var/lib/secureqr-id/anclaje/cabeza-asignaciones.json",
       "compromisos": "/var/lib/secureqr-id/anclaje/compromisos.json",
       "estado": "/var/lib/secureqr-id/anclaje/estado.json"
     },
     "revocadosPath": "/var/lib/secureqr-id/revocados.txt",
     "zonaHoraria": "America/Bogota"
   }
   ```

   Sin `config.json`, la app usa `userData/issuer.secret` y `userData/anclaje/`. Si no
   encuentra el secreto, arranca igual, pero avisa que el portal no entregará QR.

3. **Primer arranque.** Anota la contraseña inicial del `admin` que muestra y cámbiala.
4. **Respaldo de la clave HMAC.** Copia `server-secrets.json` (contiene `ASIGNACIONES_KEY`)
   al medio externo de claves (§3).
5. **Huella del certificado.** Ábrela en la página de alta del portal, que la muestra con
   su fecha y explica a los titulares cómo compararla con la del navegador. Publícala en
   el cartel de la sede (ADR-0016).
6. **Prueba del portal.** Desde un teléfono en el Wi-Fi del CCAV:
   - se registra un titular de prueba;
   - el `admin` confirma su estamento;
   - la página del QR muestra un código que se renueva solo.

   Luego:
   - [ ] el QR se valida en un punto de control (§6);
   - [ ] aparece `cabeza-asignaciones.json` en la carpeta de anclaje.

**Límite de altas por IP.** `ALTA_MAX_POR_IP` (10 por hora por defecto, #120) es una
variable de entorno del sistema para la cuenta `secureqr`, no de `config.json`. Ver §8.

---

## 6. Punto de control: `verifier-service` y `verifier-web`

- **`verifier-service`:** se instala según [`verifier-service/README.md`](../verifier-service/README.md), con la cuenta `secureqr`.
  - `SQRID_VERIFIER_ID=ccav-pitalito-porteria-1`; su bitácora es la que ancla el ciclo (§7).
  - `SQRID_TRUSTED_KEYS_DIR` lleva la clave pública de **emisión**.
  - `SQRID_REVOCATION_KEYS_DIR`, otro directorio, lleva la pública de **revocación**.
- **`verifier-web`:** se sirve bajo el mismo origen HTTPS que la API (ADR-0012), con la
  terminación TLS delante de `verifier-service`. Sobre HTTP plano la cámara no funciona
  fuera de `localhost`.
- **Lista de revocación:**
  - antes de abrir el punto de control, el custodio firma la primera lista (aunque esté vacía) con `secureqr-revocation sign`;
  - la cuenta `secureqr` la recibe por `python -m secureqr_verifier_service.sync` o copiada a mano.

---

## 7. Tareas programadas

Los paquetes de Python (`evidence-log`, `verifier-service` y sus dependencias, y
`opentimestamps-client` para el sellado) van en un entorno virtual,
`/opt/secureqr-id/.venv`. Cron corre con un `PATH` mínimo, así que las tareas usan la
ruta completa del intérprete de ese entorno, y `sellar.sh` lo recibe en `PYTHON` (y el
`PATH` para encontrar `ots`).

`/etc/cron.d/secureqr-id` (el sexto campo es la cuenta):

```cron
# Anclaje cada 15 minutos: registra la cabeza de asignaciones, fija el lote, ancla en
# Fabric y deja los compromisos para mi-app-qr (ADR-0017, #119).
*/15 * * * * secureqr . /etc/secureqr-id/anchor.env; /opt/secureqr-id/.venv/bin/python -m secureqr_evidence_log cycle --db /var/lib/secureqr-id/evidence.sqlite3 --verifier-id ccav-pitalito-porteria-1 --workdir /var/lib/secureqr-id/anclaje --status-file /var/lib/secureqr-id/anclaje/estado.json --anchor-command "node /opt/secureqr-id/anchor/dist/cli.js anclar" --head-file /var/lib/secureqr-id/anclaje/cabeza-asignaciones.json --commitments-file /var/lib/secureqr-id/anclaje/compromisos.json >> /var/log/secureqr-id/anclaje.log 2>&1

# Sellado diario en OpenTimestamps del hash del último bloque del canal (ADR-0017, punto 7).
17 3 * * * secureqr SQRID_FABRIC_HOME=/var/lib/secureqr-id/fabric PYTHON=/opt/secureqr-id/.venv/bin/python PATH=/opt/secureqr-id/.venv/bin:/usr/bin:/bin /opt/secureqr-id/infra/fabric/sellar.sh /var/lib/secureqr-id/sellos >> /var/log/secureqr-id/sellado.log 2>&1

# Respaldo diario cifrado de las dos bases (ADR-0018, §11).
41 2 * * * secureqr SQRID_RESPALDO_DESTINATARIOS=/etc/secureqr-id/respaldo.age.pub SQRID_APP_DB=/var/lib/secureqr-id/.config/registro-qr/server-data/app.db SQRID_EVIDENCE_DB=/var/lib/secureqr-id/evidence.sqlite3 SQRID_ANCLAJE_DIR=/var/lib/secureqr-id/anclaje PYTHON=/opt/secureqr-id/.venv/bin/python /opt/secureqr-id/infra/respaldo/respaldar-datos.sh /var/backups/secureqr-id >> /var/log/secureqr-id/respaldo.log 2>&1

# Sincronización de la lista de revocación publicada.
*/10 * * * * secureqr /opt/secureqr-id/.venv/bin/python -m secureqr_verifier_service.sync >> /var/log/secureqr-id/revocacion.log 2>&1
```

- `--db` es la misma base de la bitácora de `verifier-service` (`SQRID_EVIDENCE_DB_PATH`).
- `--head-file`, `--commitments-file` y `--status-file` son las rutas `cabeza`,
  `compromisos` y `estado` de `anclaje` en `config.json` (§5).
- **Códigos de salida del ciclo:**
  - `1`: Fabric no respondió; se reintenta solo.
  - `3`: **alerta**; hay que investigar. Incluye una cabeza de asignaciones que retrocede, por ejemplo tras restaurar un respaldo de `mi-app-qr`. Aun así, los pasos se anclan.
- **Refirmado diario de la lista de revocación.** No va en cron, porque necesita la
  contraseña de la clave de revocación. El custodio lo hace a mano cada día con
  `secureqr-revocation sign --input /var/lib/secureqr-id/revocados.txt …`
  (`revocation/README.md`). Así renueva el `iat` antes de que venza
  `SQRID_REVOCATION_MAX_AGE_SECONDS`.
- **Alerta de 2 horas sin anclar (#139).** `mi-app-qr` lee `estado.json` y el panel
  del `admin` muestra un aviso si hay eventos sin anclar desde hace más de 2 horas o
  si el ciclo dejó de escribir ese archivo. La alerta también queda en el log de la
  app. Si el aviso aparece, revisa `anclaje.log` y que la red Fabric esté arriba.

---

## 8. Red Wi-Fi del CCAV

Comprobarlo **antes** del día de inscripción:

- [ ] **NAT o portal cautivo.** ¿Los teléfonos llegan al servidor con su propia IP o todos
  con la misma? Para verlo, registra dos altas de prueba desde dos teléfonos y revisa
  qué IP quedó en la tabla `intentos_alta` de la base de `mi-app-qr`.
- [ ] **Si comparten IP,** `ALTA_MAX_POR_IP=10` se queda corto el día de inscripción.
  Súbelo durante esa jornada (por ejemplo, a 200), para la cuenta `secureqr` y
  reiniciando la app, y vuelve a 10 después. El límite frena el registro masivo desde
  un equipo, no desde muchos teléfonos (riesgo residual en `docs/THREAT-MODEL.md`).
- [ ] **Sin proxy inverso delante de `mi-app-qr`.** Sirve su propio HTTPS (ADR-0008) y
  hoy no configura `trust proxy`. Con un proxy delante, todas las altas parecerían venir
  de la IP del proxy y el límite por IP dejaría de distinguir equipos. Si algún día se
  pone uno, hay que añadir `trust proxy` al servidor antes.
- [ ] **Aislamiento de clientes del Wi-Fi.** El teléfono debe poder abrir la IP del servidor.
  Algunos puntos de acceso aíslan a los clientes entre sí.

---

## 9. Salida a internet para OpenTimestamps

El sellado necesita llegar a los calendarios públicos. Desde el servidor, con la cuenta `secureqr`:

```bash
for c in https://a.pool.opentimestamps.org https://b.pool.opentimestamps.org \
         https://a.pool.eternitywall.com https://ots.btc.catallaxy.com; do
  printf '%s ' "$c"; curl -sS -m 10 -o /dev/null -w '%{http_code}\n' "$c" || echo "sin respuesta"
done
```

Hacen falta al menos dos que respondan, porque `ots stamp` exige dos atestaciones. Sin
ellos, `sellar.sh` deja el bloque pendiente y sale con código 1. El anclaje y la
validación siguen sin cambios, y el sello se completa cuando vuelva la salida. Si la red
del CCAV bloquea esos hosts, pide la excepción a sistemas de la sede.

`ots verify` no se ejecuta en el servidor (necesita un nodo de Bitcoin). Se verifica
aparte, desde un equipo con Bitcoin Core podado (ADR-0017).

---

## 10. Después de cada reinicio del servidor

1. Fabric vuelve sola. Compruébalo con `infra/fabric/ultimo-bloque.sh`, que imprime 64 hex.
2. **El custodio arranca el servicio de emisión** (§4).
3. Abre `mi-app-qr`. La página de alta debe mostrar la misma huella del certificado; si cambió, reemplaza el cartel ese día.
4. `verifier-service` arranca con su servicio del sistema.
5. Revisa en `anclaje.log` que la siguiente corrida del ciclo termine en 0.

---

## 11. Respaldo diario de las bases (ADR-0018)

Respalda la base de `mi-app-qr` y la bitácora de `verifier-service`, con los archivos de
anclaje, cifrados con `age` hacia una clave pública. En el servidor no queda nada que
descifre el respaldo. **Nunca** incluye `server-secrets.json` (`ASIGNACIONES_KEY`) ni las
claves de §3.

**Una sola vez, en el equipo del custodio (no en el servidor):**

```bash
age-keygen | age -p > respaldo.age.key.age      # pide una frase de paso
age -d respaldo.age.key.age | age-keygen -y     # imprime la clave pública (age1…)
```

- Guarda `respaldo.age.key.age` en el medio externo de claves (§3) y su frase de paso
  en el gestor de Jhunier.
- Copia **solo la línea pública** (`age1…`) al servidor:

```bash
sudo install -d -m 0755 /etc/secureqr-id
echo 'age1…' | sudo tee /etc/secureqr-id/respaldo.age.pub
sudo install -d -o secureqr -g secureqr -m 0700 /var/backups/secureqr-id
```

El script se niega a usar un archivo de destinatarios que contenga una clave privada.

**Cada día**, cron lo corre a las 2:41 (§7). Copia las bases en caliente, comprueba su
integridad, cifra y conserva 14 días en `/var/backups/secureqr-id`. Revisa
`respaldo.log`: cada corrida termina con `respaldo en …`.

**Cada semana**, el custodio copia `/var/backups/secureqr-id/*.age` al medio externo,
junto con el respaldo de Fabric (§2). Es otro medio que el de las claves (§3).

**Prueba de restauración** (una vez al instalar y luego una vez al mes), en el equipo del
custodio o en el servidor con la identidad traída en el medio externo:

```bash
age -d respaldo.age.key.age > /dev/shm/respaldo.key     # pide la frase de paso
infra/respaldo/restaurar-datos.sh /var/backups/secureqr-id/secureqr-datos-<fecha>.tar.gz.age \
  /dev/shm/respaldo.key /tmp/restauracion
shred -u /dev/shm/respaldo.key
```

Deja las bases comprobadas en una carpeta nueva; no toca las que están en uso.

**Para reemplazar una base dañada:**

1. Cierra `mi-app-qr` y detén `verifier-service`.
2. Guarda aparte la base dañada (no la borres) y copia la restaurada en su lugar, con
   dueño `secureqr` y permisos `0600`.
3. Arranca de nuevo. Si restauraste `app.db`, la siguiente corrida del ciclo de anclaje
   devuelve el código 3 porque la cabeza de asignaciones retrocedió: es lo esperado.
4. Anota en `docs/STATE.md` la fecha, el respaldo usado y, si restauraste la bitácora,
   qué rango ya anclado quedó sin eventos locales.

---

## Registro de ejecución

Complétalo la primera vez que se siga esta guía en el servidor del CCAV. Con eso se cierra #133.

| Paso | Fecha | Quién | Resultado / desvío |
|---|---|---|---|
| §2 Red creada y persistencia probada | | | |
| §2 Primer respaldo de Fabric | | | |
| §3 Claves creadas y respaldadas | | | |
| §4 Emisor arrancado | | | |
| §5 Portal entrega QR a un teléfono | | | |
| §5 Cabeza de asignaciones escrita | | | |
| §6 QR validado en el punto de control | | | |
| §7 Primer ciclo de anclaje con código 0 | | | |
| §7 El panel del `admin` no muestra la alerta de anclaje | | | |
| §7 Primer sello (pendiente o completo) | | | |
| §8 Topología del Wi-Fi comprobada | | | |
| §9 Calendarios de OpenTimestamps responden | | | |
| §0 Disco cifrado comprobado (`lsblk -f` o `manage-bde`) | | | |
| §11 Primer respaldo diario cifrado | | | |
| §11 Prueba de restauración | | | |
