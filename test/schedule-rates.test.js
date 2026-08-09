import test from "node:test";
import assert from "node:assert/strict";
import { calculateShiftRates } from "../src/lib/schedule-rates.js";

const base = {
  dailyRate: 4000,
  locationWorkStart: "10:00",
  locationWorkEnd: "22:00"
};

test("one employee receives the full daily rate", () => {
  const result = calculateShiftRates({
    ...base,
    executor1: "1",
    executor2: "",
    executor1Start: "10:00",
    executor1End: "22:00"
  });
  assert.equal(result.ok, true);
  assert.equal(result.rate1, 4000);
  assert.equal(result.rate2, 0);
});

test("two equal half-shifts split the daily rate", () => {
  const result = calculateShiftRates({
    ...base,
    executor1: "1",
    executor2: "2",
    executor1Start: "10:00",
    executor1End: "16:00",
    executor2Start: "16:00",
    executor2End: "22:00"
  });
  assert.equal(result.ok, true);
  assert.equal(result.rate1, 2000);
  assert.equal(result.rate2, 2000);
});

test("employee time outside location hours is rejected", () => {
  const result = calculateShiftRates({
    ...base,
    executor1: "1",
    executor2: "",
    executor1Start: "09:00",
    executor1End: "22:00"
  });
  assert.equal(result.ok, false);
});
