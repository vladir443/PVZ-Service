import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
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

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

if (!hasColumn("users", "is_super_admin")) {
  db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;");
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
    role: fromDbRole(row.role, row.is_super_admin === 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getUserByTelegramId(telegramId) {
  const row = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
           , is_super_admin
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
    INSERT INTO users (telegram_id, full_name, role, is_super_admin, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
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

export function listUsers() {
  const rows = db
    .prepare(
      `
      SELECT id, telegram_id, full_name, role, created_at, updated_at
           , is_super_admin
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
      AND (telegram_id = '' OR telegram_id IS NULL)
    `
  ).run(String(telegramId || "").trim(), normalizedUsername);
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
