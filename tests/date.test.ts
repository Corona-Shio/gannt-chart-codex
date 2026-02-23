import { describe, expect, it } from "vitest";

import { dateRange, daysBetween, isJapaneseHoliday, isNonWorkingDay, isWeekend } from "../lib/date";

describe("date utilities", () => {
  it("returns inclusive date range", () => {
    expect(dateRange("2026-02-01", "2026-02-03")).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03"
    ]);
  });

  it("calculates day difference", () => {
    expect(daysBetween("2026-02-01", "2026-02-05")).toBe(4);
  });

  it("detects Japanese public holidays", () => {
    expect(isJapaneseHoliday("2026-02-11")).toBe(true);
    expect(isJapaneseHoliday("2026-02-12")).toBe(false);
  });

  it("detects weekends and non-working days", () => {
    expect(isWeekend("2026-02-22")).toBe(true);
    expect(isNonWorkingDay("2026-02-22")).toBe(true);
    expect(isNonWorkingDay("2026-02-23")).toBe(true);
    expect(isNonWorkingDay("2026-02-24")).toBe(false);
  });
});
