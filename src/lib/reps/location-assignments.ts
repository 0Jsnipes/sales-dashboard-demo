import { parseDateId, startOfWeek, toDateId } from "@/src/lib/date/week";
import type { Rep } from "@/src/types/rep";

// A rep's location can vary week to week without rewriting historical reporting
// data. Each assignment pins a location either to exactly one week ("week_only")
// or to that week and every later week that has no more specific assignment
// ("forward"). The rep's own `locationId`/`locationName` fields are only ever a
// last-resort default — they must never be treated as the source of truth for a
// specific historical week.
export type LocationAssignmentScope = "week_only" | "forward";

export interface RepLocationAssignment {
  repUid: string;
  weekStart: string; // Monday, YYYY-MM-DD — the app's canonical week id (see src/lib/date/week.ts)
  scope: LocationAssignmentScope;
  locationId: string;
  locationName: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export type LocationSource = "week_override" | "forward_assignment" | "rep_default" | "unassigned";

export interface ResolvedLocation {
  locationId: string;
  locationName: string;
  source: LocationSource;
}

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_ISO_WEEK_PATTERN = /^(\d{4})-W(\d{1,2})$/;

export function assignmentDocId(repUid: string, weekStart: string, scope: LocationAssignmentScope) {
  return [repUid, weekStart, scope].join("_");
}

/** Returns true only when `value` is exactly the Monday date id of its own week. */
export function isWeekStart(value: string) {
  if (!WEEK_START_PATTERN.test(value)) return false;
  const date = parseDateId(value);
  if (Number.isNaN(date.valueOf())) return false;
  return toDateId(startOfWeek(date)) === value;
}

/**
 * Converts a legacy ISO-8601 week id (e.g. "2026-W29") to the Monday date id of
 * that same calendar week (e.g. "2026-07-13"), using the standard ISO week rule
 * (week 1 is the week containing the year's first Thursday). This lets old
 * `repLocationAssignments` documents written before the weekStart convention
 * keep resolving correctly without a forced migration.
 */
export function isoWeekToMonday(weekISO: string): string | null {
  const match = LEGACY_ISO_WEEK_PATTERN.exec(weekISO.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7; // Monday=1..Sunday=7
  const week1Monday = new Date(Date.UTC(year, 0, 4 - jan4Weekday + 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

/**
 * Normalizes a raw `repLocationAssignments` Firestore document into the
 * canonical shape, bridging the legacy `weekISO` + `mode: "single"|"forward"`
 * fields (written before this fix) onto `weekStart` + `scope`. Returns null for
 * documents missing required data rather than throwing, so a single bad doc
 * can't take down a whole page.
 */
export function normalizeAssignmentDoc(data: Record<string, unknown> | undefined | null): RepLocationAssignment | null {
  if (!data) return null;
  const repUid = String(data.repUid || "").trim();
  const locationId = String(data.locationId || "").trim();
  const locationName = String(data.locationName || "").trim();
  if (!repUid || !locationId) return null;

  const rawWeekStart = String(data.weekStart || "").trim();
  const weekStart = WEEK_START_PATTERN.test(rawWeekStart) ? rawWeekStart : isoWeekToMonday(String(data.weekISO || ""));
  if (!weekStart) return null;

  const rawScope = String(data.scope || "").trim();
  const scope: LocationAssignmentScope | null =
    rawScope === "week_only" || rawScope === "forward"
      ? rawScope
      : data.mode === "single"
        ? "week_only"
        : data.mode === "forward"
          ? "forward"
          : null;
  if (!scope) return null;

  return {
    repUid,
    weekStart,
    scope,
    locationId,
    locationName,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  };
}

export function groupAssignmentsByRep(assignments: RepLocationAssignment[]): Map<string, RepLocationAssignment[]> {
  const map = new Map<string, RepLocationAssignment[]>();
  for (const assignment of assignments) {
    const list = map.get(assignment.repUid);
    if (list) list.push(assignment);
    else map.set(assignment.repUid, [assignment]);
  }
  return map;
}

/**
 * The one shared resolution algorithm every reader (Sales, Performance,
 * Reporting, exports) must use. Resolution order for a given rep + week:
 *   1. An explicit "week_only" assignment for that exact week.
 *   2. The most recent "forward" assignment whose weekStart is on or before
 *      the requested week.
 *   3. The rep's default/current location (backward-compatible fallback only —
 *      never authoritative for a specific week).
 *   4. Unassigned.
 */
export function resolveRepLocation(
  rep: Pick<Rep, "repUid" | "locationId" | "locationName"> | null | undefined,
  weekStart: string,
  assignmentsByRep: Map<string, RepLocationAssignment[]>,
): ResolvedLocation {
  if (!rep) return { locationId: "", locationName: "", source: "unassigned" };

  const assignments = assignmentsByRep.get(rep.repUid) ?? [];
  const weekOnly = assignments.find((item) => item.scope === "week_only" && item.weekStart === weekStart);
  if (weekOnly) return { locationId: weekOnly.locationId, locationName: weekOnly.locationName, source: "week_override" };

  const forward = assignments
    .filter((item) => item.scope === "forward" && item.weekStart <= weekStart)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .pop();
  if (forward) return { locationId: forward.locationId, locationName: forward.locationName, source: "forward_assignment" };

  if (rep.locationId || rep.locationName) {
    return { locationId: rep.locationId ?? "", locationName: rep.locationName ?? "", source: "rep_default" };
  }
  return { locationId: "", locationName: "", source: "unassigned" };
}

/**
 * The nearest later "week_only" override for this rep, if any. A "forward"
 * assignment must never be allowed to silently supersede an existing
 * week-specific override — the resolver already guarantees that at read time,
 * but this lets callers (the assignment modal, the API response) warn the user
 * up front that a later week keeps its own explicit value.
 */
export function findSupersedingWeekOnlyOverride(
  assignments: RepLocationAssignment[],
  afterWeekStart: string,
): RepLocationAssignment | null {
  const later = assignments
    .filter((item) => item.scope === "week_only" && item.weekStart > afterWeekStart)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return later[0] ?? null;
}
