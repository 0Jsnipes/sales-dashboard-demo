import { describe, expect, it } from "vitest";
import { normalizePermissions } from "./access";

describe("team page permission", () => {
  it("keeps Teams visible for existing profiles that predate the permission", () => {
    expect(normalizePermissions({ canViewRoster: false }).canViewTeams).toBe(true);
  });

  it("honors an explicitly disabled Teams permission", () => {
    expect(normalizePermissions({ canViewTeams: false }).canViewTeams).toBe(false);
  });

  it("keeps the formerly email-restricted knock-hours chart opt-in", () => {
    expect(normalizePermissions({}).canViewKnockHours).toBe(false);
    expect(normalizePermissions({ canViewKnockHours: true }).canViewKnockHours).toBe(true);
  });

  it("honors granular feature visibility permissions", () => {
    const permissions = normalizePermissions({
      canManageTeams: false,
      canExportTeamReports: false,
      canEmailTeamReports: false,
      canManageTeamAutoEmails: false,
      canManageRosterOptions: false,
      canManageResources: false,
      canImportEmailReports: false,
    });
    expect(permissions.canManageTeams).toBe(false);
    expect(permissions.canExportTeamReports).toBe(false);
    expect(permissions.canEmailTeamReports).toBe(false);
    expect(permissions.canManageTeamAutoEmails).toBe(false);
    expect(permissions.canManageRosterOptions).toBe(false);
    expect(permissions.canManageResources).toBe(false);
    expect(permissions.canImportEmailReports).toBe(false);
  });
});
