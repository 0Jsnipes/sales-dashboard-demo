import type { AppUser } from "@/src/types/user";

export const DEMO_BRAND_NAME = "Snipes Systems";
export const DEMO_EMAIL = "Demo@snipessystems.com";
export const DEMO_PASSWORD = "Demo123!";
export const DEMO_UID = "demo-user-snipes-systems";
export const DEMO_SESSION_BEARER = "demo-session";
export const DEMO_SESSION_STORAGE_KEY = "snipes-demo-session";
export const DEMO_STORAGE_EVENT = "snipes-demo-session-change";

function allPermissionsGranted(): AppUser["permissions"] {
  return {
    canViewDashboard: true,
    canEditSales: true,
    canEditKnocks: true,
    canEditRoster: true,
    canEditOnboarding: true,
    canCreateUsers: true,
    canViewPerformance: true,
    canViewReporting: true,
    canViewSales: true,
    canViewKnocks: true,
    canViewRoster: true,
    canViewTeams: true,
    canViewOnboarding: true,
    canViewImports: true,
    canViewBackfill: true,
    canViewSettings: true,
    canRunBackfill: true,
    canReassignSales: true,
    canFilterZeroSalesOnly: true,
    canViewKnockHours: true,
    canManageTeams: true,
    canExportTeamReports: true,
    canEmailTeamReports: true,
    canManageTeamAutoEmails: true,
    canManageRosterOptions: true,
    canManageRepRoles: true,
    canManageResources: true,
    canImportEmailReports: true,
  };
}

export function buildDemoUserProfile(): AppUser {
  return {
    authUid: DEMO_UID,
    email: DEMO_EMAIL,
    role: "superAdmin",
    businessUnit: "all",
    mustChangePassword: false,
    repUid: null,
    managerUid: null,
    teamId: null,
    repAccessRole: null,
    dashboardScope: null,
    locationIds: [],
    permissions: allPermissionsGranted(),
  };
}
