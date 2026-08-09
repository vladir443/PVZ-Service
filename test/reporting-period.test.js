import test from "node:test";
import assert from "node:assert/strict";
import { getMoscowIsoDate, getReportPeriod } from "../src/lib/reporting-period.js";

test("Moscow date changes at midnight Moscow time", () => {
  assert.equal(getMoscowIsoDate(Date.UTC(2026, 7, 8, 20, 59)), "2026-08-08");
  assert.equal(getMoscowIsoDate(Date.UTC(2026, 7, 8, 21, 0)), "2026-08-09");
});

test("current month report includes today but excludes tomorrow", () => {
  assert.deepEqual(getReportPeriod("2026-08", "2026-08-09"), {
    from: "2026-08-01",
    to: "2026-08-09"
  });
});

test("past month report includes the whole month and future month is empty", () => {
  assert.deepEqual(getReportPeriod("2026-07", "2026-08-09"), {
    from: "2026-07-01",
    to: "2026-07-31"
  });
  assert.deepEqual(getReportPeriod("2026-09", "2026-08-09"), {
    from: "2026-09-01",
    to: ""
  });
});
