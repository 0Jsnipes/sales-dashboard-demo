import type { NormalizedKnockStatus } from "./types";

const map = new Map<string, NormalizedKnockStatus>([
  ["try 1", "attempt"],
  ["try 2", "attempt"],
  ["try 3", "attempt"],
  ["not home - 1", "attempt"],
  ["not home - 2", "attempt"],
  ["not home - 3", "attempt"],
  ["sold", "sale"],
  ["new sale", "sale"],
  ["soft go back", "go_back"],
  ["strong go back", "go_back"],
  ["priority go back", "go_back"],
  ["goback1", "go_back"],
  ["go back1", "go_back"],
  ["go back 1", "go_back"],
  ["not interested", "not_interested"],
  ["negative feedback", "not_interested"],
  ["existing fiber customer", "existing_customer"],
  ["existing customer", "existing_customer"],
  ["fiber competitor", "competitor"],
  ["competitor", "competitor"],
  ["pricing", "competitor"],
  ["no soliciting", "no_soliciting"],
  ["home for sale", "home_for_sale"],
  ["house for sale", "home_for_sale"],
  ["vacant lot", "vacant"],
  ["abandoned home", "vacant"],
  ["new fiber lead", "lead_created"],
  ["priority fiber lead", "lead_created"],
  ["fastwyre lead", "lead_created"],
]);

export function normalizeKnockStatus(rawStatus: string): NormalizedKnockStatus {
  const text = String(rawStatus ?? "").trim();
  if (!text) return "unknown";
  const key = text.toLowerCase().replace(/\s+/g, " ").replace(/[._-]+/g, " ").trim();
  return map.get(key) ?? "other";
}
