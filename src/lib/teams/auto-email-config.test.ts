import { describe, expect, it } from "vitest";
import { defaultTeamAutoEmailSettings, easternDateId, normalizeTeamAutoEmailSettings, teamAutoEmailDeliveryId, teamAutoEmailRange, teamAutoEmailRuleSchema, teamAutoEmailTemplateInputSchema } from "./auto-email-config";

describe("team auto-email settings", () => {
  it("defaults to disabled", () => {
    expect(normalizeTeamAutoEmailSettings(null)).toEqual(defaultTeamAutoEmailSettings);
    expect(normalizeTeamAutoEmailSettings(null).enabled).toBe(false);
    expect(normalizeTeamAutoEmailSettings({ enabled: false }).cc).toEqual([]);
  });

  it("keeps configured CC recipients", () => {
    expect(normalizeTeamAutoEmailSettings({ ...defaultTeamAutoEmailSettings, cc: ["leader@example.com"] }).cc).toEqual(["leader@example.com"]);
  });

  it("migrates the previous default report message", () => {
    const settings = normalizeTeamAutoEmailSettings({
      ...defaultTeamAutoEmailSettings,
      message: "Hello,\n\nYour team's sales and knock reports are attached for the selected reporting periods.",
    });
    expect(settings.message).toBe("Hello,\n\nAttached are your daily reports.");
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

  it("validates one team-specific upload rule", () => {
    expect(teamAutoEmailRuleSchema.safeParse({
      ruleId: "sales-rule",
      teamId: "team-1",
      name: "Daily ATT sales",
      enabled: true,
      triggerUploadType: "att-sales",
      reportFiles: ["att-sales"],
      salesRange: "all",
      knocksRange: "previous-day",
      frequency: "daily",
      cc: [],
      subject: "Orders to date",
      message: "Hello,\n\nAttached are your daily reports.",
    }).success).toBe(true);
  });

  it("limits deliveries independently for each rule", () => {
    expect(teamAutoEmailDeliveryId("2026-07-16", "team-1", "sales-rule")).not.toBe(teamAutoEmailDeliveryId("2026-07-16", "team-1", "knocks-rule"));
  });

  it("stores reusable templates without team or approval state", () => {
    const parsed = teamAutoEmailTemplateInputSchema.safeParse({
      name: "Daily T-Fiber knocks",
      triggerUploadType: "tfiber-knocks",
      reportFiles: ["tfiber-knocks"],
      salesRange: "all",
      knocksRange: "previous-day",
      frequency: "daily",
      cc: [],
      subject: "Orders to date",
      message: "Hello,\n\nAttached are your daily reports.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("enabled");
  });
});
