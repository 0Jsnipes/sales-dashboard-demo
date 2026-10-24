import type { Rep } from "@/src/types/rep";

const suffixes = /\b(sr|jr|ii|iii|iv)\b/g;
export function normalizeName(value = "") {
  return value
    .toLowerCase()
    .replace(/\s*-\s*company\s*b\s*$/g, "")
    .replace(/\bcompany\s*b\b/g, "")
    .replace(suffixes, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function normalizeEmail(value = "") { return value.trim().toLowerCase(); }
export function normalizeSalesId(value = "") { return value.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
export function buildRepSearchIndex(rep: Rep) {
  return { names: [rep.displayName, ...rep.aliases].map(normalizeName), emails: [rep.email].map(normalizeEmail), salesIds: rep.salesIds.map(normalizeSalesId) };
}
