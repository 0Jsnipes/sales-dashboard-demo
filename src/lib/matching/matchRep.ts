import type { Rep } from "@/src/types/rep";
import { buildRepSearchIndex, normalizeEmail, normalizeName, normalizeSalesId } from "./normalize";

export type MatchResult = { repUid: string | null; confidence: number; method: "salesId" | "email" | "alias" | "normalizedName" | "fuzzy" | null; reason: string };
export function matchImportRowToRep(row: { rawSalesId?: string; email?: string; rawRepName?: string }, reps: Rep[]): MatchResult {
  const salesId = normalizeSalesId(row.rawSalesId); const email = normalizeEmail(row.email); const name = normalizeName(row.rawRepName);
  for (const rep of reps) { const index = buildRepSearchIndex(rep); if (salesId && index.salesIds.includes(salesId)) return { repUid: rep.repUid, confidence: 1, method: "salesId", reason: "Exact sales ID" }; }
  for (const rep of reps) { const index = buildRepSearchIndex(rep); if (email && index.emails.includes(email)) return { repUid: rep.repUid, confidence: 1, method: "email", reason: "Exact email" }; }
  for (const rep of reps) { const index = buildRepSearchIndex(rep); if (name && index.names.includes(name)) return { repUid: rep.repUid, confidence: 0.98, method: rep.aliases.map(normalizeName).includes(name) ? "alias" : "normalizedName", reason: "Exact normalized name" }; }
  return { repUid: null, confidence: 0, method: null, reason: "No high-confidence roster match" };
}
