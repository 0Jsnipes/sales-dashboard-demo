export type UserRole = "superAdmin" | "admin" | "manager" | "user";
export type BusinessUnit = "fiber" | "energy" | "all";

export interface AppUser {
  authUid: string;
  email: string;
  role: UserRole;
  businessUnit: BusinessUnit;
  mustChangePassword?: boolean;
  repUid: string | null;
  managerUid: string | null;
  teamId?: string | null;
  locationIds: string[];
  permissions: {
    canViewDashboard: boolean;
    canEditSales: boolean;
    canEditKnocks: boolean;
    canEditRoster: boolean;
    canEditOnboarding: boolean;
    canCreateUsers: boolean;
    canViewPerformance: boolean;
    canViewReporting: boolean;
    canViewSales: boolean;
    canViewKnocks: boolean;
    canViewRoster: boolean;
    canViewTeams: boolean;
    canViewOnboarding: boolean;
    canViewImports: boolean;
    canViewBackfill: boolean;
    canViewSettings: boolean;
    canRunBackfill: boolean;
    canReassignSales: boolean;
    canFilterZeroSalesOnly: boolean;
    canViewKnockHours: boolean;
    canManageTeams: boolean;
    canExportTeamReports: boolean;
    canEmailTeamReports: boolean;
    canManageTeamAutoEmails: boolean;
    canManageRosterOptions: boolean;
    canManageResources: boolean;
    canImportEmailReports: boolean;
  };
}
