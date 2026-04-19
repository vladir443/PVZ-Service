import Database from "better-sqlite3";
import { env } from "./config/env.js";

const db = new Database(env.DATABASE_PATH);
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
