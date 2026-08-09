import test from "node:test";
import assert from "node:assert/strict";
import { isReminderDue } from "../src/lib/reminder-time.js";

const hour = 60 * 60 * 1000;
const shiftStartMs = 100 * hour;

test("reminder is not due before its trigger", () => {
  assert.equal(
    isReminderDue({ nowMs: shiftStartMs - 24 * hour - 1, shiftStartMs, hoursBefore: 24 }),
    false
  );
});

test("missed reminder remains due until the shift starts", () => {
  assert.equal(
    isReminderDue({ nowMs: shiftStartMs - 22 * hour, shiftStartMs, hoursBefore: 24 }),
    true
  );
});

test("reminder is not sent after the shift starts", () => {
  assert.equal(isReminderDue({ nowMs: shiftStartMs, shiftStartMs, hoursBefore: 14 }), false);
});
