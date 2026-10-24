import type { KnockSource } from "./types";

const normalize = (value: string) => value.trim().toLowerCase();

export function detectKnockSource(headers: string[]): KnockSource | null {
  const set = new Set(headers.map(normalize));
  const hasCompanyA = ["id", "name", "activity", "date", "salesrabbit lead id"].every((header) => set.has(header));
  if (hasCompanyA) return "companya_salesrabbit";
  const hasCompanyB = ["rep", "status", "disposition time (eastern)", "lead id", "external_id"].every((header) => set.has(header));
  if (hasCompanyB) return "companyb";
  return null;
}
