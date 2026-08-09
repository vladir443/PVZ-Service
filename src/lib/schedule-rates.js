export function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

export function calculateShiftRates({
  dailyRate,
  locationWorkStart,
  locationWorkEnd,
  executor1,
  executor2,
  executor1Start,
  executor1End,
  executor2Start,
  executor2End
}) {
  const locationStartMinutes = timeToMinutes(locationWorkStart);
  const locationEndMinutes = timeToMinutes(locationWorkEnd);
  const locationMinutes = locationEndMinutes - locationStartMinutes;
  if (!Number.isFinite(locationMinutes) || locationMinutes <= 0) {
    return { ok: false, message: "В админ-панели указан некорректный график ПВЗ" };
  }

  const normalizeExecutorTime = (executor, start, end, label) => {
    if (!executor) return { start: "", end: "", minutes: 0 };
    const safeStart = String(start || locationWorkStart);
    const safeEnd = String(end || locationWorkEnd);
    const startMinutes = timeToMinutes(safeStart);
    const endMinutes = timeToMinutes(safeEnd);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      return { error: `Укажите корректное время для ${label}` };
    }
    if (startMinutes < locationStartMinutes || endMinutes > locationEndMinutes) {
      return {
        error: `${label}: время должно быть в пределах работы ПВЗ ${locationWorkStart}–${locationWorkEnd}`
      };
    }
    if (endMinutes <= startMinutes) {
      return { error: `${label}: окончание должно быть позже начала` };
    }
    return { start: safeStart, end: safeEnd, minutes: endMinutes - startMinutes };
  };

  const first = normalizeExecutorTime(
    executor1,
    executor1Start,
    executor1End,
    "Исполнителя1"
  );
  if (first.error) return { ok: false, message: first.error };
  const second = normalizeExecutorTime(
    executor2,
    executor2Start,
    executor2End,
    "Исполнителя2"
  );
  if (second.error) return { ok: false, message: second.error };

  const safeDailyRate = Math.max(0, Number(dailyRate || 0));
  const totalEmployeeMinutes = first.minutes + second.minutes;
  const divisor = Math.max(locationMinutes, totalEmployeeMinutes);
  let rate1 = divisor > 0 ? Math.round((safeDailyRate * first.minutes) / divisor) : 0;
  let rate2 = divisor > 0 ? Math.round((safeDailyRate * second.minutes) / divisor) : 0;
  const overflow = rate1 + rate2 - safeDailyRate;
  if (overflow > 0) {
    if (rate2 > 0) rate2 = Math.max(0, rate2 - overflow);
    else rate1 = Math.max(0, rate1 - overflow);
  }

  return {
    ok: true,
    executor1Start: first.start,
    executor1End: first.end,
    executor2Start: second.start,
    executor2End: second.end,
    executor1Minutes: first.minutes,
    executor2Minutes: second.minutes,
    locationMinutes,
    rate1,
    rate2
  };
}
