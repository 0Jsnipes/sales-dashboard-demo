import { z } from "zod";
import { teamReportFileKinds, type TeamReportRange } from "@/src/lib/teams/report-types";

export const teamAutoEmailRangePresets = ["all", "previous-day", "wtd", "mtd", "ytd"] as const;
export type TeamAutoEmailRangePreset = typeof teamAutoEmailRangePresets[number];
export type TeamAutoEmailUploadType = typeof teamReportFileKinds[number];

export const teamAutoEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  triggerUploadTypes: z.array(z.enum(teamReportFileKinds)).max(teamReportFileKinds.length),
  reportFiles: z.array(z.enum(teamReportFileKinds)).max(teamReportFileKinds.length),
  salesRange: z.enum(teamAutoEmailRangePresets),
  knocksRange: z.enum(teamAutoEmailRangePresets),
  frequency: z.literal("daily"),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.triggerUploadTypes.length) context.addIssue({ code: "custom", path: ["triggerUploadTypes"], message: "Select at least one upload trigger." });
  if (!value.reportFiles.length) context.addIssue({ code: "custom", path: ["reportFiles"], message: "Select at least one report attachment." });
});

export type TeamAutoEmailSettings = z.infer<typeof teamAutoEmailSettingsSchema>;

export const defaultTeamAutoEmailSettings: TeamAutoEmailSettings = {
  enabled: false,
  triggerUploadTypes: ["att-sales", "tfiber-sales"],
  reportFiles: ["att-sales", "tfiber-sales"],
  salesRange: "all",
  knocksRange: "previous-day",
  frequency: "daily",
  subject: "Orders to date",
  message: "Hello,\n\nYour team's sales and knock reports are attached for the selected reporting periods.",
};

export function normalizeTeamAutoEmailSettings(value: unknown): TeamAutoEmailSettings {
  if (!value || typeof value !== "object") return { ...defaultTeamAutoEmailSettings };
  const parsed = teamAutoEmailSettingsSchema.safeParse({ ...defaultTeamAutoEmailSettings, ...value });
  return parsed.success ? parsed.data : { ...defaultTeamAutoEmailSettings };
}

function easternDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), 12));
}

function dateId(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function easternDateId(now = new Date()) {
  return dateId(easternDate(now));
}

export function teamAutoEmailRange(preset: TeamAutoEmailRangePreset, now = new Date()): TeamReportRange {
  if (preset === "all") return { start: "0001-01-01", end: "9999-12-31" };
  const today = easternDate(now);
  if (preset === "previous-day") {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const day = dateId(yesterday);
    return { start: day, end: day };
  }
  if (preset === "ytd") return { start: `${today.getUTCFullYear()}-01-01`, end: dateId(today) };
  if (preset === "mtd") return { start: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`, end: dateId(today) };
  const monday = new Date(today);
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return { start: dateId(monday), end: dateId(today) };
}
