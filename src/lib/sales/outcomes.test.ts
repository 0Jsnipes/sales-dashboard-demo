import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCompanyBPastDueAsOfDate } from "./outcomes";

describe("resolveCompanyBPastDueAsOfDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 12, 0, 0)); // 2026-07-10
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("anchors to the day after the latest Company B order date, ignoring other providers", () => {
    const orders = [
      { provider: "companya", orderDateId: "2026-07-09" },
      { provider: "company b", orderDateId: "2026-06-20" },
      { providerKey: "companyb", orderDateId: "2026-06-25" },
    ];
    const result = resolveCompanyBPastDueAsOfDate(orders);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(26);
  });

  it("falls back to the current date when there are no Company B orders", () => {
    const result = resolveCompanyBPastDueAsOfDate([{ provider: "companya", orderDateId: "2026-07-09" }]);
    expect(result.toDateString()).toBe(new Date(2026, 6, 10).toDateString());
  });

  it("ignores malformed order dates", () => {
    const result = resolveCompanyBPastDueAsOfDate([{ provider: "companyb", orderDateId: "not-a-date" }]);
    expect(result.toDateString()).toBe(new Date(2026, 6, 10).toDateString());
  });
});
