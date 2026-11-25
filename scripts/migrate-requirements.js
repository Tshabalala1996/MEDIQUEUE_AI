/**
 * Idempotent schema migration for the MediQueue AI functional requirements.
 *
 *   npm run db:migrate
 *
 * The base schema is not stored in this repo, so every step first inspects the
 * live database (information_schema) and only changes what is missing. It is
 * safe to run repeatedly.
 *
 * Adds:
 *   - Nurse role (FR04 triage, FR09 status updates)
 *   - queue: priority_level, triage_category, estimated_wait_mins, referral fields, 'Referred' status (FR04, FR09)
 *   - appointments.status 'Referred' (FR09)
 *   - appointments.is_emergency and appointment_emergency_followups (emergency arrival choice, ETA/deadline, dispatch details and email state)
 *   - triage_assessments        (FR04)
 *   - wait_time_predictions     (FR03 — predictions, timestamps, model versions)
 *   - ml_models                 (FR03 — trained model registry)
 *   - appointment_reminders     (FR05)
 *   - system_settings           (FR07)
 *   - queue.ai_flagged, ai_symptom_checks (AI emergency symptom pre-check)
 *   - fixes an off-by-one bug in the pre-existing update_hospital_slot_booked /
 *     update_clinic_slot_booked triggers that marked a slot is_available=0 one
 *     booking earlier than its real capacity (see fixTimeSlotTriggers below)
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// .env.local supplies defaults; variables already set in the environment win (standard dotenv behaviour).
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    const name = key && key.trim();
    if (name && rest.length && process.env[name] === undefined) process.env[name] = rest.join('=').trim();
  });
}

const log = (msg) => console.log(msg);

async function getColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0] ?? null;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, column, ddl) {
  if (await getColumn(conn, table, column)) {
    log(`  = ${table}.${column} already present`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  log(`  + ${table}.${column} added`);
}

/** Appends values to an ENUM column (no-op when the column is not an ENUM or already has them). */
async function extendEnum(conn, table, column, values) {
  const col = await getColumn(conn, table, column);
  if (!col) { log(`  ! ${table}.${column} not found — skipped`); return; }
  if (col.DATA_TYPE !== 'enum') { log(`  = ${table}.${column} is ${col.DATA_TYPE}, no enum change needed`); return; }

  const existing = [...col.COLUMN_TYPE.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const missing = values.filter((v) => !existing.includes(v));
  if (!missing.length) { log(`  = ${table}.${column} already allows ${values.join(', ')}`); return; }

  const all = [...existing, ...missing].map((v) => `'${v.replace(/'/g, "''")}'`).join(',');
  const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
  let def = '';
  if (col.COLUMN_DEFAULT !== null && col.COLUMN_DEFAULT !== undefined) {
    // MariaDB returns the default already quoted, MySQL returns it bare.
    const raw = String(col.COLUMN_DEFAULT).replace(/^'(.*)'$/, '$1');
    def = raw.toUpperCase() === 'NULL' ? '' : ` DEFAULT '${raw.replace(/'/g, "''")}'`;
  }
  await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${all}) ${nullable}${def}`);
  log(`  + ${table}.${column} now also allows ${missing.join(', ')}`);
}

async function createTable(conn, name, ddl) {
  const existed = await tableExists(conn, name);
  await conn.query(ddl);
  log(existed ? `  = ${name} already present` : `  + ${name} created`);
}

/**
 * Fixes an off-by-one bug found in the pre-existing update_hospital_slot_booked /
 * update_clinic_slot_booked triggers (AFTER INSERT ON appointments).
 *
 * Their SET clause is `booked_count = booked_count + 1, is_available = CASE WHEN
 * booked_count + 1 >= max_patients ...`. MySQL evaluates SET assignments left to
 * right, so by the time the second expression runs, the bare `booked_count` it
 * reads has ALREADY been updated by the first assignment — its own `+ 1` then
 * adds a second increment on top, marking the slot full one real booking early
 * (e.g. a 2-seat slot goes unavailable after just 1 booking). Verified against
 * a live test booking before writing this fix. The application code itself
 * (app/api/appointments/route.ts) was also fixed separately to stop duplicating
 * what these triggers already do (it used to double-increment booked_count and
 * insert a second queue row on top of what create_queue_entry already inserts).
 */
async function fixTimeSlotTriggers(conn) {
  log('Trigger fixes');
  const targets = [
    { name: 'update_hospital_slot_booked', slotIdCol: 'hospital_slot_id', slotTable: 'hospital_time_slots', facilityType: 'Hospital' },
    { name: 'update_clinic_slot_booked', slotIdCol: 'clinic_slot_id', slotTable: 'clinic_time_slots', facilityType: 'Clinic' },
  ];

  for (const t of targets) {
    const [rows] = await conn.query(
      `SELECT ACTION_STATEMENT FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
      [t.name]
    );
    if (!rows.length) { log(`  ! ${t.name} not found — skipped`); continue; }
    if (!/booked_count\s*\+\s*1\s*>=\s*max_patients/i.test(rows[0].ACTION_STATEMENT)) {
      log(`  = ${t.name} already fixed`);
      continue;
    }
    await conn.query(`DROP TRIGGER IF EXISTS \`${t.name}\``);
    await conn.query(`
      CREATE TRIGGER \`${t.name}\` AFTER INSERT ON \`appointments\` FOR EACH ROW
      BEGIN
          IF NEW.facility_type = '${t.facilityType}' AND NEW.${t.slotIdCol} IS NOT NULL THEN
              UPDATE ${t.slotTable}
              SET booked_count = booked_count + 1,
                  is_available = CASE
                      WHEN booked_count >= max_patients THEN FALSE
                      ELSE TRUE
                  END
              WHERE slot_id = NEW.${t.slotIdCol};
          END IF;
      END
    `);
    log(`  + ${t.name} fixed (was marking a slot full one booking early)`);
  }
}

async function run(conn) {
  // ── Roles ───────────────────────────────────────────────────────────────────
  log('Roles');
  await extendEnum(conn, 'roles', 'role_name', ['Nurse']);
  await conn.query(
    // FROM DUAL keeps this valid on older MySQL / MariaDB (XAMPP), which reject a WHERE without a FROM.
    `INSERT INTO roles (role_name, description)
     SELECT 'Nurse', 'Clinical staff who triage patients and update queue status' FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Nurse')`
  );
  log('  = Nurse role ensured');

  // ── Queue ───────────────────────────────────────────────────────────────────
  log('queue');
  await addColumn(conn, 'queue', 'priority_level', 'TINYINT NOT NULL DEFAULT 4');
  await addColumn(conn, 'queue', 'triage_category', 'VARCHAR(10) NULL');
  await addColumn(conn, 'queue', 'estimated_wait_mins', 'INT NULL');
  await addColumn(conn, 'queue', 'referred_to', 'VARCHAR(255) NULL');
  await addColumn(conn, 'queue', 'referral_reason', 'VARCHAR(500) NULL');
  await addColumn(conn, 'queue', 'referred_at', 'DATETIME NULL');
  await addColumn(conn, 'queue', 'ai_flagged', 'TINYINT(1) NOT NULL DEFAULT 0');
  await extendEnum(conn, 'queue', 'status', ['Waiting', 'In-Progress', 'Completed', 'No-Show', 'Skipped', 'Referred']);

  // The old recalculation wrote *estimates* into actual_wait_mins for waiting rows.
  // Carry those across so the UI keeps showing something until the next recalculation.
  const [moved] = await conn.query(
    `UPDATE queue SET estimated_wait_mins = actual_wait_mins
      WHERE status = 'Waiting' AND estimated_wait_mins IS NULL AND actual_wait_mins IS NOT NULL`
  );
  log(`  ~ carried ${moved.affectedRows} legacy estimate(s) into estimated_wait_mins`);

  log('appointments');
  await extendEnum(conn, 'appointments', 'status', ['Referred']);
  await addColumn(conn, 'appointments', 'is_emergency', 'TINYINT(1) NOT NULL DEFAULT 0');

  // ── New tables (no FKs: the base schema's key types are not in the repo) ──
  log('New tables');
  await createTable(conn, 'appointment_emergency_followups', `
    CREATE TABLE IF NOT EXISTS appointment_emergency_followups (
      followup_id             INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id          INT NOT NULL,
      patient_id              INT NOT NULL,
      ambulance_requested     TINYINT(1) NOT NULL,
      ambulance_status        ENUM('Requested', 'NotRequested') NOT NULL,
      requested_at            DATETIME NOT NULL,
      estimated_arrival_at    DATETIME NULL,
      arrival_deadline_at     DATETIME NULL,
      dispatch_provider       VARCHAR(60) NOT NULL,
      dispatch_reference      VARCHAR(120) NULL,
      dispatch_details        JSON NULL,
      email_status            ENUM('Sending', 'Sent', 'Failed') NOT NULL DEFAULT 'Sending',
      email_attempts          TINYINT UNSIGNED NOT NULL DEFAULT 1,
      email_sent_at           DATETIME NULL,
      email_error             VARCHAR(255) NULL,
      notification_id         INT NOT NULL,
      created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_emergency_followup_appointment (appointment_id),
      INDEX idx_emergency_followup_patient (patient_id),
      INDEX idx_emergency_followup_email_status (email_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await createTable(conn, 'triage_assessments', `
    CREATE TABLE IF NOT EXISTS triage_assessments (
      assessment_id  INT AUTO_INCREMENT PRIMARY KEY,
      queue_id       INT NOT NULL,
      appointment_id INT NOT NULL,
      patient_id     INT NOT NULL,
      category       VARCHAR(10) NOT NULL,
      priority_level TINYINT NOT NULL,
      tews_score     TINYINT NULL,
      ai_category    VARCHAR(10) NULL,
      ai_confidence  VARCHAR(10) NULL,
      source         VARCHAR(20) NOT NULL,
      vitals         TEXT NULL,
      discriminators TEXT NULL,
      rationale      TEXT NULL,
      notes          VARCHAR(1000) NULL,
      assessed_by    INT NOT NULL,
      assessed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_triage_queue (queue_id),
      INDEX idx_triage_appointment (appointment_id),
      INDEX idx_triage_assessed_at (assessed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await createTable(conn, 'wait_time_predictions', `
    CREATE TABLE IF NOT EXISTS wait_time_predictions (
      prediction_id           INT AUTO_INCREMENT PRIMARY KEY,
      queue_id                INT NULL,
      doctor_id               INT NULL,
      queue_length            INT NOT NULL,
      available_doctors       INT NOT NULL DEFAULT 1,
      avg_consultation_mins   DECIMAL(6,2) NOT NULL,
      priority_level          TINYINT NOT NULL DEFAULT 4,
      predicted_wait_minutes  INT NOT NULL,
      actual_wait_minutes     INT NULL,
      model_version           VARCHAR(40) NOT NULL,
      model_type              VARCHAR(20) NOT NULL,
      latency_ms              INT NOT NULL DEFAULT 0,
      created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pred_queue (queue_id),
      INDEX idx_pred_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await createTable(conn, 'ml_models', `
    CREATE TABLE IF NOT EXISTS ml_models (
      model_id         INT AUTO_INCREMENT PRIMARY KEY,
      name             VARCHAR(40) NOT NULL,
      version          VARCHAR(40) NOT NULL,
      algorithm        VARCHAR(40) NOT NULL,
      payload          MEDIUMTEXT NOT NULL,
      training_samples INT NOT NULL,
      test_samples     INT NOT NULL,
      test_mae_minutes DECIMAL(8,2) NULL,
      baseline_mae     DECIMAL(8,2) NULL,
      test_within_5    DECIMAL(5,2) NULL,
      is_active        TINYINT(1) NOT NULL DEFAULT 0,
      trained_by       INT NULL,
      trained_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_models_active (name, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await createTable(conn, 'appointment_reminders', `
    CREATE TABLE IF NOT EXISTS appointment_reminders (
      reminder_id    INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id INT NOT NULL,
      user_id        INT NOT NULL,
      lead_hours     INT NOT NULL,
      channel        VARCHAR(10) NOT NULL DEFAULT 'SMS',
      status         VARCHAR(10) NOT NULL DEFAULT 'Pending',
      attempts       TINYINT NOT NULL DEFAULT 0,
      error          VARCHAR(255) NULL,
      sent_at        DATETIME NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_reminder (appointment_id, lead_hours, channel),
      INDEX idx_reminder_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await createTable(conn, 'ai_symptom_checks', `
    CREATE TABLE IF NOT EXISTS ai_symptom_checks (
      check_id       INT AUTO_INCREMENT PRIMARY KEY,
      patient_id     INT NOT NULL,
      hospital_id    INT NULL,
      description    TEXT NOT NULL,
      source         VARCHAR(20) NOT NULL,
      is_emergency   TINYINT(1) NOT NULL,
      category       VARCHAR(10) NULL,
      confidence     VARCHAR(10) NULL,
      red_flags      TEXT NULL,
      reasoning      TEXT NULL,
      model          VARCHAR(60) NULL,
      latency_ms     INT NULL,
      doctor_available TINYINT(1) NULL,
      appointment_id INT NULL,
      queue_id       INT NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_check_patient (patient_id),
      INDEX idx_ai_check_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [emergencyAppointments] = await conn.query(
    `UPDATE appointments a
       JOIN ai_symptom_checks c ON c.appointment_id = a.appointment_id
        SET a.is_emergency = 1
      WHERE c.is_emergency = 1 AND a.is_emergency = 0`
  );
  log(`  ~ marked ${emergencyAppointments.affectedRows} existing AI emergency appointment(s)`);

  await createTable(conn, 'system_settings', `
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key   VARCHAR(64) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_by    INT NULL,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await fixTimeSlotTriggers(conn);

  // Defaults mirror lib/settings.ts (the app also falls back to these when a row is missing).
  const defaults = [
    ['reminders_enabled', 'true'],
    ['reminder_lead_hours', '24,2'],
    ['reminder_max_attempts', '3'],
    ['default_consultation_minutes', '15'],
    ['ai_wait_prediction_enabled', 'true'],
    ['ml_min_training_samples', '30'],
  ];
  for (const [key, value] of defaults) {
    await conn.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = ?)`,
      [key, value, key]
    );
  }
  log('  = default system settings ensured');
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });
  try {
    log(`Migrating database "${process.env.DB_NAME}"...`);
    await run(conn);
    log('\nMigration complete.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.sqlMessage || err.message || err);
  process.exit(1);
});
