import type { KnockSource } from "./types";

const normalize = (value: string) => value.trim().toLowerCase();

export function detectKnockSource(headers: string[]): KnockSource | null {
  const set = new Set(headers.map(normalize));
  const hasAtt = ["id", "name", "activity", "date", "salesrabbit lead id"].every((header) => set.has(header));
  if (hasAtt) return "att_salesrabbit";
  const hasTFiber = ["rep", "status", "disposition time (eastern)", "lead id", "external_id"].every((header) => set.has(header));
  if (hasTFiber) return "tfiber";
  return null;
}
