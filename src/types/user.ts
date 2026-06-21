export type UserRole = "superAdmin" | "admin" | "manager" | "user";

export interface AppUser {
  authUid: string;
  email: string;
  role: UserRole;
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
