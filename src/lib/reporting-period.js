const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getMoscowIsoDate(nowMs = Date.now()) {
  return new Date(nowMs + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

export function getMonthEndIso(month) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return "";
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export function getReportPeriod(month, todayIso = getMoscowIsoDate()) {
  const from = `${month}-01`;
  const monthEnd = getMonthEndIso(month);
  if (!/^\d{4}-\d{2}-01$/.test(from) || !monthEnd) return { from: "", to: "" };
  if (todayIso < from) return { from, to: "" };
  return { from, to: todayIso < monthEnd ? todayIso : monthEnd };
}
