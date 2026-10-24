import type { Rep } from "@/src/types/rep";
import { normalizeEmail, normalizeName, normalizeSalesId } from "@/src/lib/matching/normalize";
import type { KnockMatchConfidence, KnockMatchMethod, NormalizedKnockRow } from "./types";

export function normalizeRepName(value: string) {
  return normalizeName(String(value ?? ""));
}

function repSourceIds(rep: Rep) {
  const sourceIds = (rep as Rep & { sourceIds?: { companyBExternalId?: string[] | string }; companyBExternalId?: string[] | string; external_id?: string[] | string; externalId?: string[] | string }).sourceIds;
  return [
    ...(Array.isArray(sourceIds?.companyBExternalId) ? sourceIds.companyBExternalId : sourceIds?.companyBExternalId ? [sourceIds.companyBExternalId] : []),
    ...((rep as { companyBExternalId?: string[] | string }).companyBExternalId ? Array.isArray((rep as { companyBExternalId?: string[] | string }).companyBExternalId) ? (rep as { companyBExternalId?: string[] | string }).companyBExternalId as string[] : [(rep as { companyBExternalId?: string }).companyBExternalId as string] : []),
    ...((rep as { external_id?: string[] | string }).external_id ? Array.isArray((rep as { external_id?: string[] | string }).external_id) ? (rep as { external_id?: string[] | string }).external_id as string[] : [(rep as { external_id?: string }).external_id as string] : []),
    ...((rep as { externalId?: string[] | string }).externalId ? Array.isArray((rep as { externalId?: string[] | string }).externalId) ? (rep as { externalId?: string[] | string }).externalId as string[] : [(rep as { externalId?: string }).externalId as string] : []),
  ].map((value) => normalizeSalesId(value));
}

export function matchKnockToRep(row: NormalizedKnockRow, reps: Rep[]): { repId: string | null; method: KnockMatchMethod; confidence: KnockMatchConfidence } {
  const email = normalizeEmail(row.repEmail ?? "");
  const name = normalizeRepName(row.repName ?? "");
  const sourceId = normalizeSalesId(row.sourceRepExternalId ?? "");
  if (email) {
    const match = reps.find((rep) => normalizeEmail(rep.email) === email);
    if (match) return { repId: match.repUid, method: "email", confidence: "high" };
  }
  if (sourceId) {
    const match = reps.find((rep) => repSourceIds(rep).includes(sourceId));
    if (match) return { repId: match.repUid, method: "source_id", confidence: "high" };
  }
  if (name) {
    const exact = reps.find((rep) => normalizeRepName(rep.displayName) === name);
    if (exact) return { repId: exact.repUid, method: "exact_name", confidence: "medium" };
    const alias = reps.find((rep) => rep.aliases.some((value) => normalizeRepName(value) === name) || rep.salesIds.some((value) => normalizeRepName(value) === name));
    if (alias) return { repId: alias.repUid, method: "alias", confidence: "low" };
  }
  return { repId: null, method: null, confidence: null };
}
