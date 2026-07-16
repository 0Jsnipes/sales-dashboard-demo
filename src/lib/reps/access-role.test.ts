import { describe, expect, it } from "vitest";
import { normalizeRepAccessRole, repRolePermissions } from "./access-role";

describe("roster access roles", () => {
  it("defaults legacy representatives to the rep role", () => {
    expect(normalizeRepAccessRole(undefined)).toBe("rep");
    expect(repRolePermissions(undefined)).toEqual({ dashboardOnly: true, dashboardScope: "self", canFilterRepresentatives: false });
  });

  it("maps manager roles to the requested dashboard scopes", () => {
    expect(repRolePermissions("manager").dashboardScope).toBe("managedTeam");
    expect(repRolePermissions("travelingSalesManager").dashboardScope).toBe("currentTeam");
    expect(repRolePermissions("regionalManager").dashboardScope).toBe("currentTeam");
  });
});
