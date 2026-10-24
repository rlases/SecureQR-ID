import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operador')),
      cargo TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      documento TEXT NOT NULL,
      rol TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      creado_por_usuario_id INTEGER NOT NULL,
      corrige_registro_id INTEGER REFERENCES registros(id),
      motivo TEXT,
      FOREIGN KEY (creado_por_usuario_id) REFERENCES users(id),
      CHECK (
        (corrige_registro_id IS NULL AND motivo IS NULL) OR
        (corrige_registro_id IS NOT NULL AND motivo IS NOT NULL)
      )
    );
  `);
  runCredentialMigrations(db);
}

// Registro de credenciales y portal del titular (ADR-0016, issue #79).
//
// Vocabulario de ADR-0009: en el modelo de datos es «titular», no «estudiante», y los
// estamentos no vienen predefinidos: los crea el admin de cada instalación.
//
// Ninguna columna guarda una llave, un código ni un secreto en claro: solo hashes.
function runCredentialMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS estamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nombre)) > 0),
      requiere_confirmacion INTEGER NOT NULL DEFAULT 0 CHECK (requiere_confirmacion IN (0, 1)),
      es_base INTEGER NOT NULL DEFAULT 0 CHECK (es_base IN (0, 1)),
      creado_en TEXT NOT NULL,
      -- El estamento base no requiere confirmación (ADR-0016, punto 5).
      CHECK (NOT (es_base = 1 AND requiere_confirmacion = 1))
    );
    -- Como mucho un estamento base por instalación.
    CREATE UNIQUE INDEX IF NOT EXISTS estamentos_una_base
      ON estamentos (es_base) WHERE es_base = 1;

    CREATE TABLE IF NOT EXISTS titulares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Identificador interno opaco (128 bits, Base64url). Es lo único del titular que
      -- sale de esta base: el historial de asignaciones lo usa en lugar de sus datos.
      ref TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      documento TEXT NOT NULL,
      -- Solo contacto: no se verifica ni es único (ADR-0016, punto 2).
      correo TEXT NOT NULL,
      estamento_id INTEGER NOT NULL REFERENCES estamentos(id),
      -- 0 mientras un admin no confirme un estamento que lo requiere: hasta entonces el
      -- titular recibe las ventanas del estamento base.
      estamento_confirmado INTEGER NOT NULL CHECK (estamento_confirmado IN (0, 1)),
      -- activo: puede pedir QR · en_revision: alta detenida por documento repetido ·
      -- suspendido: credencial revocada, solo un admin lo reactiva · anonimizado: cierre
      -- del piloto (ADR-0016, punto 10).
      estado TEXT NOT NULL CHECK (estado IN ('activo', 'en_revision', 'suspendido', 'anonimizado')),
      -- bcrypt del código de recuperación; nunca el código.
      codigo_recuperacion_hash TEXT,
      autorizacion_datos_en TEXT NOT NULL,
      creado_en TEXT NOT NULL
    );
    -- Un registro vigente por documento (activo o suspendido). Una nueva alta con el
    -- mismo documento queda en revisión y no choca con este índice.
    CREATE UNIQUE INDEX IF NOT EXISTS titulares_documento_unico
      ON titulares (documento) WHERE estado IN ('activo', 'suspendido');

    CREATE TABLE IF NOT EXISTS credenciales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cid TEXT NOT NULL UNIQUE CHECK (length(cid) = 22),
      titular_id INTEGER NOT NULL REFERENCES titulares(id),
      estado TEXT NOT NULL CHECK (estado IN ('vigente', 'reemplazada', 'revocada')),
      vigente_desde TEXT NOT NULL,
      vigente_hasta TEXT,
      CHECK ((estado = 'vigente') = (vigente_hasta IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS credenciales_una_vigente
      ON credenciales (titular_id) WHERE estado = 'vigente';

    CREATE TABLE IF NOT EXISTS dispositivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titular_id INTEGER NOT NULL REFERENCES titulares(id),
      -- SHA-256 de la llave de 256 bits que vive en la cookie del teléfono.
      llave_hash TEXT NOT NULL UNIQUE CHECK (length(llave_hash) = 64),
      estado TEXT NOT NULL CHECK (estado IN ('activo', 'reemplazado', 'revocado')),
      vinculado_en TEXT NOT NULL,
      ultimo_uso_en TEXT,
      desactivado_en TEXT,
      CHECK ((estado = 'activo') = (desactivado_en IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_uno_activo
      ON dispositivos (titular_id) WHERE estado = 'activo';

    -- Historial cid → titular, de solo agregar y encadenado por hash (THREAT-MODEL.md,
    -- «Vinculabilidad del cid»). Solo guarda el identificador opaco del titular, nunca
    -- sus datos personales, así que sobrevive a la anonimización del cierre del piloto.
    CREATE TABLE IF NOT EXISTS asignaciones_cid (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      titular_ref TEXT NOT NULL,
      cid TEXT NOT NULL,
      motivo TEXT NOT NULL CHECK (motivo IN ('alta', 'reseteo', 'reactivacion')),
      asignado_en TEXT NOT NULL,
      hash_anterior TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE
    );

    -- Defensa en la base: lo que es historial no se borra, y lo que identifica una
    -- credencial o un dispositivo no se reescribe.
    CREATE TRIGGER IF NOT EXISTS asignaciones_cid_no_update BEFORE UPDATE ON asignaciones_cid
    BEGIN SELECT RAISE(ABORT, 'el historial de asignaciones es de solo agregar'); END;
    CREATE TRIGGER IF NOT EXISTS asignaciones_cid_no_delete BEFORE DELETE ON asignaciones_cid
    BEGIN SELECT RAISE(ABORT, 'el historial de asignaciones es de solo agregar'); END;

    CREATE TRIGGER IF NOT EXISTS credenciales_no_delete BEFORE DELETE ON credenciales
    BEGIN SELECT RAISE(ABORT, 'una credencial nunca se borra'); END;
    CREATE TRIGGER IF NOT EXISTS credenciales_identidad_fija
    BEFORE UPDATE OF cid, titular_id, vigente_desde ON credenciales
    BEGIN SELECT RAISE(ABORT, 'el cid y el titular de una credencial no cambian'); END;
    CREATE TRIGGER IF NOT EXISTS credenciales_solo_desde_vigente
    BEFORE UPDATE OF estado ON credenciales WHEN OLD.estado <> 'vigente'
    BEGIN SELECT RAISE(ABORT, 'una credencial reemplazada o revocada no vuelve atrás'); END;

    CREATE TRIGGER IF NOT EXISTS dispositivos_no_delete BEFORE DELETE ON dispositivos
    BEGIN SELECT RAISE(ABORT, 'un dispositivo nunca se borra'); END;
    CREATE TRIGGER IF NOT EXISTS dispositivos_identidad_fija
    BEFORE UPDATE OF llave_hash, titular_id, vinculado_en ON dispositivos
    BEGIN SELECT RAISE(ABORT, 'la llave y el titular de un dispositivo no cambian'); END;
    CREATE TRIGGER IF NOT EXISTS dispositivos_solo_desde_activo
    BEFORE UPDATE OF estado ON dispositivos WHEN OLD.estado <> 'activo'
    BEGIN SELECT RAISE(ABORT, 'un dispositivo desactivado no vuelve a activarse'); END;

    CREATE TRIGGER IF NOT EXISTS titulares_no_delete BEFORE DELETE ON titulares
    BEGIN SELECT RAISE(ABORT, 'un titular se anonimiza, no se borra'); END;
  `);
  runScheduleMigrations(db);
}

// Estamentos, ventanas de ingreso, excepciones de calendario y reglas por dominio
// (ADR-0016, punto 5; issue #89). Las horas se guardan en minutos desde la medianoche,
// en la hora local de la sede; una ventana no cruza la medianoche (fin hasta 1440).
function runScheduleMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reglas_horario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estamento_id INTEGER NOT NULL REFERENCES estamentos(id) ON DELETE CASCADE,
      -- ISO 8601: 1 = lunes … 7 = domingo.
      dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
      inicio_min INTEGER NOT NULL CHECK (inicio_min BETWEEN 0 AND 1439),
      fin_min INTEGER NOT NULL CHECK (fin_min BETWEEN 1 AND 1440),
      CHECK (inicio_min < fin_min)
    );

    CREATE TABLE IF NOT EXISTS excepciones_calendario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Fechas locales de la sede, AAAA-MM-DD, ambas inclusive.
      fecha_desde TEXT NOT NULL CHECK (fecha_desde GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      fecha_hasta TEXT NOT NULL CHECK (fecha_hasta GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      -- cierre: nadie entra · reemplazo: valen solo las ventanas de la excepción.
      tipo TEXT NOT NULL CHECK (tipo IN ('cierre', 'reemplazo')),
      -- NULL = todos los estamentos.
      estamento_id INTEGER REFERENCES estamentos(id) ON DELETE CASCADE,
      descripcion TEXT NOT NULL CHECK (length(trim(descripcion)) > 0),
      CHECK (fecha_desde <= fecha_hasta)
    );

    CREATE TABLE IF NOT EXISTS excepcion_ventanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      excepcion_id INTEGER NOT NULL REFERENCES excepciones_calendario(id) ON DELETE CASCADE,
      inicio_min INTEGER NOT NULL CHECK (inicio_min BETWEEN 0 AND 1439),
      fin_min INTEGER NOT NULL CHECK (fin_min BETWEEN 1 AND 1440),
      CHECK (inicio_min < fin_min)
    );

    CREATE TABLE IF NOT EXISTS dominios_correo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dominio TEXT NOT NULL UNIQUE COLLATE NOCASE,
      estamento_id INTEGER NOT NULL REFERENCES estamentos(id) ON DELETE CASCADE
    );

    -- Todo cambio de estamento, ventana, excepción o dominio, y todo cambio de estamento
    -- de un titular: quién, cuándo, qué valor tenía antes y cuál quedó (ADR-0016).
    CREATE TABLE IF NOT EXISTS cambios_configuracion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES users(id),
      entidad TEXT NOT NULL,
      entidad_id INTEGER,
      accion TEXT NOT NULL,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      en TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS cambios_configuracion_no_update
    BEFORE UPDATE ON cambios_configuracion
    BEGIN SELECT RAISE(ABORT, 'el registro de cambios es de solo agregar'); END;
    CREATE TRIGGER IF NOT EXISTS cambios_configuracion_no_delete
    BEFORE DELETE ON cambios_configuracion
    BEGIN SELECT RAISE(ABORT, 'el registro de cambios es de solo agregar'); END;
  `);
  runPortalMigrations(db);
}

// Portal del titular (ADR-0016, puntos 2 a 4; issue #84).
function runPortalMigrations(db: Database.Database): void {
  db.exec(`
    -- Intentos de recuperación con código, para limitar la fuerza bruta por documento y
    -- por IP. Solo se cuentan los fallidos dentro de una ventana de tiempo.
    CREATE TABLE IF NOT EXISTS intentos_recuperacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documento TEXT NOT NULL,
      ip TEXT NOT NULL,
      exito INTEGER NOT NULL CHECK (exito IN (0, 1)),
      en TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS intentos_recuperacion_documento
      ON intentos_recuperacion (documento, en);
    CREATE INDEX IF NOT EXISTS intentos_recuperacion_ip ON intentos_recuperacion (ip, en);
  `);
}
