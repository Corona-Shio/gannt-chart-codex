import { describe, expect, it } from "vitest";

import { dateRange, daysBetween } from "../lib/date";

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
});
