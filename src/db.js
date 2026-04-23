import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./config/env.js";
import { DbRole, Role, fromDbRole, toDbRole } from "./lib/roles.js";

function prepareDatabasePath(databasePath) {
  try {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    return databasePath;
  } catch (error) {
    // Railway often uses /data for persistent volumes. If that mount is missing,
    // fall back to a local path so the app can still boot.
    if (databasePath.startsWith("/data")) {
      const fallbackPath = path.resolve(process.cwd(), "data", "grafik.db");
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      console.warn(
        `[db] DATABASE_PATH=${databasePath} is unavailable. Falling back to ${fallbackPath}. ` +
          "Attach a Railway Volume to /data for persistence."
      );
      return fallbackPath;
    }

    throw new Error(
      `Cannot prepare database directory for DATABASE_PATH=${databasePath}: ${error.message}`
    );
  }
}

const resolvedDatabasePath = prepareDatabasePath(env.DATABASE_PATH);
const db = new Database(resolvedDatabasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'EMPLOYEE')) DEFAULT 'EMPLOYEE',
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    reminder_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_24_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_14_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    work_start TEXT NOT NULL DEFAULT '14:00',
    work_end TEXT NOT NULL DEFAULT '22:00'
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_code TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    executor1 TEXT NOT NULL DEFAULT '',
    executor2 TEXT NOT NULL DEFAULT '',
    rate1 REAL NOT NULL DEFAULT 0,
    rate2 REAL NOT NULL DEFAULT 0,
    deductions REAL NOT NULL DEFAULT 0,
    bonuses REAL NOT NULL DEFAULT 0,
    deductions_meta TEXT NOT NULL DEFAULT '[]',
    bonuses_meta TEXT NOT NULL DEFAULT '[]',
    deductions1 REAL NOT NULL DEFAULT 0,
    deductions2 REAL NOT NULL DEFAULT 0,
    bonuses1 REAL NOT NULL DEFAULT 0,
    bonuses2 REAL NOT NULL DEFAULT 0,
    deductions1_meta TEXT NOT NULL DEFAULT '[]',
    deductions2_meta TEXT NOT NULL DEFAULT '[]',
    bonuses1_meta TEXT NOT NULL DEFAULT '[]',
    bonuses2_meta TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(location_code, shift_date),
    FOREIGN KEY(location_code) REFERENCES locations(code)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    telegram_id TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    telegram_contact TEXT NOT NULL DEFAULT '',
    vk_contact TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT 'manager',
    reliability TEXT NOT NULL DEFAULT 'checking',
    access_role TEXT NOT NULL DEFAULT 'EMPLOYEE',
    is_protected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS finance_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_code TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    period_from TEXT NOT NULL DEFAULT '',
    period_to TEXT NOT NULL DEFAULT '',
    payment_type TEXT NOT NULL DEFAULT 'payout',
    amount REAL NOT NULL DEFAULT 0,
    created_by_telegram_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(location_code) REFERENCES locations(code)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS shift_reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    location_code TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    shift_role TEXT NOT NULL,
    reminder_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(telegram_id, location_code, shift_date, shift_role, reminder_code)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS security_pin_settings (
    user_id INTEGER PRIMARY KEY,
    pin_hash TEXT NOT NULL DEFAULT '',
    pin_salt TEXT NOT NULL DEFAULT '',
    is_enabled INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    lock_until TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    telegram_id TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    pin_verified INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS security_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK(scope IN ('PERSONAL', 'SYSTEM')),
    event_type TEXT NOT NULL,
    actor_user_id INTEGER,
    actor_telegram_id TEXT NOT NULL DEFAULT '',
    actor_role TEXT NOT NULL DEFAULT '',
    target_user_id INTEGER,
    target_telegram_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    meta_json TEXT NOT NULL DEFAULT '{}',
    system_view TEXT NOT NULL DEFAULT 'TARGET_USER' CHECK(system_view IN ('TARGET_USER', 'ALL_ADMINS', 'ALL_USERS', 'SUPERADMIN_ONLY')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(actor_user_id) REFERENCES users(id),
    FOREIGN KEY(target_user_id) REFERENCES users(id)
  );
`);

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

if (!hasColumn("users", "is_super_admin")) {
  db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;");
}
if (!hasColumn("users", "reminder_enabled")) {
  db.exec("ALTER TABLE users ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 1;");
}
const addedReminder24Column = !hasColumn("users", "reminder_24_enabled");
if (addedReminder24Column) {
  db.exec("ALTER TABLE users ADD COLUMN reminder_24_enabled INTEGER NOT NULL DEFAULT 1;");
}
const addedReminder14Column = !hasColumn("users", "reminder_14_enabled");
if (addedReminder14Column) {
  db.exec("ALTER TABLE users ADD COLUMN reminder_14_enabled INTEGER NOT NULL DEFAULT 1;");
}
if ((addedReminder24Column || addedReminder14Column) && hasColumn("users", "reminder_enabled")) {
  db.exec(`
    UPDATE users
    SET
      reminder_24_enabled = reminder_enabled,
      reminder_14_enabled = reminder_enabled
  `);
}

if (!hasColumn("employees", "first_name")) {
  db.exec("ALTER TABLE employees ADD COLUMN first_name TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "last_name")) {
  db.exec("ALTER TABLE employees ADD COLUMN last_name TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "phone")) {
  db.exec("ALTER TABLE employees ADD COLUMN phone TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "telegram_id")) {
  db.exec("ALTER TABLE employees ADD COLUMN telegram_id TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "avatar_url")) {
  db.exec("ALTER TABLE employees ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "position")) {
  db.exec("ALTER TABLE employees ADD COLUMN position TEXT NOT NULL DEFAULT 'manager';");
}
if (!hasColumn("employees", "reliability")) {
  db.exec("ALTER TABLE employees ADD COLUMN reliability TEXT NOT NULL DEFAULT 'checking';");
}
if (!hasColumn("employees", "access_role")) {
  db.exec("ALTER TABLE employees ADD COLUMN access_role TEXT NOT NULL DEFAULT 'EMPLOYEE';");
}
if (!hasColumn("employees", "telegram_contact")) {
  db.exec("ALTER TABLE employees ADD COLUMN telegram_contact TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "vk_contact")) {
  db.exec("ALTER TABLE employees ADD COLUMN vk_contact TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("employees", "is_protected")) {
  db.exec("ALTER TABLE employees ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0;");
}
if (!hasColumn("shifts", "deductions_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN deductions_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("shifts", "bonuses_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN bonuses_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("shifts", "deductions1")) {
  db.exec("ALTER TABLE shifts ADD COLUMN deductions1 REAL NOT NULL DEFAULT 0;");
}
if (!hasColumn("shifts", "deductions2")) {
  db.exec("ALTER TABLE shifts ADD COLUMN deductions2 REAL NOT NULL DEFAULT 0;");
}
if (!hasColumn("shifts", "bonuses1")) {
  db.exec("ALTER TABLE shifts ADD COLUMN bonuses1 REAL NOT NULL DEFAULT 0;");
}
if (!hasColumn("shifts", "bonuses2")) {
  db.exec("ALTER TABLE shifts ADD COLUMN bonuses2 REAL NOT NULL DEFAULT 0;");
}
if (!hasColumn("shifts", "deductions1_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN deductions1_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("shifts", "deductions2_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN deductions2_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("shifts", "bonuses1_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN bonuses1_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("shifts", "bonuses2_meta")) {
  db.exec("ALTER TABLE shifts ADD COLUMN bonuses2_meta TEXT NOT NULL DEFAULT '[]';");
}
if (!hasColumn("locations", "work_start")) {
  db.exec("ALTER TABLE locations ADD COLUMN work_start TEXT NOT NULL DEFAULT '14:00';");
}
if (!hasColumn("locations", "work_end")) {
  db.exec("ALTER TABLE locations ADD COLUMN work_end TEXT NOT NULL DEFAULT '22:00';");
}
if (!hasColumn("finance_payments", "period_from")) {
  db.exec("ALTER TABLE finance_payments ADD COLUMN period_from TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("finance_payments", "period_to")) {
  db.exec("ALTER TABLE finance_payments ADD COLUMN period_to TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("finance_payments", "payment_type")) {
  db.exec("ALTER TABLE finance_payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'payout';");
}

const CORE_EMPLOYEE = {
  firstName: "Владимир",
  lastName: "Ставицкий",
  fullName: "Владимир Ставицкий",
  telegramId: "",
  phone: "+7 922 924-24-94",
  telegramContact: "@i1wqq",
  vkContact: "https://vk.com/volodyast",
  position: "owner",
  reliability: "reliable"
};

function normalizeUsername(value) {
  const source = String(value || "").trim().toLowerCase();
  if (!source) return "";
  return source.startsWith("@") ? source.slice(1) : source;
}

function ensureCoreEmployee() {
  const existing = db
    .prepare(
      `
      SELECT id, telegram_id
      FROM employees
      WHERE is_protected = 1
         OR lower(telegram_contact) = lower(?)
         OR full_name = ?
      ORDER BY is_protected DESC, id ASC
      LIMIT 1
      `
    )
    .get(CORE_EMPLOYEE.telegramContact, CORE_EMPLOYEE.fullName);

  if (existing) {
    db.prepare(
      `
      UPDATE employees
      SET
        full_name = ?,
        first_name = ?,
        last_name = ?,
        telegram_id = ?,
        phone = ?,
        telegram_contact = ?,
        vk_contact = ?,
        position = ?,
        reliability = 'reliable',
        access_role = 'ADMIN',
        is_protected = 1
      WHERE id = ?
      `
    ).run(
      CORE_EMPLOYEE.fullName,
      CORE_EMPLOYEE.firstName,
      CORE_EMPLOYEE.lastName,
      existing.telegram_id || CORE_EMPLOYEE.telegramId,
      CORE_EMPLOYEE.phone,
      CORE_EMPLOYEE.telegramContact,
      CORE_EMPLOYEE.vkContact,
      CORE_EMPLOYEE.position,
      existing.id
    );
    return;
  }

  db.prepare(
    `
    INSERT INTO employees (
      full_name, first_name, last_name, telegram_id, phone, telegram_contact, vk_contact, position, reliability, access_role, is_protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reliable', 'ADMIN', 1)
    `
  ).run(
    CORE_EMPLOYEE.fullName,
    CORE_EMPLOYEE.firstName,
    CORE_EMPLOYEE.lastName,
    CORE_EMPLOYEE.telegramId,
    CORE_EMPLOYEE.phone,
    CORE_EMPLOYEE.telegramContact,
    CORE_EMPLOYEE.vkContact,
    CORE_EMPLOYEE.position
  );
}

ensureCoreEmployee();

const LOCATION_SEED = [
  { code: "WB_AMUNDSENA_15K2", title: "wb Амундсена 15к2" },
  { code: "WB_BOLSHAYA_MARFINSKAYA_1K4", title: "wb Большая Марфинская 1к4" },
  { code: "WB_MENZHINSKOGO_1K4", title: "wb Менжинского 32к1" },
  { code: "OZON_PYREVA_5A", title: "ozon Пырьева 5А" }
];

const upsertLocationStmt = db.prepare(`
  INSERT INTO locations (code, title)
  VALUES (?, ?)
  ON CONFLICT(code) DO UPDATE SET title = excluded.title
`);

const seedLocationsTx = db.transaction(() => {
  for (const location of LOCATION_SEED) {
    upsertLocationStmt.run(location.code, location.title);
  }
});

seedLocationsTx();

function mapUserRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    telegramId: row.telegram_id,
    fullName: row.full_name,
    role: fromDbRole(row.role, row.is_super_admin === 1),
    reminderEnabled: (row.reminder_24_enabled !== 0) || (row.reminder_14_enabled !== 0),
    reminder24Enabled: row.reminder_24_enabled !== 0,
    reminder14Enabled: row.reminder_14_enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getUserByTelegramId(telegramId) {
  const row = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
           , is_super_admin, reminder_enabled, reminder_24_enabled, reminder_14_enabled
      FROM users
      WHERE telegram_id = ?
      `
    )
    .get(telegramId);

  return mapUserRow(row);
}

export function createUser({ telegramId, fullName, role, isSuperAdmin = false }) {
  db.prepare(
    `
    INSERT INTO users (
      telegram_id, full_name, role, is_super_admin, reminder_enabled,
      reminder_24_enabled, reminder_14_enabled, updated_at
    )
    VALUES (?, ?, ?, ?, 1, 1, 1, datetime('now'))
    `
  ).run(telegramId, fullName, toDbRole(role), isSuperAdmin ? 1 : 0);

  return getUserByTelegramId(telegramId);
}

export function updateUserProfile({ telegramId, fullName }) {
  db.prepare(
    `
    UPDATE users
    SET full_name = ?, updated_at = datetime('now')
    WHERE telegram_id = ?
    `
  ).run(fullName, telegramId);

  return getUserByTelegramId(telegramId);
}

export function updateUserRole({ telegramId, role, isSuperAdmin }) {
  const hasSuperAdminFlag = typeof isSuperAdmin === "boolean";
  const result = db.prepare(
    `
    UPDATE users
    SET role = ?,
        is_super_admin = CASE WHEN ? THEN ? ELSE is_super_admin END,
        updated_at = datetime('now')
    WHERE telegram_id = ?
    `
  ).run(toDbRole(role), hasSuperAdminFlag ? 1 : 0, isSuperAdmin ? 1 : 0, telegramId);

  if (result.changes === 0) {
    return null;
  }

  return getUserByTelegramId(telegramId);
}

export function updateUserReminderEnabled({ telegramId, enabled }) {
  const safeTelegramId = String(telegramId || "").trim();
  const normalized = enabled ? 1 : 0;
  const result = db
    .prepare(
      `
      UPDATE users
      SET
        reminder_enabled = ?,
        reminder_24_enabled = ?,
        reminder_14_enabled = ?,
        updated_at = datetime('now')
      WHERE telegram_id = ?
      `
    )
    .run(normalized, normalized, normalized, safeTelegramId);

  if (result.changes === 0) {
    return null;
  }

  return getUserByTelegramId(safeTelegramId);
}

export function updateUserReminderSettings({ telegramId, enabled24, enabled14 }) {
  const safeTelegramId = String(telegramId || "").trim();
  const normalized24 = enabled24 ? 1 : 0;
  const normalized14 = enabled14 ? 1 : 0;
  const normalizedAny = normalized24 || normalized14 ? 1 : 0;
  const result = db
    .prepare(
      `
      UPDATE users
      SET
        reminder_enabled = ?,
        reminder_24_enabled = ?,
        reminder_14_enabled = ?,
        updated_at = datetime('now')
      WHERE telegram_id = ?
      `
    )
    .run(normalizedAny, normalized24, normalized14, safeTelegramId);

  if (result.changes === 0) {
    return null;
  }

  return getUserByTelegramId(safeTelegramId);
}

export function listUsers() {
  const rows = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
           , is_super_admin, reminder_enabled, reminder_24_enabled, reminder_14_enabled
      FROM users
      ORDER BY created_at DESC
      `
    )
    .all();

  return rows.map(mapUserRow);
}

export function countUsers() {
  const row = db.prepare("SELECT COUNT(*) as total FROM users").get();
  return row.total;
}

export function countAdmins() {
  const row = db
    .prepare("SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN' OR is_super_admin = 1")
    .get();
  return row.total;
}

export function listLocations() {
  return db
    .prepare(
      `
      SELECT code, title, work_start, work_end
      FROM locations
      ORDER BY title ASC
      `
    )
    .all()
    .map((row) => ({
      code: row.code,
      title: row.title,
      workStart: row.work_start || "14:00",
      workEnd: row.work_end || "22:00"
    }));
}

function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

export function updateLocationHours({ code, workStart, workEnd }) {
  if (!isValidTime(workStart) || !isValidTime(workEnd)) {
    throw new Error("Invalid work hours format");
  }
  const result = db
    .prepare(
      `
      UPDATE locations
      SET work_start = ?, work_end = ?
      WHERE code = ?
      `
    )
    .run(workStart, workEnd, code);

  if (result.changes === 0) return null;

  return db
    .prepare(
      `
      SELECT code, title, work_start, work_end
      FROM locations
      WHERE code = ?
      `
    )
    .get(code);
}

function getMonthDays(year, month) {
  const days = [];
  const date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCMonth() === month - 1) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

function parseMonth(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    throw new Error("Month must be in YYYY-MM format");
  }

  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month must be in YYYY-MM format");
  }

  return { year, month };
}

function parseDate(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }
  return String(dateValue);
}

function safeParseMeta(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function normalizeEmployeeName(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getScheduleForMonth({ locationCode, month }) {
  const location = db
    .prepare(
      `
      SELECT code, title
      FROM locations
      WHERE code = ?
      `
    )
    .get(locationCode);

  if (!location) {
    return null;
  }

  const { year, month: monthNum } = parseMonth(month);
  const monthDays = getMonthDays(year, monthNum);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  const rows = db
    .prepare(
      `
      SELECT
        shift_date, executor1, executor2, rate1, rate2,
        deductions, bonuses, deductions_meta, bonuses_meta,
        deductions1, deductions2, bonuses1, bonuses2,
        deductions1_meta, deductions2_meta, bonuses1_meta, bonuses2_meta
      FROM shifts
      WHERE location_code = ?
        AND shift_date >= ?
        AND shift_date <= ?
      `
    )
    .all(locationCode, monthStart, monthEnd);

  const rowMap = new Map(rows.map((row) => [row.shift_date, row]));
  const shifts = monthDays.map((day) => {
    const existing = rowMap.get(day);
    return {
      date: day,
      executor1: existing?.executor1 ?? "",
      executor2: existing?.executor2 ?? "",
      rate1: existing?.rate1 ?? 0,
      rate2: existing?.rate2 ?? 0,
      deductions1: existing?.deductions1 ?? existing?.deductions ?? 0,
      deductions2: existing?.deductions2 ?? 0,
      bonuses1: existing?.bonuses1 ?? existing?.bonuses ?? 0,
      bonuses2: existing?.bonuses2 ?? 0,
      deductions1Meta: safeParseMeta(existing?.deductions1_meta ?? existing?.deductions_meta),
      deductions2Meta: safeParseMeta(existing?.deductions2_meta),
      bonuses1Meta: safeParseMeta(existing?.bonuses1_meta ?? existing?.bonuses_meta),
      bonuses2Meta: safeParseMeta(existing?.bonuses2_meta)
    };
  });

  return {
    location,
    month,
    shifts
  };
}

export function upsertShift({
  locationCode,
  date,
  executor1,
  executor2,
  rate1,
  rate2,
  deductions1,
  deductions2,
  bonuses1,
  bonuses2,
  deductions1Meta = [],
  deductions2Meta = [],
  bonuses1Meta = [],
  bonuses2Meta = []
}) {
  const locationExists = db
    .prepare(
      `
      SELECT 1 as ok
      FROM locations
      WHERE code = ?
      `
    )
    .get(locationCode);

  if (!locationExists) {
    return null;
  }

  db.prepare(
    `
    INSERT INTO shifts (
      location_code, shift_date, executor1, executor2, rate1, rate2,
      deductions, bonuses, deductions_meta, bonuses_meta,
      deductions1, deductions2, bonuses1, bonuses2,
      deductions1_meta, deductions2_meta, bonuses1_meta, bonuses2_meta, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(location_code, shift_date) DO UPDATE SET
      executor1 = excluded.executor1,
      executor2 = excluded.executor2,
      rate1 = excluded.rate1,
      rate2 = excluded.rate2,
      deductions = excluded.deductions,
      bonuses = excluded.bonuses,
      deductions_meta = excluded.deductions_meta,
      bonuses_meta = excluded.bonuses_meta,
      deductions1 = excluded.deductions1,
      deductions2 = excluded.deductions2,
      bonuses1 = excluded.bonuses1,
      bonuses2 = excluded.bonuses2,
      deductions1_meta = excluded.deductions1_meta,
      deductions2_meta = excluded.deductions2_meta,
      bonuses1_meta = excluded.bonuses1_meta,
      bonuses2_meta = excluded.bonuses2_meta,
      updated_at = datetime('now')
    `
  ).run(
    locationCode,
    date,
    executor1,
    executor2,
    rate1,
    rate2,
    deductions1,
    bonuses1,
    JSON.stringify(Array.isArray(deductions1Meta) ? deductions1Meta : []),
    JSON.stringify(Array.isArray(bonuses1Meta) ? bonuses1Meta : []),
    deductions1,
    deductions2,
    bonuses1,
    bonuses2,
    JSON.stringify(Array.isArray(deductions1Meta) ? deductions1Meta : []),
    JSON.stringify(Array.isArray(deductions2Meta) ? deductions2Meta : []),
    JSON.stringify(Array.isArray(bonuses1Meta) ? bonuses1Meta : []),
    JSON.stringify(Array.isArray(bonuses2Meta) ? bonuses2Meta : [])
  );

  return db
    .prepare(
      `
      SELECT
        location_code, shift_date, executor1, executor2, rate1, rate2,
        deductions, bonuses, deductions_meta, bonuses_meta,
        deductions1, deductions2, bonuses1, bonuses2,
        deductions1_meta, deductions2_meta, bonuses1_meta, bonuses2_meta,
        updated_at
      FROM shifts
      WHERE location_code = ?
        AND shift_date = ?
      `
    )
    .get(locationCode, date);
}

export function validateShiftExecutors({
  locationCode,
  date,
  executor1,
  executor2
}) {
  const e1 = normalizeEmployeeName(executor1);
  const e2 = normalizeEmployeeName(executor2);
  const e1Lower = e1.toLowerCase();
  const e2Lower = e2.toLowerCase();

  if (e1 && e2 && e1Lower === e2Lower) {
    return {
      ok: false,
      type: "same_shift_duplicate",
      employeeName: e1,
      message: "Нельзя назначить одного сотрудника одновременно в Исполнитель1 и Исполнитель2"
    };
  }

  if (!e1 && !e2) {
    return { ok: true };
  }

  const rows = db
    .prepare(
      `
      SELECT
        s.location_code,
        l.title AS location_title,
        s.executor1,
        s.executor2
      FROM shifts s
      JOIN locations l ON l.code = s.location_code
      WHERE s.shift_date = ?
        AND NOT (s.location_code = ? AND s.shift_date = ?)
      `
    )
    .all(date, locationCode, date);

  for (const row of rows) {
    const rowExecutor1 = normalizeEmployeeName(row.executor1);
    const rowExecutor2 = normalizeEmployeeName(row.executor2);
    const rowE1Lower = rowExecutor1.toLowerCase();
    const rowE2Lower = rowExecutor2.toLowerCase();
    if (e1 && rowE1Lower === e1Lower) {
      return {
        ok: false,
        type: "cross_location_conflict",
        employeeName: e1,
        conflictLocationCode: row.location_code,
        conflictLocationTitle: row.location_title,
        message: `${e1} уже назначен(а) как Исполнитель1 в этот день на другом пункте: ${row.location_title}`
      };
    }
    if (e2 && rowE2Lower === e2Lower) {
      return {
        ok: false,
        type: "cross_location_conflict",
        employeeName: e2,
        conflictLocationCode: row.location_code,
        conflictLocationTitle: row.location_title,
        message: `${e2} уже назначен(а) как Исполнитель2 в этот день на другом пункте: ${row.location_title}`
      };
    }
  }

  return { ok: true };
}

export function getTodayAssignmentsForTelegramId({ telegramId, date }) {
  const employee = getEmployeeByTelegramId(telegramId);
  if (!employee) {
    return {
      employee: null,
      assignments: []
    };
  }

  const targetDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return {
      employee,
      assignments: []
    };
  }

  const aliases = buildEmployeeAliases(employee);

  if (!aliases.size) {
    return {
      employee,
      assignments: []
    };
  }

  const rows = db
    .prepare(
      `
      SELECT
        s.location_code,
        l.title AS location_title,
        l.work_start,
        l.work_end,
        s.executor1,
        s.executor2
      FROM shifts s
      JOIN locations l ON l.code = s.location_code
      WHERE s.shift_date = ?
      ORDER BY l.title ASC
      `
    )
    .all(targetDate);

  const assignments = [];
  for (const row of rows) {
    const normalizedExecutor1 = normalizeEmployeeName(row.executor1);
    const normalizedExecutor2 = normalizeEmployeeName(row.executor2);
    const rowExecutor1 = normalizedExecutor1.toLowerCase();
    const rowExecutor2 = normalizedExecutor2.toLowerCase();
    if (rowExecutor1 && aliases.has(rowExecutor1)) {
      assignments.push({
        locationCode: row.location_code,
        locationTitle: row.location_title,
        role: "executor1",
        coworkerName: normalizedExecutor2 || "",
        executor1: normalizedExecutor1,
        executor2: normalizedExecutor2,
        workStart: row.work_start || "14:00",
        workEnd: row.work_end || "22:00"
      });
    }
    if (rowExecutor2 && aliases.has(rowExecutor2)) {
      assignments.push({
        locationCode: row.location_code,
        locationTitle: row.location_title,
        role: "executor2",
        coworkerName: normalizedExecutor1 || "",
        executor1: normalizedExecutor1,
        executor2: normalizedExecutor2,
        workStart: row.work_start || "14:00",
        workEnd: row.work_end || "22:00"
      });
    }
  }

  return {
    employee,
    assignments
  };
}

function buildEmployeeAliases(employee) {
  const aliases = new Set();
  const fullName = normalizeEmployeeName(employee?.fullName);
  const firstName = normalizeEmployeeName(employee?.firstName);
  const lastName = normalizeEmployeeName(employee?.lastName);
  const firstLast = normalizeEmployeeName([firstName, lastName].filter(Boolean).join(" "));
  const lastFirst = normalizeEmployeeName([lastName, firstName].filter(Boolean).join(" "));
  if (fullName) aliases.add(fullName.toLowerCase());
  if (firstLast) aliases.add(firstLast.toLowerCase());
  if (lastFirst) aliases.add(lastFirst.toLowerCase());
  return aliases;
}

export function getUpcomingShiftDatesForTelegramId({ telegramId, fromDate, limit = 4 }) {
  const employee = getEmployeeByTelegramId(telegramId);
  if (!employee) {
    return {
      employee: null,
      shifts: []
    };
  }

  const startDate = String(fromDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return {
      employee,
      shifts: []
    };
  }

  const aliases = buildEmployeeAliases(employee);
  if (!aliases.size) {
    return {
      employee,
      shifts: []
    };
  }

  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 4));
  const rows = db
    .prepare(
      `
      SELECT
        s.shift_date,
        s.executor1,
        s.executor2,
        s.location_code,
        l.title AS location_title,
        l.work_start,
        l.work_end
      FROM shifts s
      JOIN locations l ON l.code = s.location_code
      WHERE s.shift_date >= ?
      ORDER BY s.shift_date ASC, l.title ASC
      `
    )
    .all(startDate);

  const shifts = [];
  const seen = new Set();
  for (const row of rows) {
    if (shifts.length >= safeLimit) break;
    const shiftDate = String(row.shift_date || "");
    if (!shiftDate) continue;
    const e1 = normalizeEmployeeName(row.executor1).toLowerCase();
    const e2 = normalizeEmployeeName(row.executor2).toLowerCase();
    const isE1 = e1 && aliases.has(e1);
    const isE2 = e2 && aliases.has(e2);
    if (isE1 || isE2) {
      const key = `${shiftDate}:${row.location_code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      shifts.push({
        date: shiftDate,
        locationCode: row.location_code,
        locationTitle: row.location_title,
        role: isE1 ? "executor1" : "executor2",
        coworkerName: isE1
          ? normalizeEmployeeName(row.executor2)
          : normalizeEmployeeName(row.executor1),
        workStart: row.work_start || "14:00",
        workEnd: row.work_end || "22:00"
      });
    }
  }

  return {
    employee,
    shifts
  };
}

export function listFinancePaymentsForMonth({ locationCode, month }) {
  const location = db
    .prepare(
      `
      SELECT code
      FROM locations
      WHERE code = ?
      `
    )
    .get(locationCode);
  if (!location) return null;

  const { year, month: monthNum } = parseMonth(month);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const fromDate = `${month}-01`;
  const toDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const payments = db
    .prepare(
      `
      SELECT id, employee_name, payment_date, period_from, period_to, payment_type, amount, created_by_telegram_id, created_at
      FROM finance_payments
      WHERE location_code = ?
        AND payment_date >= ?
        AND payment_date <= ?
      ORDER BY payment_date ASC, id ASC
      `
    )
    .all(locationCode, fromDate, toDate)
    .map((row) => ({
      id: row.id,
      employeeName: row.employee_name,
      paymentDate: row.payment_date,
      periodFrom: row.period_from || "",
      periodTo: row.period_to || "",
      paymentType: row.payment_type || "payout",
      amount: row.amount,
      createdByTelegramId: row.created_by_telegram_id,
      createdAt: row.created_at
    }));

  return { payments };
}

export function createFinancePayment({
  locationCode,
  employeeName,
  paymentDate,
  periodFrom,
  periodTo,
  paymentType = "payout",
  amount,
  createdByTelegramId
}) {
  const location = db
    .prepare(
      `
      SELECT code
      FROM locations
      WHERE code = ?
      `
    )
    .get(locationCode);
  if (!location) return null;

  const safeDate = parseDate(paymentDate);
  const safePeriodFrom = parseDate(periodFrom);
  const safePeriodTo = parseDate(periodTo);
  const safeAmount = Number(amount || 0);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error("Payment amount must be positive");
  }
  if (safePeriodFrom > safePeriodTo) {
    throw new Error("Payment period is invalid");
  }
  const safeType = String(paymentType || "payout").toLowerCase();
  if (safeType !== "payout" && safeType !== "advance") {
    throw new Error("Payment type is invalid");
  }

  const info = db
    .prepare(
      `
      INSERT INTO finance_payments (
        location_code, employee_name, payment_date, period_from, period_to, payment_type, amount, created_by_telegram_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `
    )
    .run(
      locationCode,
      String(employeeName || "").trim(),
      safeDate,
      safePeriodFrom,
      safePeriodTo,
      safeType,
      safeAmount,
      String(createdByTelegramId || "")
    );

  return db
    .prepare(
      `
      SELECT id, employee_name, payment_date, period_from, period_to, payment_type, amount, created_by_telegram_id, created_at
      FROM finance_payments
      WHERE id = ?
      `
    )
    .get(info.lastInsertRowid);
}

export function deleteFinancePayment({ locationCode, paymentId }) {
  const id = Number(paymentId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const existing = db
    .prepare(
      `
      SELECT id, location_code, employee_name, payment_date, period_from, period_to, payment_type, amount, created_by_telegram_id, created_at
      FROM finance_payments
      WHERE id = ?
        AND location_code = ?
      `
    )
    .get(id, locationCode);

  if (!existing) {
    return null;
  }

  db.prepare(
    `
    DELETE FROM finance_payments
    WHERE id = ?
      AND location_code = ?
    `
  ).run(id, locationCode);

  return {
    id: existing.id,
    employeeName: existing.employee_name,
    paymentDate: existing.payment_date,
    periodFrom: existing.period_from || "",
    periodTo: existing.period_to || "",
    paymentType: existing.payment_type || "payout",
    amount: existing.amount,
    createdByTelegramId: existing.created_by_telegram_id,
    createdAt: existing.created_at
  };
}

export function listEmployees() {
  return db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, phone, telegram_contact, vk_contact, position, reliability, created_at
           , telegram_id, access_role, is_protected
           , avatar_url
      FROM employees
      ORDER BY full_name COLLATE NOCASE ASC
      `
    )
    .all()
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      firstName: row.first_name,
      lastName: row.last_name,
      telegramId: row.telegram_id,
      avatarUrl: row.avatar_url,
      phone: row.phone,
      telegramContact: row.telegram_contact,
      vkContact: row.vk_contact,
      position: row.position,
      reliability: row.reliability,
      accessRole: fromDbRole(row.access_role, row.is_protected === 1),
      isProtected: row.is_protected === 1,
      createdAt: row.created_at
    }));
}

export function createEmployee({
  firstName,
  lastName,
  telegramId = "",
  avatarUrl = "",
  phone,
  telegramContact,
  vkContact,
  position,
  reliability,
  accessRole = Role.PARTICIPANT
}) {
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  const result = db
    .prepare(
      `
      INSERT INTO employees (
        full_name, first_name, last_name, telegram_id, avatar_url, phone, telegram_contact, vk_contact, position, reliability, access_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      fullName,
      firstName.trim(),
      lastName.trim(),
      telegramId.trim(),
      avatarUrl.trim(),
      phone.trim(),
      telegramContact.trim(),
      vkContact.trim(),
      position,
      reliability,
      toDbRole(accessRole)
    );

  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, avatar_url, phone, telegram_contact, vk_contact, position, reliability, access_role, is_protected, created_at
      FROM employees
      WHERE id = ?
      `
    )
    .get(result.lastInsertRowid);

  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    telegramId: row.telegram_id,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    telegramContact: row.telegram_contact,
    vkContact: row.vk_contact,
    position: row.position,
    reliability: row.reliability,
    accessRole: fromDbRole(row.access_role, row.is_protected === 1),
    isProtected: row.is_protected === 1,
    createdAt: row.created_at
  };
}

export function deleteEmployeeById(id) {
  const row = db.prepare("SELECT is_protected FROM employees WHERE id = ?").get(id);
  if (!row) {
    return { deleted: false, reason: "not_found" };
  }
  if (row.is_protected === 1) {
    return { deleted: false, reason: "protected" };
  }

  const result = db
    .prepare(
      `
      DELETE FROM employees
      WHERE id = ?
      `
    )
    .run(id);

  return { deleted: result.changes > 0, reason: result.changes > 0 ? "ok" : "not_found" };
}

export function updateEmployeeById({
  id,
  firstName,
  lastName,
  telegramId = "",
  avatarUrl = "",
  phone,
  telegramContact,
  vkContact,
  position,
  reliability,
  accessRole = Role.PARTICIPANT
}) {
  const current = db
    .prepare(
      `
      SELECT is_protected
      FROM employees
      WHERE id = ?
      `
    )
    .get(id);

  if (!current) {
    return { employee: null, reason: "not_found" };
  }

  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  const result = db
    .prepare(
      `
      UPDATE employees
      SET
        full_name = ?,
        first_name = ?,
        last_name = ?,
        telegram_id = ?,
        avatar_url = ?,
        phone = ?,
        telegram_contact = ?,
        vk_contact = ?,
        position = ?,
        reliability = ?,
        access_role = ?
      WHERE id = ?
      `
    )
    .run(
      fullName,
      firstName.trim(),
      lastName.trim(),
      telegramId.trim(),
      avatarUrl.trim(),
      phone.trim(),
      telegramContact.trim(),
      vkContact.trim(),
      position,
      reliability,
      toDbRole(accessRole),
      id
    );

  if (result.changes === 0) {
    return { employee: null, reason: "not_found" };
  }

  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, avatar_url, phone, telegram_contact, vk_contact, position, reliability, access_role, is_protected, created_at
      FROM employees
      WHERE id = ?
      `
    )
    .get(id);

  return {
    reason: "ok",
    employee: {
      id: row.id,
      fullName: row.full_name,
      firstName: row.first_name,
      lastName: row.last_name,
      telegramId: row.telegram_id,
      avatarUrl: row.avatar_url,
      phone: row.phone,
      telegramContact: row.telegram_contact,
      vkContact: row.vk_contact,
      position: row.position,
      reliability: row.reliability,
      accessRole: fromDbRole(row.access_role, row.is_protected === 1),
      isProtected: row.is_protected === 1,
      createdAt: row.created_at
    }
  };
}

export function canLoginByEmployeeAccess({ telegramId, username }) {
  const normalizedUsername = normalizeUsername(username);
  const rows = db
    .prepare(
      `
      SELECT telegram_id, telegram_contact
      FROM employees
      `
    )
    .all();

  return rows.some((row) => {
    const employeeTgId = String(row.telegram_id || "").trim();
    if (employeeTgId && employeeTgId === String(telegramId || "").trim()) {
      return true;
    }

    const employeeUsername = normalizeUsername(row.telegram_contact);
    if (employeeUsername && normalizedUsername && employeeUsername === normalizedUsername) {
      return true;
    }

    return false;
  });
}

export function isCoreAdminUsername(username) {
  return normalizeUsername(username) === "i1wqq";
}

export function bindEmployeeTelegramId({ telegramId, username }) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return;
  }

  db.prepare(
    `
    UPDATE employees
    SET telegram_id = ?
    WHERE lower(replace(telegram_contact, '@', '')) = ?
    `
  ).run(String(telegramId || "").trim(), normalizedUsername);
}

export function listShiftAssignmentsForReminderWindow({ fromDate, toDate }) {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);

  return db
    .prepare(
      `
      SELECT
        s.location_code,
        s.shift_date,
        l.title AS location_title,
        l.work_start,
        l.work_end,
        s.executor1,
        s.executor2,
        u.reminder_24_enabled,
        u.reminder_14_enabled,
        e.telegram_id,
        e.full_name,
        c.telegram_contact AS coworker_telegram_contact,
        c.vk_contact AS coworker_vk_contact,
        c.phone AS coworker_phone,
        'executor1' AS shift_role
      FROM shifts s
      JOIN locations l ON l.code = s.location_code
      JOIN employees e
        ON lower(trim(e.full_name)) = lower(trim(s.executor1))
      LEFT JOIN employees c
        ON lower(trim(c.full_name)) = lower(trim(s.executor2))
      LEFT JOIN users u
        ON trim(u.telegram_id) = trim(e.telegram_id)
      WHERE s.shift_date >= ?
        AND s.shift_date <= ?
        AND trim(s.executor1) <> ''
        AND trim(e.telegram_id) <> ''
        AND (u.telegram_id IS NULL OR u.reminder_24_enabled = 1 OR u.reminder_14_enabled = 1)

      UNION ALL

      SELECT
        s.location_code,
        s.shift_date,
        l.title AS location_title,
        l.work_start,
        l.work_end,
        s.executor1,
        s.executor2,
        u.reminder_24_enabled,
        u.reminder_14_enabled,
        e.telegram_id,
        e.full_name,
        c.telegram_contact AS coworker_telegram_contact,
        c.vk_contact AS coworker_vk_contact,
        c.phone AS coworker_phone,
        'executor2' AS shift_role
      FROM shifts s
      JOIN locations l ON l.code = s.location_code
      JOIN employees e
        ON lower(trim(e.full_name)) = lower(trim(s.executor2))
      LEFT JOIN employees c
        ON lower(trim(c.full_name)) = lower(trim(s.executor1))
      LEFT JOIN users u
        ON trim(u.telegram_id) = trim(e.telegram_id)
      WHERE s.shift_date >= ?
        AND s.shift_date <= ?
        AND trim(s.executor2) <> ''
        AND trim(e.telegram_id) <> ''
        AND (u.telegram_id IS NULL OR u.reminder_24_enabled = 1 OR u.reminder_14_enabled = 1)

      ORDER BY shift_date ASC, location_title ASC
      `
    )
    .all(from, to, from, to)
    .map((row) => {
      const normalizedExecutor1 = normalizeEmployeeName(row.executor1);
      const normalizedExecutor2 = normalizeEmployeeName(row.executor2);
      const coworkerName =
        row.shift_role === "executor1" ? normalizedExecutor2 || "" : normalizedExecutor1 || "";
      return {
        locationCode: row.location_code,
        locationTitle: row.location_title,
        shiftDate: row.shift_date,
        workStart: row.work_start || "14:00",
        workEnd: row.work_end || "22:00",
        telegramId: String(row.telegram_id || "").trim(),
        employeeName: row.full_name,
        shiftRole: row.shift_role,
        coworkerName,
        coworkerTelegramContact: String(row.coworker_telegram_contact || "").trim(),
        coworkerVkContact: String(row.coworker_vk_contact || "").trim(),
        coworkerPhone: String(row.coworker_phone || "").trim(),
        reminder24Enabled: row.reminder_24_enabled !== 0,
        reminder14Enabled: row.reminder_14_enabled !== 0
      };
    });
}

export function hasShiftReminderLog({
  telegramId,
  locationCode,
  shiftDate,
  shiftRole,
  reminderCode
}) {
  const row = db
    .prepare(
      `
      SELECT id
      FROM shift_reminder_logs
      WHERE telegram_id = ?
        AND location_code = ?
        AND shift_date = ?
        AND shift_role = ?
        AND reminder_code = ?
      LIMIT 1
      `
    )
    .get(telegramId, locationCode, shiftDate, shiftRole, reminderCode);

  return !!row;
}

export function insertShiftReminderLog({
  telegramId,
  locationCode,
  shiftDate,
  shiftRole,
  reminderCode
}) {
  const info = db
    .prepare(
      `
      INSERT OR IGNORE INTO shift_reminder_logs (
        telegram_id, location_code, shift_date, shift_role, reminder_code, created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `
    )
    .run(telegramId, locationCode, shiftDate, shiftRole, reminderCode);

  return info.changes > 0;
}

export function getEmployeeByTelegramId(telegramId) {
  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, avatar_url, phone, telegram_contact, vk_contact, position, reliability, is_protected, created_at
           , access_role
      FROM employees
      WHERE telegram_id = ?
      LIMIT 1
      `
    )
    .get(String(telegramId || "").trim());

  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    telegramId: row.telegram_id,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    telegramContact: row.telegram_contact,
    vkContact: row.vk_contact,
    position: row.position,
    reliability: row.reliability,
    accessRole: fromDbRole(row.access_role, row.is_protected === 1),
    isProtected: row.is_protected === 1,
    createdAt: row.created_at
  };
}

export function getEmployeeByAuth({ telegramId, username }) {
  const normalizedUsername = normalizeUsername(username);
  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, avatar_url, phone, telegram_contact, vk_contact, position, reliability, access_role, is_protected, created_at
      FROM employees
      WHERE telegram_id = ?
         OR lower(replace(telegram_contact, '@', '')) = ?
      ORDER BY CASE WHEN telegram_id = ? THEN 0 ELSE 1 END, id ASC
      LIMIT 1
      `
    )
    .get(String(telegramId || "").trim(), normalizedUsername, String(telegramId || "").trim());

  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    telegramId: row.telegram_id,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    telegramContact: row.telegram_contact,
    vkContact: row.vk_contact,
    position: row.position,
    reliability: row.reliability,
    accessRole: fromDbRole(row.access_role, row.is_protected === 1),
    isProtected: row.is_protected === 1,
    createdAt: row.created_at
  };
}

export function syncEmployeeTelegramProfile({ telegramId, username, photoUrl }) {
  const normalizedUsername = normalizeUsername(username);
  const tgId = String(telegramId || "").trim();
  const avatarUrl = String(photoUrl || "").trim();

  if (!tgId && !normalizedUsername) {
    return;
  }

  db.prepare(
    `
    UPDATE employees
    SET
      telegram_id = CASE WHEN telegram_id = '' THEN ? ELSE telegram_id END,
      avatar_url = CASE WHEN ? <> '' THEN ? ELSE avatar_url END
    WHERE telegram_id = ?
       OR lower(replace(telegram_contact, '@', '')) = ?
    `
  ).run(tgId, avatarUrl, avatarUrl, tgId, normalizedUsername);
}

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

function nowIso() {
  return new Date().toISOString();
}

function normalizeIp(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeUserAgent(value) {
  return String(value || "").trim().slice(0, 400);
}

function normalizePin(value) {
  return String(value || "").replace(/\s+/g, "");
}

function isValidPinFormat(pin) {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;
}

function createPinHash(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}

function createSessionId() {
  return crypto.randomBytes(24).toString("hex");
}

function getUserById(userId) {
  return db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, is_super_admin
      FROM users
      WHERE id = ?
      LIMIT 1
      `
    )
    .get(userId);
}

function getPinSettingsByUserId(userId) {
  const row = db
    .prepare(
      `
      SELECT user_id, pin_hash, pin_salt, is_enabled, failed_attempts, lock_until, updated_at
      FROM security_pin_settings
      WHERE user_id = ?
      LIMIT 1
      `
    )
    .get(userId);

  if (!row) {
    db.prepare(
      `
      INSERT INTO security_pin_settings (
        user_id, pin_hash, pin_salt, is_enabled, failed_attempts, lock_until, updated_at
      ) VALUES (?, '', '', 0, 0, '', datetime('now'))
      `
    ).run(userId);
    return db
      .prepare(
        `
        SELECT user_id, pin_hash, pin_salt, is_enabled, failed_attempts, lock_until, updated_at
        FROM security_pin_settings
        WHERE user_id = ?
        LIMIT 1
        `
      )
      .get(userId);
  }

  return row;
}

function mapPinState(row) {
  const lockUntilIso = String(row?.lock_until || "").trim();
  const lockUntilTs = lockUntilIso ? Date.parse(lockUntilIso) : NaN;
  const isLocked = Number.isFinite(lockUntilTs) && lockUntilTs > Date.now();
  const attemptsLeft = Math.max(0, PIN_MAX_ATTEMPTS - Number(row?.failed_attempts || 0));
  return {
    enabled: row?.is_enabled === 1,
    failedAttempts: Number(row?.failed_attempts || 0),
    attemptsLeft,
    lockedUntil: isLocked ? lockUntilIso : "",
    isLocked
  };
}

export function getPinStateByTelegramId(telegramId) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return null;
  const row = getPinSettingsByUserId(user.id);
  return mapPinState(row);
}

export function createUserSession({
  telegramId,
  deviceName = "",
  platform = "",
  userAgent = "",
  ipAddress = ""
}) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return null;
  const pinState = getPinStateByTelegramId(telegramId);
  const sessionId = createSessionId();
  db.prepare(
    `
    INSERT INTO user_sessions (
      session_id, user_id, telegram_id, device_name, platform, user_agent, ip_address, pin_verified, created_at, last_active_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), '')
    `
  ).run(
    sessionId,
    user.id,
    user.telegramId,
    String(deviceName || "").trim().slice(0, 120),
    String(platform || "").trim().slice(0, 60),
    normalizeUserAgent(userAgent),
    normalizeIp(ipAddress),
    pinState?.enabled ? 0 : 1
  );

  return db
    .prepare(
      `
      SELECT id, session_id, user_id, telegram_id, device_name, platform, user_agent, ip_address, pin_verified, created_at, last_active_at
      FROM user_sessions
      WHERE session_id = ?
      LIMIT 1
      `
    )
    .get(sessionId);
}

export function getActiveSessionWithUser({ telegramId, sessionId }) {
  const safeTelegramId = String(telegramId || "").trim();
  const safeSessionId = String(sessionId || "").trim();
  if (!safeTelegramId || !safeSessionId) return null;

  const row = db
    .prepare(
      `
      SELECT
        s.id AS session_db_id,
        s.session_id,
        s.user_id,
        s.telegram_id,
        s.device_name,
        s.platform,
        s.user_agent,
        s.ip_address,
        s.pin_verified,
        s.created_at AS session_created_at,
        s.last_active_at,
        u.id,
        u.telegram_id,
        u.full_name,
        u.role,
        u.is_super_admin,
        u.reminder_24_enabled,
        u.reminder_14_enabled,
        u.created_at,
        u.updated_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_id = ?
        AND s.telegram_id = ?
        AND (s.revoked_at IS NULL OR s.revoked_at = '')
      LIMIT 1
      `
    )
    .get(safeSessionId, safeTelegramId);

  if (!row) return null;

  const user = mapUserRow(row);
  return {
    user,
    session: {
      id: row.session_id,
      dbId: row.session_db_id,
      userId: row.user_id,
      deviceName: row.device_name,
      platform: row.platform,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      pinVerified: row.pin_verified === 1,
      createdAt: row.session_created_at,
      lastActiveAt: row.last_active_at
    }
  };
}

export function touchSession(sessionId) {
  db.prepare(
    `
    UPDATE user_sessions
    SET last_active_at = datetime('now')
    WHERE session_id = ?
      AND (revoked_at IS NULL OR revoked_at = '')
    `
  ).run(String(sessionId || "").trim());
}

export function setSessionPinVerified({ sessionId, verified }) {
  db.prepare(
    `
    UPDATE user_sessions
    SET pin_verified = ?, last_active_at = datetime('now')
    WHERE session_id = ?
      AND (revoked_at IS NULL OR revoked_at = '')
    `
  ).run(verified ? 1 : 0, String(sessionId || "").trim());
}

export function revokeSession({ userId, sessionId }) {
  const result = db
    .prepare(
      `
      UPDATE user_sessions
      SET revoked_at = datetime('now')
      WHERE user_id = ?
        AND session_id = ?
        AND (revoked_at IS NULL OR revoked_at = '')
      `
    )
    .run(userId, String(sessionId || "").trim());
  return result.changes > 0;
}

export function revokeOtherSessions({ userId, currentSessionId }) {
  const result = db
    .prepare(
      `
      UPDATE user_sessions
      SET revoked_at = datetime('now')
      WHERE user_id = ?
        AND session_id <> ?
        AND (revoked_at IS NULL OR revoked_at = '')
      `
    )
    .run(userId, String(currentSessionId || "").trim());
  return result.changes;
}

export function listActiveSessionsByUserId({ userId, currentSessionId = "" }) {
  const rows = db
    .prepare(
      `
      SELECT session_id, user_id, telegram_id, device_name, platform, user_agent, ip_address, pin_verified, created_at, last_active_at
      FROM user_sessions
      WHERE user_id = ?
        AND (revoked_at IS NULL OR revoked_at = '')
      ORDER BY datetime(last_active_at) DESC, id DESC
      `
    )
    .all(userId);

  const current = String(currentSessionId || "").trim();
  return rows.map((row) => ({
    id: row.session_id,
    deviceName: row.device_name || "Устройство",
    platform: row.platform || "",
    userAgent: row.user_agent || "",
    ipAddress: row.ip_address || "",
    pinVerified: row.pin_verified === 1,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    isCurrent: current && row.session_id === current
  }));
}

export function enablePinForUser({ telegramId, pin }) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return { ok: false, reason: "not_found" };
  const normalizedPin = normalizePin(pin);
  if (!isValidPinFormat(normalizedPin)) {
    return { ok: false, reason: "invalid_pin" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = createPinHash(normalizedPin, salt);

  db.prepare(
    `
    INSERT INTO security_pin_settings (user_id, pin_hash, pin_salt, is_enabled, failed_attempts, lock_until, updated_at)
    VALUES (?, ?, ?, 1, 0, '', datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      pin_hash = excluded.pin_hash,
      pin_salt = excluded.pin_salt,
      is_enabled = 1,
      failed_attempts = 0,
      lock_until = '',
      updated_at = datetime('now')
    `
  ).run(user.id, hash, salt);

  db.prepare(
    `
    UPDATE user_sessions
    SET pin_verified = CASE WHEN user_id = ? THEN pin_verified ELSE pin_verified END
    WHERE user_id = ?
      AND (revoked_at IS NULL OR revoked_at = '')
    `
  ).run(user.id, user.id);

  return { ok: true, state: getPinStateByTelegramId(telegramId) };
}

function comparePin({ row, pin }) {
  if (!row?.pin_hash || !row?.pin_salt) return false;
  const incomingHash = createPinHash(pin, row.pin_salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(incomingHash, "hex"), Buffer.from(row.pin_hash, "hex"));
  } catch {
    return false;
  }
}

export function verifyPinForUser({ telegramId, pin }) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return { ok: false, reason: "not_found" };

  const row = getPinSettingsByUserId(user.id);
  if (!row || row.is_enabled !== 1) {
    return { ok: false, reason: "not_enabled", state: mapPinState(row || {}) };
  }

  const state = mapPinState(row);
  if (state.isLocked) {
    return { ok: false, reason: "locked", state };
  }

  const normalizedPin = normalizePin(pin);
  if (!isValidPinFormat(normalizedPin)) {
    return { ok: false, reason: "invalid_pin", state };
  }

  const isMatch = comparePin({ row, pin: normalizedPin });
  if (isMatch) {
    db.prepare(
      `
      UPDATE security_pin_settings
      SET failed_attempts = 0,
          lock_until = '',
          updated_at = datetime('now')
      WHERE user_id = ?
      `
    ).run(user.id);
    return { ok: true, state: getPinStateByTelegramId(telegramId) };
  }

  const nextFailedAttempts = Number(row.failed_attempts || 0) + 1;
  if (nextFailedAttempts >= PIN_MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000).toISOString();
    db.prepare(
      `
      UPDATE security_pin_settings
      SET failed_attempts = ?,
          lock_until = ?,
          updated_at = datetime('now')
      WHERE user_id = ?
      `
    ).run(nextFailedAttempts, lockUntil, user.id);
    return {
      ok: false,
      reason: "locked",
      state: getPinStateByTelegramId(telegramId)
    };
  }

  db.prepare(
    `
    UPDATE security_pin_settings
    SET failed_attempts = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
    `
  ).run(nextFailedAttempts, user.id);

  return {
    ok: false,
    reason: "invalid_pin",
    state: getPinStateByTelegramId(telegramId)
  };
}

export function disablePinForUser({ telegramId, currentPin }) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return { ok: false, reason: "not_found" };
  const row = getPinSettingsByUserId(user.id);
  if (!row || row.is_enabled !== 1) return { ok: false, reason: "not_enabled" };

  const normalizedPin = normalizePin(currentPin);
  if (!isValidPinFormat(normalizedPin) || !comparePin({ row, pin: normalizedPin })) {
    return { ok: false, reason: "invalid_pin" };
  }

  db.prepare(
    `
    UPDATE security_pin_settings
    SET is_enabled = 0,
        pin_hash = '',
        pin_salt = '',
        failed_attempts = 0,
        lock_until = '',
        updated_at = datetime('now')
    WHERE user_id = ?
    `
  ).run(user.id);

  db.prepare(
    `
    UPDATE user_sessions
    SET pin_verified = 1
    WHERE user_id = ?
      AND (revoked_at IS NULL OR revoked_at = '')
    `
  ).run(user.id);

  return { ok: true, state: getPinStateByTelegramId(telegramId) };
}

export function changePinForUser({ telegramId, currentPin, newPin }) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return { ok: false, reason: "not_found" };
  const row = getPinSettingsByUserId(user.id);
  if (!row || row.is_enabled !== 1) return { ok: false, reason: "not_enabled" };

  const normalizedCurrentPin = normalizePin(currentPin);
  const normalizedNewPin = normalizePin(newPin);
  if (!isValidPinFormat(normalizedCurrentPin) || !comparePin({ row, pin: normalizedCurrentPin })) {
    return { ok: false, reason: "invalid_current_pin" };
  }
  if (!isValidPinFormat(normalizedNewPin)) {
    return { ok: false, reason: "invalid_new_pin" };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = createPinHash(normalizedNewPin, salt);
  db.prepare(
    `
    UPDATE security_pin_settings
    SET pin_hash = ?,
        pin_salt = ?,
        is_enabled = 1,
        failed_attempts = 0,
        lock_until = '',
        updated_at = datetime('now')
    WHERE user_id = ?
    `
  ).run(hash, salt, user.id);

  return { ok: true, state: getPinStateByTelegramId(telegramId) };
}

export function resetPinForTelegramId({ telegramId }) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return { ok: false, reason: "not_found" };
  db.prepare(
    `
    UPDATE security_pin_settings
    SET is_enabled = 0,
        pin_hash = '',
        pin_salt = '',
        failed_attempts = 0,
        lock_until = '',
        updated_at = datetime('now')
    WHERE user_id = ?
    `
  ).run(user.id);

  db.prepare(
    `
    UPDATE user_sessions
    SET pin_verified = 1
    WHERE user_id = ?
      AND (revoked_at IS NULL OR revoked_at = '')
    `
  ).run(user.id);

  return { ok: true };
}

export function logAuditEvent({
  scope = "PERSONAL",
  eventType,
  actorUser = null,
  actorTelegramId = "",
  actorRole = "",
  targetUserId = null,
  targetTelegramId = "",
  sessionId = "",
  ipAddress = "",
  userAgent = "",
  meta = {},
  systemView = "TARGET_USER"
}) {
  if (!eventType) return;
  const normalizedScope = scope === "SYSTEM" ? "SYSTEM" : "PERSONAL";
  const safeSystemView = ["TARGET_USER", "ALL_ADMINS", "ALL_USERS", "SUPERADMIN_ONLY"].includes(systemView)
    ? systemView
    : "TARGET_USER";
  db.prepare(
    `
    INSERT INTO security_audit_logs (
      scope, event_type, actor_user_id, actor_telegram_id, actor_role, target_user_id, target_telegram_id, session_id, ip_address, user_agent, meta_json, system_view, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `
  ).run(
    normalizedScope,
    String(eventType).slice(0, 120),
    actorUser?.id ?? null,
    String(actorTelegramId || actorUser?.telegramId || "").slice(0, 64),
    String(actorRole || actorUser?.role || "").slice(0, 24),
    targetUserId ?? null,
    String(targetTelegramId || "").slice(0, 64),
    String(sessionId || "").slice(0, 120),
    normalizeIp(ipAddress),
    normalizeUserAgent(userAgent),
    JSON.stringify(meta || {}),
    safeSystemView
  );
}

function parseAuditMeta(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

export function listAuditLogsForViewer({ viewerUser, scope = "PERSONAL", limit = 50 }) {
  if (!viewerUser?.id) return [];
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const normalizedScope = scope === "SYSTEM" ? "SYSTEM" : "PERSONAL";

  let rows = [];
  if (normalizedScope === "PERSONAL") {
    rows = db
      .prepare(
        `
        SELECT *
        FROM security_audit_logs
        WHERE scope = 'PERSONAL'
          AND actor_user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
        `
      )
      .all(viewerUser.id, safeLimit);
  } else if (viewerUser.role === Role.SUPERADMIN) {
    rows = db
      .prepare(
        `
        SELECT *
        FROM security_audit_logs
        WHERE scope = 'SYSTEM'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
        `
      )
      .all(safeLimit);
  } else if (viewerUser.role === Role.ADMIN) {
    rows = db
      .prepare(
        `
        SELECT *
        FROM security_audit_logs
        WHERE scope = 'SYSTEM'
          AND (
            system_view IN ('ALL_ADMINS', 'ALL_USERS')
            OR actor_user_id = ?
            OR target_user_id = ?
          )
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
        `
      )
      .all(viewerUser.id, viewerUser.id, safeLimit);
  } else {
    rows = db
      .prepare(
        `
        SELECT *
        FROM security_audit_logs
        WHERE scope = 'SYSTEM'
          AND (
            system_view = 'ALL_USERS'
            OR actor_user_id = ?
            OR target_user_id = ?
          )
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
        `
      )
      .all(viewerUser.id, viewerUser.id, safeLimit);
  }

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    actorTelegramId: row.actor_telegram_id,
    actorRole: row.actor_role,
    targetUserId: row.target_user_id,
    targetTelegramId: row.target_telegram_id,
    sessionId: row.session_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    meta: parseAuditMeta(row.meta_json),
    systemView: row.system_view,
    createdAt: row.created_at
  }));
}

export function getPinPolicy() {
  return {
    minLength: PIN_MIN_LENGTH,
    maxLength: PIN_MAX_LENGTH,
    maxAttempts: PIN_MAX_ATTEMPTS,
    lockMinutes: PIN_LOCK_MINUTES
  };
}
