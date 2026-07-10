import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePerformanceRange } from "./window";

// Fixed "today" = Friday, 2026-07-10, so every relative range below has a hand-verified expectation.
const FIXED_TODAY = new Date(2026, 6, 10, 12, 0, 0);

function urlWithParams(params: Record<string, string>) {
  return new URL(`https://example.com/api/performance?${new URLSearchParams(params).toString()}`);
}

describe("resolvePerformanceRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to last week (Mon-Sun) when no range is given", () => {
    const result = resolvePerformanceRange(urlWithParams({}));
    expect(result).toEqual({ start: "2026-06-29", end: "2026-07-05", mode: "lastWeek" });
  });

  it("resolves month-to-date", () => {
    const result = resolvePerformanceRange(urlWithParams({ range: "mtd" }));
    expect(result).toEqual({ start: "2026-07-01", end: "2026-07-10", mode: "mtd" });
  });

  it("resolves the trailing 30 days inclusive of today", () => {
    const result = resolvePerformanceRange(urlWithParams({ range: "last30" }));
    expect(result).toEqual({ start: "2026-06-11", end: "2026-07-10", mode: "last30" });
  });

  it("resolves week-to-date as Monday through yesterday", () => {
    const result = resolvePerformanceRange(urlWithParams({ range: "wtd" }));
    expect(result).toEqual({ start: "2026-07-06", end: "2026-07-09", mode: "wtd" });
  });

  it("clamps week-to-date's end to Monday when today is Monday (yesterday precedes the week start)", () => {
    vi.setSystemTime(new Date(2026, 6, 13, 12, 0, 0)); // Monday, 2026-07-13
    const result = resolvePerformanceRange(urlWithParams({ range: "wtd" }));
    expect(result).toEqual({ start: "2026-07-13", end: "2026-07-13", mode: "wtd" });
  });

  it("passes through an explicit custom range", () => {
    const result = resolvePerformanceRange(urlWithParams({ range: "custom", from: "2026-05-01", to: "2026-05-15" }));
    expect(result).toEqual({ start: "2026-05-01", end: "2026-05-15", mode: "custom" });
  });

  it("rejects a custom range missing from/to", () => {
    expect(() => resolvePerformanceRange(urlWithParams({ range: "custom" }))).toThrow("VALID_DATE_RANGE_REQUIRED");
  });
});
