import { describe, expect, it } from "vitest";
import { parseTeamExportRange, sortSalesOrdersNewestFirst, teamExportSlug } from "./export";
import type { Team } from "@/src/types/team";

describe("team export utilities", () => {
  it("accepts an inclusive ISO date range", () => {
    expect(parseTeamExportRange(new URLSearchParams({ start: "2026-01-01", end: "2026-07-14" }))).toEqual({
      start: "2026-01-01",
      end: "2026-07-14",
    });
  });

  it("rejects invalid and reversed date ranges", () => {
    expect(parseTeamExportRange(new URLSearchParams({ start: "07/01/2026", end: "2026-07-14" }))).toBeNull();
    expect(parseTeamExportRange(new URLSearchParams({ start: "2026-07-15", end: "2026-07-14" }))).toBeNull();
  });

  it("creates a download-safe team slug", () => {
    expect(teamExportSlug({ name: "  Team A / North  " } as Team)).toBe("team-a-north");
  });

  it("sorts emailed sales rows from newest to oldest", () => {
    const rows = sortSalesOrdersNewestFirst([
      { orderDateId: "2026-07-01", orderId: "oldest" },
      { orderDateId: "2026-07-15", orderId: "newest" },
      { orderDateId: "2026-07-10", orderId: "middle" },
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(["newest", "middle", "oldest"]);
  });
});
