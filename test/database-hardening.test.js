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

test("PIN recovery token is bound to one session and can only be used once", () => {
  const authId = `email:recovery-${Date.now()}@example.com`;
  const user = database.createUser({
    telegramId: authId,
    fullName: "Recovery Test",
    role: "PARTICIPANT"
  });
  database.enablePinForUser({ telegramId: authId, pin: "1111" });
  const currentSession = database.createUserSession({ telegramId: authId, deviceName: "current" });
  const otherSession = database.createUserSession({ telegramId: authId, deviceName: "other" });
  const recovery = database.createPinRecoveryToken({
    userId: user.id,
    sessionId: currentSession.session_id
  });

  assert.equal(recovery.ok, true);
  const completed = database.completePinRecovery({
    userId: user.id,
    telegramId: authId,
    sessionId: currentSession.session_id,
    token: recovery.token,
    newPin: "2468"
  });
  assert.equal(completed.ok, true);
  assert.equal(database.verifyPinForUser({ telegramId: authId, pin: "2468" }).ok, true);
  assert.equal(
    database.completePinRecovery({
      userId: user.id,
      telegramId: authId,
      sessionId: currentSession.session_id,
      token: recovery.token,
      newPin: "1357"
    }).ok,
    false
  );

  const sessions = database.listActiveSessionsByUserId({
    userId: user.id,
    currentSessionId: currentSession.session_id
  });
  assert.equal(sessions.find((session) => session.id === currentSession.session_id)?.pinVerified, true);
  assert.equal(sessions.find((session) => session.id === otherSession.session_id)?.pinVerified, false);
});
