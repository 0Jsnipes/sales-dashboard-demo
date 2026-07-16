import { describe, expect, it } from "vitest";
import { resolveDashboardAccessScope } from "./scope";
import type { AppUser } from "@/src/types/user";
import { DEFAULT_ADMIN_PERMISSIONS } from "@/src/lib/access";

const profile = (input: Partial<AppUser>): AppUser => ({ authUid: "u1", email: "test@example.com", role: "user", businessUnit: "fiber", repUid: "manager-1", managerUid: null, teamId: "team-a", locationIds: [], permissions: DEFAULT_ADMIN_PERMISSIONS, ...input });
const reps = [
  { repUid: "manager-1", displayName: "Eric Stoker", teamId: "team-a" },
  { repUid: "rep-1", displayName: "Rep One", managerName: "Eric Stoker", teamId: "team-a" },
  { repUid: "rep-2", displayName: "Rep Two", teamId: "team-b" },
];
const teams = [
  { teamId: "team-a", managerRepUid: "manager-1", members: ["rep-1"], active: true },
  { teamId: "team-b", managerRepUid: "someone-else", members: ["rep-2"], active: true },
];

describe("dashboard access scope", () => {
  it("limits managers to themselves and their managed team", () => {
    const scope = resolveDashboardAccessScope(profile({ role: "manager", dashboardScope: "managedTeam" }), reps, teams);
    expect([...scope.allowedRepUids!].sort()).toEqual(["manager-1", "rep-1"]);
    expect(scope.canFilterReps).toBe(true);
  });

  it("limits traveling managers to their current team", () => {
    const scope = resolveDashboardAccessScope(profile({ role: "manager", dashboardScope: "currentTeam" }), reps, teams);
    expect([...scope.allowedRepUids!].sort()).toEqual(["manager-1", "rep-1"]);
  });

  it("limits reps to themselves", () => {
    const scope = resolveDashboardAccessScope(profile({ role: "user", repUid: "rep-1", dashboardScope: "self" }), reps, teams);
    expect([...scope.allowedRepUids!]).toEqual(["rep-1"]);
    expect(scope.canFilterReps).toBe(false);
  });

  it("leaves admins unrestricted", () => {
    expect(resolveDashboardAccessScope(profile({ role: "admin" }), reps, teams).allowedRepUids).toBeNull();
  });
});
