import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTFiberPastDueAsOfDate } from "./outcomes";

describe("resolveTFiberPastDueAsOfDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 12, 0, 0)); // 2026-07-10
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("anchors to the day after the latest T-Fiber order date, ignoring other providers", () => {
    const orders = [
      { provider: "att", orderDateId: "2026-07-09" },
      { provider: "t-fiber", orderDateId: "2026-06-20" },
      { providerKey: "tfiber", orderDateId: "2026-06-25" },
    ];
    const result = resolveTFiberPastDueAsOfDate(orders);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(26);
  });

  it("falls back to the current date when there are no T-Fiber orders", () => {
    const result = resolveTFiberPastDueAsOfDate([{ provider: "att", orderDateId: "2026-07-09" }]);
    expect(result.toDateString()).toBe(new Date(2026, 6, 10).toDateString());
  });

  it("ignores malformed order dates", () => {
    const result = resolveTFiberPastDueAsOfDate([{ provider: "tfiber", orderDateId: "not-a-date" }]);
    expect(result.toDateString()).toBe(new Date(2026, 6, 10).toDateString());
  });
});
