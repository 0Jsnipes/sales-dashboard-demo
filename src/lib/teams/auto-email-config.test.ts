import { describe, expect, it } from "vitest";
import { defaultTeamAutoEmailSettings, easternDateId, normalizeTeamAutoEmailSettings, teamAutoEmailRange } from "./auto-email-config";

describe("team auto-email settings", () => {
  it("defaults to disabled", () => {
    expect(normalizeTeamAutoEmailSettings(null)).toEqual(defaultTeamAutoEmailSettings);
    expect(normalizeTeamAutoEmailSettings(null).enabled).toBe(false);
  });

  it("uses Eastern dates for daily limits and report presets", () => {
    const instant = new Date("2026-07-15T03:30:00Z");
    expect(easternDateId(instant)).toBe("2026-07-14");
    expect(teamAutoEmailRange("previous-day", instant)).toEqual({ start: "2026-07-13", end: "2026-07-13" });
    expect(teamAutoEmailRange("mtd", instant)).toEqual({ start: "2026-07-01", end: "2026-07-14" });
  });

  it("builds a Monday-through-today weekly range", () => {
    expect(teamAutoEmailRange("wtd", new Date("2026-07-15T16:00:00Z"))).toEqual({ start: "2026-07-13", end: "2026-07-15" });
  });
});
