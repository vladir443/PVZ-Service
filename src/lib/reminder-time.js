export function isReminderDue({ nowMs, shiftStartMs, hoursBefore }) {
  const triggerMs = shiftStartMs - hoursBefore * 60 * 60 * 1000;
  return nowMs >= triggerMs && nowMs < shiftStartMs;
}
