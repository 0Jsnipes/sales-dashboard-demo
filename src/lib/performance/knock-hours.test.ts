import { describe, expect, it } from "vitest";
import { aggregateKnockHours, resolveKnockHoursRange } from "./knock-hours";

describe("knock hours", () => {
  it("resolves daily, week-to-date, month-to-date, and custom ranges", () => {
    expect(resolveKnockHoursRange("daily", "2026-07-08")).toEqual({ start: "2026-07-08", end: "2026-07-08" });
    expect(resolveKnockHoursRange("weekly", "2026-07-08")).toEqual({ start: "2026-07-06", end: "2026-07-08" });
    expect(resolveKnockHoursRange("monthly", "2026-07-08")).toEqual({ start: "2026-07-01", end: "2026-07-08" });
    expect(resolveKnockHoursRange("custom", "2026-07-12", "2026-07-12")).toEqual({ start: "2026-07-12", end: "2026-07-12" });
    expect(resolveKnockHoursRange("custom", "2026-07-08", "2026-07-12")).toEqual({ start: "2026-07-08", end: "2026-07-12" });
    expect(resolveKnockHoursRange("custom", "2026-07-12", "2026-07-08")).toBeNull();
  });

  it("sums daily first-to-last spans instead of counting overnight time", () => {
    const rows = aggregateKnockHours([
      { repUid: "rep-1", dateId: "2026-07-07", occurredAt: new Date("2026-07-07T13:00:00Z") },
      { repUid: "rep-1", dateId: "2026-07-07", occurredAt: new Date("2026-07-07T21:00:00Z") },
      { repUid: "rep-1", dateId: "2026-07-08", occurredAt: new Date("2026-07-08T14:00:00Z") },
      { repUid: "rep-1", dateId: "2026-07-08", occurredAt: new Date("2026-07-08T20:30:00Z") },
    ]);
    expect(rows[0]).toMatchObject({ repUid: "rep-1", knocks: 4, hoursWorked: 14.5, daysWorked: 2 });
  });
});
