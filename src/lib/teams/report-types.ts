export const teamReportFileKinds = ["companya-sales", "companyb-sales", "companya-knocks", "companyb-knocks"] as const;
export type TeamReportFileKind = typeof teamReportFileKinds[number];
export type TeamReportRange = { start: string; end: string };
