import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pvz-database-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.FILE_STORAGE_PATH = path.join(directory, "files");
process.env.BACKUP_PATH = path.join(directory, "backups");
process.env.SMTP_USER = "owner-test@example.com";

const database = await import(`../src/db.js?test=${Date.now()}`);

test("database transaction rolls back all employee changes", () => {
  const email = `rollback-${Date.now()}@example.com`;
  assert.throws(() => {
    database.runDatabaseTransaction(() => {
      database.createEmployee({
        firstName: "Test",
        lastName: "Rollback",
        email,
        phone: "+79990000000",
        telegramContact: "",
        vkContact: "",
        position: "Менеджер",
        reliability: "Надежный"
      });
      throw new Error("rollback");
    });
  });
  assert.equal(database.listEmployees().some((employee) => employee.email === email), false);
});

test("email code cooldown is persisted in SQLite", () => {
  const nowMs = Date.now();
  const request = { email: "limit@example.com", ipAddress: "127.0.0.5" };
  assert.equal(database.reserveEmailCodeRequest({ ...request, nowMs }).ok, true);
  assert.equal(database.reserveEmailCodeRequest({ ...request, nowMs: nowMs + 1000 }).ok, false);
  assert.equal(database.reserveEmailCodeRequest({ ...request, nowMs: nowMs + 61_000 }).ok, true);
});
