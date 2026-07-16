import { describe, expect, it } from "vitest";
import { rosterViewProfile, rosterViewRepUid } from "./roster-view-profile";
import type { Rep } from "@/src/types/rep";

function rep(input: Partial<Rep> = {}) {
  return { repUid: "rep-1", displayName: "Jordan Rep", email: "", managerUid: null, managerName: "", teamId: "team-1", locationId: "loc-1", locationName: "Test", salesIds: [], aliases: [], programIds: [], vendorType: "organic", weeklySalesGoal: 0, weeklyKnocksGoal: 0, status: "active", authUid: null, accountStatus: "none", onboarding: { onboarded: false, checks: {} }, firstName: "Jordan", lastName: "Rep", emailNormalized: "", ...input } as Rep;
}

describe("roster view profiles", () => {
  it("creates a dashboard-only virtual rep login", () => {
    const profile = rosterViewProfile(rep());
    expect(profile.authUid).toBe("roster:rep-1");
    expect(profile.dashboardScope).toBe("self");
    expect(profile.permissions.canViewDashboard).toBe(true);
    expect(profile.permissions.canViewSales).toBe(false);
  });

  it("uses current-team scope for traveling managers", () => {
    const profile = rosterViewProfile(rep({ accessRole: "travelingSalesManager" }));
    expect(profile.role).toBe("manager");
    expect(profile.dashboardScope).toBe("currentTeam");
    expect(rosterViewRepUid(profile.authUid)).toBe("rep-1");
  });
});
