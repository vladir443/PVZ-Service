import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL
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
    phone TEXT NOT NULL DEFAULT '',
    telegram_contact TEXT NOT NULL DEFAULT '',
    vk_contact TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT 'manager',
    reliability TEXT NOT NULL DEFAULT 'checking',
    is_protected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
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
if (!hasColumn("employees", "position")) {
  db.exec("ALTER TABLE employees ADD COLUMN position TEXT NOT NULL DEFAULT 'manager';");
}
if (!hasColumn("employees", "reliability")) {
  db.exec("ALTER TABLE employees ADD COLUMN reliability TEXT NOT NULL DEFAULT 'checking';");
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
      full_name, first_name, last_name, telegram_id, phone, telegram_contact, vk_contact, position, reliability, is_protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reliable', 1)
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
  { code: "WB_MENZHINSKOGO_1K4", title: "wb Менжинского 1к4" },
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
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getUserByTelegramId(telegramId) {
  const row = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
      FROM users
      WHERE telegram_id = ?
      `
    )
    .get(telegramId);

  return mapUserRow(row);
}

export function createUser({ telegramId, fullName, role }) {
  db.prepare(
    `
    INSERT INTO users (telegram_id, full_name, role, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    `
  ).run(telegramId, fullName, role);

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

export function updateUserRole({ telegramId, role }) {
  const result = db.prepare(
    `
    UPDATE users
    SET role = ?, updated_at = datetime('now')
    WHERE telegram_id = ?
    `
  ).run(role, telegramId);

  if (result.changes === 0) {
    return null;
  }

  return getUserByTelegramId(telegramId);
}

export function listUsers() {
  const rows = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
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
    .prepare("SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN'")
    .get();
  return row.total;
}

export function listLocations() {
  return db
    .prepare(
      `
      SELECT code, title
      FROM locations
      ORDER BY title ASC
      `
    )
    .all();
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
      SELECT shift_date, executor1, executor2, rate1, rate2, deductions, bonuses
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
      deductions: existing?.deductions ?? 0,
      bonuses: existing?.bonuses ?? 0
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
  deductions,
  bonuses
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
      location_code, shift_date, executor1, executor2, rate1, rate2, deductions, bonuses, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(location_code, shift_date) DO UPDATE SET
      executor1 = excluded.executor1,
      executor2 = excluded.executor2,
      rate1 = excluded.rate1,
      rate2 = excluded.rate2,
      deductions = excluded.deductions,
      bonuses = excluded.bonuses,
      updated_at = datetime('now')
    `
  ).run(locationCode, date, executor1, executor2, rate1, rate2, deductions, bonuses);

  return db
    .prepare(
      `
      SELECT location_code, shift_date, executor1, executor2, rate1, rate2, deductions, bonuses, updated_at
      FROM shifts
      WHERE location_code = ?
        AND shift_date = ?
      `
    )
    .get(locationCode, date);
}

export function listEmployees() {
  return db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, phone, telegram_contact, vk_contact, position, reliability, created_at
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
      phone: row.phone,
      telegramContact: row.telegram_contact,
      vkContact: row.vk_contact,
      position: row.position,
      reliability: row.reliability,
      isProtected: row.is_protected === 1,
      createdAt: row.created_at
    }));
}

export function createEmployee({
  firstName,
  lastName,
  telegramId = "",
  phone,
  telegramContact,
  vkContact,
  position,
  reliability
}) {
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  const result = db
    .prepare(
      `
      INSERT INTO employees (
        full_name, first_name, last_name, telegram_id, phone, telegram_contact, vk_contact, position, reliability
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      fullName,
      firstName.trim(),
      lastName.trim(),
      telegramId.trim(),
      phone.trim(),
      telegramContact.trim(),
      vkContact.trim(),
      position,
      reliability
    );

  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, phone, telegram_contact, vk_contact, position, reliability, created_at
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
    phone: row.phone,
    telegramContact: row.telegram_contact,
    vkContact: row.vk_contact,
    position: row.position,
    reliability: row.reliability,
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
  phone,
  telegramContact,
  vkContact,
  position,
  reliability
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

  if (current.is_protected === 1) {
    return { employee: null, reason: "protected" };
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
        phone = ?,
        telegram_contact = ?,
        vk_contact = ?,
        position = ?,
        reliability = ?
      WHERE id = ?
      `
    )
    .run(
      fullName,
      firstName.trim(),
      lastName.trim(),
      telegramId.trim(),
      phone.trim(),
      telegramContact.trim(),
      vkContact.trim(),
      position,
      reliability,
      id
    );

  if (result.changes === 0) {
    return { employee: null, reason: "not_found" };
  }

  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, phone, telegram_contact, vk_contact, position, reliability, is_protected, created_at
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
      phone: row.phone,
      telegramContact: row.telegram_contact,
      vkContact: row.vk_contact,
      position: row.position,
      reliability: row.reliability,
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
      AND (telegram_id = '' OR telegram_id IS NULL)
    `
  ).run(String(telegramId || "").trim(), normalizedUsername);
}

export function getEmployeeByTelegramId(telegramId) {
  const row = db
    .prepare(
      `
      SELECT id, full_name, first_name, last_name, telegram_id, phone, telegram_contact, vk_contact, position, reliability, is_protected, created_at
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
    phone: row.phone,
    telegramContact: row.telegram_contact,
    vkContact: row.vk_contact,
    position: row.position,
    reliability: row.reliability,
    isProtected: row.is_protected === 1,
    createdAt: row.created_at
  };
}
