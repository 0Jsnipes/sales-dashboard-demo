import { describe, expect, it } from "vitest";
import { parseTeamExportRange, teamExportSlug } from "./export";
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
});
