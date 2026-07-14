import { describe, expect, it } from "vitest";
import { isoWeek } from "@/src/lib/date/week";
import {
  assignmentDocId,
  findSupersedingWeekOnlyOverride,
  groupAssignmentsByRep,
  isWeekStart,
  isoWeekToMonday,
  normalizeAssignmentDoc,
  resolveRepLocation,
  type RepLocationAssignment,
} from "./location-assignments";

const rep = { repUid: "rep-1", locationId: "loc-default", locationName: "Default City" };

function assignment(overrides: Partial<RepLocationAssignment>): RepLocationAssignment {
  return {
    repUid: "rep-1",
    weekStart: "2026-07-13",
    scope: "forward",
    locationId: "loc-a",
    locationName: "Location A",
    ...overrides,
  };
}

describe("isWeekStart", () => {
  it("accepts a real Monday date id", () => {
    expect(isWeekStart("2026-07-13")).toBe(true); // Monday
  });

  it("rejects a non-Monday date id", () => {
    expect(isWeekStart("2026-07-14")).toBe(false); // Tuesday
  });

  it("rejects malformed input", () => {
    expect(isWeekStart("2026-W29")).toBe(false);
    expect(isWeekStart("not-a-date")).toBe(false);
    expect(isWeekStart("")).toBe(false);
  });
});

describe("isoWeekToMonday", () => {
  it("round-trips against the app's own isoWeek() for a range of Mondays", () => {
    // isoWeek() (src/lib/date/week.ts) converts a Monday -> "YYYY-Www"; this
    // inverts that, so feeding its own output back through must return the
    // original Monday for every week in the sample range, including a
    // year boundary.
    const mondays = ["2026-01-05", "2026-03-30", "2026-07-13", "2026-12-28", "2025-12-29"];
    for (const monday of mondays) {
      const weekISO = isoWeek(new Date(`${monday}T12:00:00`));
      expect(isoWeekToMonday(weekISO)).toBe(monday);
    }
  });

  it("returns null for malformed input", () => {
    expect(isoWeekToMonday("garbage")).toBeNull();
    expect(isoWeekToMonday("2026-W99")).toBeNull();
  });
});

describe("normalizeAssignmentDoc", () => {
  it("passes through a canonical new-format document", () => {
    const result = normalizeAssignmentDoc({
      repUid: "rep-1",
      weekStart: "2026-07-13",
      scope: "week_only",
      locationId: "loc-a",
      locationName: "Location A",
    });
    expect(result).toMatchObject({ repUid: "rep-1", weekStart: "2026-07-13", scope: "week_only", locationId: "loc-a", locationName: "Location A" });
  });

  it("bridges a legacy weekISO/mode document onto weekStart/scope", () => {
    const result = normalizeAssignmentDoc({
      repUid: "rep-1",
      weekISO: "2026-W29",
      mode: "single",
      locationId: "loc-a",
      locationName: "Location A",
    });
    expect(result).toMatchObject({ weekStart: "2026-07-13", scope: "week_only" });
  });

  it("maps legacy forward mode to the forward scope", () => {
    const result = normalizeAssignmentDoc({ repUid: "rep-1", weekISO: "2026-W29", mode: "forward", locationId: "loc-a", locationName: "Location A" });
    expect(result?.scope).toBe("forward");
  });

  it("returns null when repUid or locationId is missing", () => {
    expect(normalizeAssignmentDoc({ weekStart: "2026-07-13", scope: "forward", locationId: "loc-a" })).toBeNull();
    expect(normalizeAssignmentDoc({ repUid: "rep-1", weekStart: "2026-07-13", scope: "forward" })).toBeNull();
  });

  it("returns null when neither weekStart nor a parseable weekISO is present", () => {
    expect(normalizeAssignmentDoc({ repUid: "rep-1", scope: "forward", locationId: "loc-a", locationName: "A" })).toBeNull();
  });

  it("returns null for an unrecognized scope/mode", () => {
    expect(normalizeAssignmentDoc({ repUid: "rep-1", weekStart: "2026-07-13", scope: "whenever", locationId: "loc-a", locationName: "A" })).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(normalizeAssignmentDoc(null)).toBeNull();
    expect(normalizeAssignmentDoc(undefined)).toBeNull();
  });
});

describe("resolveRepLocation", () => {
  it("falls back to the rep's default location when there are no assignments", () => {
    const result = resolveRepLocation(rep, "2026-07-13", new Map());
    expect(result).toEqual({ locationId: "loc-default", locationName: "Default City", source: "rep_default" });
  });

  it("returns unassigned for an unknown rep", () => {
    expect(resolveRepLocation(null, "2026-07-13", new Map())).toEqual({ locationId: "", locationName: "", source: "unassigned" });
  });

  it("returns unassigned when the rep has no default location and no assignments", () => {
    const bareRep = { repUid: "rep-2", locationId: "", locationName: "" };
    expect(resolveRepLocation(bareRep, "2026-07-13", new Map())).toEqual({ locationId: "", locationName: "", source: "unassigned" });
  });

  it("prefers an exact week_only override over a forward assignment", () => {
    const assignments = groupAssignmentsByRep([
      assignment({ scope: "forward", weekStart: "2026-06-01", locationId: "loc-forward", locationName: "Forward City" }),
      assignment({ scope: "week_only", weekStart: "2026-07-13", locationId: "loc-week", locationName: "Week City" }),
    ]);
    expect(resolveRepLocation(rep, "2026-07-13", assignments)).toEqual({ locationId: "loc-week", locationName: "Week City", source: "week_override" });
  });

  it("applies a forward assignment to every later week with no override", () => {
    const assignments = groupAssignmentsByRep([
      assignment({ scope: "forward", weekStart: "2026-07-13", locationId: "loc-forward", locationName: "Forward City" }),
    ]);
    expect(resolveRepLocation(rep, "2026-07-13", assignments).locationName).toBe("Forward City");
    expect(resolveRepLocation(rep, "2026-08-10", assignments).locationName).toBe("Forward City");
  });

  it("does not apply a forward assignment to weeks before its own weekStart", () => {
    const assignments = groupAssignmentsByRep([
      assignment({ scope: "forward", weekStart: "2026-07-13", locationId: "loc-forward", locationName: "Forward City" }),
    ]);
    const result = resolveRepLocation(rep, "2026-07-06", assignments);
    expect(result).toEqual({ locationId: "loc-default", locationName: "Default City", source: "rep_default" });
  });

  it("picks the most recent applicable forward assignment when several exist", () => {
    const assignments = groupAssignmentsByRep([
      assignment({ scope: "forward", weekStart: "2026-06-01", locationId: "loc-old", locationName: "Old City" }),
      assignment({ scope: "forward", weekStart: "2026-07-13", locationId: "loc-new", locationName: "New City" }),
    ]);
    expect(resolveRepLocation(rep, "2026-08-03", assignments).locationName).toBe("New City");
  });

  it("acceptance scenario: a later week_only override interrupts, then the forward assignment resumes", () => {
    // Forward -> St. Petersburg starting 2026-07-20; a one-week Tampa
    // override on 2026-08-03; the week after the override must resolve back
    // to the forward assignment, not the override and not the rep default.
    const assignments = groupAssignmentsByRep([
      assignment({ scope: "forward", weekStart: "2026-07-20", locationId: "loc-stpete", locationName: "St. Petersburg" }),
      assignment({ scope: "week_only", weekStart: "2026-08-03", locationId: "loc-tampa", locationName: "Tampa" }),
    ]);
    expect(resolveRepLocation(rep, "2026-07-13", assignments).locationName).toBe("Default City"); // untouched, before forward start
    expect(resolveRepLocation(rep, "2026-07-20", assignments).locationName).toBe("St. Petersburg");
    expect(resolveRepLocation(rep, "2026-07-27", assignments).locationName).toBe("St. Petersburg");
    expect(resolveRepLocation(rep, "2026-08-03", assignments).locationName).toBe("Tampa"); // one-week override
    expect(resolveRepLocation(rep, "2026-08-10", assignments).locationName).toBe("St. Petersburg"); // resumes forward
  });

  it("legacy weekISO/mode documents resolve identically to canonical ones once normalized", () => {
    const legacy = normalizeAssignmentDoc({ repUid: "rep-1", weekISO: "2026-W29", mode: "forward", locationId: "loc-a", locationName: "Location A" });
    expect(legacy).not.toBeNull();
    const assignments = groupAssignmentsByRep([legacy as RepLocationAssignment]);
    expect(resolveRepLocation(rep, "2026-07-13", assignments).locationName).toBe("Location A");
  });
});

describe("findSupersedingWeekOnlyOverride", () => {
  it("finds the nearest later week_only override", () => {
    const assignments = [
      assignment({ scope: "week_only", weekStart: "2026-08-03", locationId: "loc-tampa", locationName: "Tampa" }),
      assignment({ scope: "week_only", weekStart: "2026-09-01", locationId: "loc-later", locationName: "Later City" }),
    ];
    expect(findSupersedingWeekOnlyOverride(assignments, "2026-07-20")?.locationName).toBe("Tampa");
  });

  it("ignores week_only overrides on or before the reference week", () => {
    const assignments = [assignment({ scope: "week_only", weekStart: "2026-07-13", locationId: "loc-a", locationName: "A" })];
    expect(findSupersedingWeekOnlyOverride(assignments, "2026-07-13")).toBeNull();
  });

  it("ignores forward assignments entirely", () => {
    const assignments = [assignment({ scope: "forward", weekStart: "2026-08-03", locationId: "loc-a", locationName: "A" })];
    expect(findSupersedingWeekOnlyOverride(assignments, "2026-07-20")).toBeNull();
  });

  it("returns null when there is nothing later", () => {
    expect(findSupersedingWeekOnlyOverride([], "2026-07-20")).toBeNull();
  });
});

describe("assignmentDocId", () => {
  it("is deterministic for the same inputs (write idempotency/retry-safety)", () => {
    expect(assignmentDocId("rep-1", "2026-07-13", "forward")).toBe(assignmentDocId("rep-1", "2026-07-13", "forward"));
  });

  it("differs by scope so week_only and forward can coexist for the same week", () => {
    expect(assignmentDocId("rep-1", "2026-07-13", "week_only")).not.toBe(assignmentDocId("rep-1", "2026-07-13", "forward"));
  });
});
