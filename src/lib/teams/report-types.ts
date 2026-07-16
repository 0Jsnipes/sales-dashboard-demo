export const teamReportFileKinds = ["att-sales", "tfiber-sales", "att-knocks", "tfiber-knocks"] as const;
export type TeamReportFileKind = typeof teamReportFileKinds[number];
export type TeamReportRange = { start: string; end: string };
