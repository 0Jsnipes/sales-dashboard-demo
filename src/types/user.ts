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
  locationIds: string[];
  permissions: {
    canEditSales: boolean;
    canEditKnocks: boolean;
    canEditRoster: boolean;
    canEditOnboarding: boolean;
    canCreateUsers: boolean;
    canViewPerformance: boolean;
    canRunBackfill: boolean;
    canReassignSales: boolean;
  };
}
