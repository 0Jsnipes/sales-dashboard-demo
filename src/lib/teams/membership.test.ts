import { describe, expect, it } from "vitest";
import { buildRepToTeamIndex, repUidSetForTeam, teamMatches, type TeamRecord } from "./membership";

const teams: TeamRecord[] = [
  { teamId: "alpha", name: "Alpha", repUids: ["rep-1", "rep-2"] },
  { teamId: "beta", name: "Beta", repUids: ["rep-2", "rep-3"] },
  { teamId: "empty", name: "Empty", repUids: [] },
];

describe("repUidSetForTeam", () => {
  it("returns the member set for a known team", () => {
    expect(repUidSetForTeam(teams, "alpha")).toEqual(new Set(["rep-1", "rep-2"]));
  });

  it("returns an empty set for an unknown teamId", () => {
    expect(repUidSetForTeam(teams, "does-not-exist")).toEqual(new Set());
  });

  it("returns an empty set when repUids is empty", () => {
    expect(repUidSetForTeam(teams, "empty")).toEqual(new Set());
  });
});

describe("buildRepToTeamIndex", () => {
  it("indexes a rep under every team they belong to", () => {
    const index = buildRepToTeamIndex(teams);
    expect(index.get("rep-2")).toEqual(new Set(["alpha", "beta"]));
  });

  it("does not include reps that belong to zero teams", () => {
    const index = buildRepToTeamIndex(teams);
    expect(index.has("rep-999")).toBe(false);
  });

  it("dedupes a repUid listed twice within the same team", () => {
    const index = buildRepToTeamIndex([{ teamId: "gamma", name: "Gamma", repUids: ["rep-1", "rep-1"] }]);
    expect(index.get("rep-1")).toEqual(new Set(["gamma"]));
  });
});

describe("teamMatches", () => {
  const index = buildRepToTeamIndex(teams);

  it("matches everything when the filter is 'all'", () => {
    expect(teamMatches(null, "all", index)).toBe(true);
    expect(teamMatches("rep-1", "all", index)).toBe(true);
  });

  it("never matches a null/undefined repUid when a specific team is selected", () => {
    expect(teamMatches(null, "alpha", index)).toBe(false);
    expect(teamMatches(undefined, "alpha", index)).toBe(false);
  });

  it("matches only when the rep is indexed under the selected team", () => {
    expect(teamMatches("rep-1", "alpha", index)).toBe(true);
    expect(teamMatches("rep-1", "beta", index)).toBe(false);
    expect(teamMatches("rep-3", "beta", index)).toBe(true);
  });
});
