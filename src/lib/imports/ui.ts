import { normalizeName } from "@/src/lib/matching/normalize";

export function normalizeImportedName(value = "") {
  return normalizeName(value.replace(/\s*[-–—]\s*ab marketing\b/gi, ""));
}

export function normalizeAlias(value = "") {
  return normalizeImportedName(value);
}

export function getMatchConfidenceBadge(confidence?: number | null) {
  if (confidence == null || Number.isNaN(confidence)) {
    return { label: "Needs review", variant: "outline" as const };
  }
  if (confidence >= 0.95) return { label: `${Math.round(confidence * 100)}%`, variant: "success" as const };
  if (confidence >= 0.7) return { label: `${Math.round(confidence * 100)}%`, variant: "warning" as const };
  return { label: `${Math.round(confidence * 100)}%`, variant: "danger" as const };
}

export function groupUnmatchedBySource<T extends { provider?: string }>(rows: T[]) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = row.provider?.trim() || "unknown";
    (acc[key] ||= []).push(row);
    return acc;
  }, {});
}
