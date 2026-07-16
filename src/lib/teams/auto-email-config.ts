import { z } from "zod";
import { teamReportFileKinds, type TeamReportRange } from "@/src/lib/teams/report-types";

export const teamAutoEmailRangePresets = ["all", "previous-day", "wtd", "mtd", "ytd"] as const;
export type TeamAutoEmailRangePreset = typeof teamAutoEmailRangePresets[number];
export type TeamAutoEmailUploadType = typeof teamReportFileKinds[number];

export const teamAutoEmailRuleSchema = z.object({
  ruleId: z.string().trim().min(1).max(100),
  teamId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  triggerUploadType: z.enum(teamReportFileKinds),
  reportFiles: z.array(z.enum(teamReportFileKinds)).min(1).max(teamReportFileKinds.length),
  salesRange: z.enum(teamAutoEmailRangePresets),
  knocksRange: z.enum(teamAutoEmailRangePresets),
  frequency: z.literal("daily"),
  cc: z.array(z.string().trim().email()).max(20),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
});

export const teamAutoEmailRulesSchema = z.array(teamAutoEmailRuleSchema).max(20);
export type TeamAutoEmailRule = z.infer<typeof teamAutoEmailRuleSchema>;

export const teamAutoEmailTemplateInputSchema = teamAutoEmailRuleSchema.omit({
  ruleId: true,
  teamId: true,
  enabled: true,
});
export const teamAutoEmailTemplateSchema = teamAutoEmailTemplateInputSchema.extend({
  templateId: z.string().trim().min(1).max(100),
});
export type TeamAutoEmailTemplateInput = z.infer<typeof teamAutoEmailTemplateInputSchema>;
export type TeamAutoEmailTemplate = z.infer<typeof teamAutoEmailTemplateSchema>;

export const teamAutoEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  triggerUploadTypes: z.array(z.enum(teamReportFileKinds)).max(teamReportFileKinds.length),
  reportFiles: z.array(z.enum(teamReportFileKinds)).max(teamReportFileKinds.length),
  salesRange: z.enum(teamAutoEmailRangePresets),
  knocksRange: z.enum(teamAutoEmailRangePresets),
  frequency: z.literal("daily"),
  cc: z.array(z.string().trim().email()).max(20),
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
  cc: [],
  subject: "Orders to date",
  message: "Hello,\n\nAttached are your daily reports.",
};

const legacyDefaultMessages = new Set([
  "Hello,\n\nYour team's sales and knock reports are attached for the selected reporting periods.",
  "Hello,\n\nYour team's sales and knock data for the year to date.",
]);

export function normalizeTeamAutoEmailSettings(value: unknown): TeamAutoEmailSettings {
  if (!value || typeof value !== "object") return { ...defaultTeamAutoEmailSettings };
  const parsed = teamAutoEmailSettingsSchema.safeParse({ ...defaultTeamAutoEmailSettings, ...value });
  if (!parsed.success) return { ...defaultTeamAutoEmailSettings };
  return legacyDefaultMessages.has(parsed.data.message)
    ? { ...parsed.data, message: defaultTeamAutoEmailSettings.message }
    : parsed.data;
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

export function teamAutoEmailDeliveryId(day: string, teamId: string, ruleId: string) {
  return `${day}_${teamId}_${ruleId}`;
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
