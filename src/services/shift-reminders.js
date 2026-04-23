import { env } from "../config/env.js";
import {
  hasShiftReminderLog,
  insertShiftReminderLog,
  listShiftAssignmentsForReminderWindow
} from "../db.js";

const REMINDER_POINTS = [
  { code: "before_24h", hoursBefore: 24, label: "завтрашней смене" },
  { code: "before_14h", hoursBefore: 14, label: "завтрашней смене" }
];

const POLL_INTERVAL_MS = 60 * 1000;
const REMINDER_WINDOW_MS = 60 * 1000;
const MSK_OFFSET_HOURS = 3;

function toMskDateString(date = new Date()) {
  const ms = date.getTime() + MSK_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const [year, month, day] = String(isoDate || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return isoDate;
  const utc = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  const y = String(utc.getUTCFullYear());
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMskDateTimeMs(isoDate, hhmm) {
  const [year, month, day] = String(isoDate || "")
    .split("-")
    .map((value) => Number(value));
  const [hour, minute] = String(hhmm || "14:00")
    .split(":")
    .map((value) => Number(value));
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return Number.NaN;
  }
  return Date.UTC(year, month - 1, day, hour - MSK_OFFSET_HOURS, minute, 0, 0);
}

function formatRuDate(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

function formatCoworkerContactLine({ coworkerTelegramContact, coworkerVkContact, coworkerPhone }) {
  const tg = String(coworkerTelegramContact || "").trim() || "не указан";
  const vk = String(coworkerVkContact || "").trim() || "не указан";
  const phone = String(coworkerPhone || "").trim() || "не указан";
  return `тг: ${tg}, вк: ${vk}, телефон: ${phone}`;
}

async function sendTelegramMessage({ telegramId, text }) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return false;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram send failed: ${response.status} ${body}`);
  }

  const data = await response.json().catch(() => ({}));
  return !!data?.ok;
}

function buildReminderText({
  employeeName,
  shiftDate,
  workStart,
  workEnd,
  locationTitle,
  pointLabel,
  coworkerName,
  coworkerTelegramContact,
  coworkerVkContact,
  coworkerPhone
}) {
  const teammateLine = coworkerName
    ? `Смена с ${coworkerName} (${formatCoworkerContactLine({
        coworkerTelegramContact,
        coworkerVkContact,
        coworkerPhone
      })})`
    : "Вы одни на смене";
  return [
    `Напоминание о ${pointLabel}`,
    `${employeeName || "Сотрудник"}, у вас смена ${formatRuDate(shiftDate)} с ${workStart} - ${workEnd}`,
    teammateLine,
    `ПВЗ: ${locationTitle}`,
    `Часы работы: ${workStart} - ${workEnd}`
  ].join("\n");
}

async function processShiftRemindersTick() {
  const nowMs = Date.now();
  const todayMsk = toMskDateString();
  const fromDate = addDays(todayMsk, -1);
  const toDate = addDays(todayMsk, 2);

  const assignments = listShiftAssignmentsForReminderWindow({ fromDate, toDate });
  for (const assignment of assignments) {
    const shiftStartMs = parseMskDateTimeMs(assignment.shiftDate, assignment.workStart);
    if (!Number.isFinite(shiftStartMs)) continue;
    if (nowMs >= shiftStartMs) continue;

    for (const point of REMINDER_POINTS) {
      const triggerMs = shiftStartMs - point.hoursBefore * 60 * 60 * 1000;
      const deltaMs = nowMs - triggerMs;
      const shouldSendBySchedule = deltaMs >= 0 && deltaMs < REMINDER_WINDOW_MS;
      if (!shouldSendBySchedule) continue;

      const reminderCode = point.code;
      const alreadySent = hasShiftReminderLog({
        telegramId: assignment.telegramId,
        locationCode: assignment.locationCode,
        shiftDate: assignment.shiftDate,
        shiftRole: assignment.shiftRole,
        reminderCode
      });
      if (alreadySent) continue;

      const isEnabledForPoint =
        point.code === "before_24h"
          ? assignment.reminder24Enabled !== false
          : assignment.reminder14Enabled !== false;
      if (!isEnabledForPoint) continue;

      try {
        await sendTelegramMessage({
          telegramId: assignment.telegramId,
          text: buildReminderText({
            employeeName: assignment.employeeName,
            shiftDate: assignment.shiftDate,
            workStart: assignment.workStart,
            workEnd: assignment.workEnd,
            locationTitle: assignment.locationTitle,
            pointLabel: point.label,
            coworkerName: assignment.coworkerName,
            coworkerTelegramContact: assignment.coworkerTelegramContact,
            coworkerVkContact: assignment.coworkerVkContact,
            coworkerPhone: assignment.coworkerPhone
          })
        });
        insertShiftReminderLog({
          telegramId: assignment.telegramId,
          locationCode: assignment.locationCode,
          shiftDate: assignment.shiftDate,
          shiftRole: assignment.shiftRole,
          reminderCode
        });
      } catch (error) {
        console.error("[shift-reminders] send failed:", error.message);
      }
    }
  }
}

export function startShiftReminders() {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.log("[shift-reminders] skipped: TELEGRAM_BOT_TOKEN is empty");
    return;
  }

  let isRunning = false;
  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processShiftRemindersTick();
    } catch (error) {
      console.error("[shift-reminders] tick error:", error.message);
    } finally {
      isRunning = false;
    }
  };

  run();
  setInterval(run, POLL_INTERVAL_MS);
  console.log("[shift-reminders] started");
}
