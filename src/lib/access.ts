import type { AppUser, BusinessUnit } from "@/src/types/user";

export type PermissionKey = keyof AppUser["permissions"];

export type AccessRule = {
  businessUnit?: BusinessUnit;
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  superAdminOnly?: boolean;
};

export const DEFAULT_ADMIN_PERMISSIONS: AppUser["permissions"] = {
  canViewDashboard: true,
  canViewPerformance: true,
  canViewReporting: false,
  canViewSales: true,
  canViewKnocks: true,
  canViewRoster: true,
  canViewTeams: true,
  canViewOnboarding: true,
  canViewImports: true,
  canViewBackfill: true,
  canViewSettings: false,
  canEditSales: true,
  canEditKnocks: true,
  canEditRoster: true,
  canEditOnboarding: true,
  canCreateUsers: false,
  canRunBackfill: true,
  canReassignSales: true,
  canFilterZeroSalesOnly: false,
  canViewKnockHours: false,
  canManageTeams: false,
  canExportTeamReports: false,
  canEmailTeamReports: false,
  canManageTeamAutoEmails: false,
  canManageRosterOptions: false,
  canManageRepRoles: false,
  canManageResources: false,
  canImportEmailReports: false,
};

export function normalizeBusinessUnit(value: unknown): BusinessUnit {
  if (value === "energy") return "energy";
  if (value === "all") return "all";
  return "fiber";
}

export function businessUnitLabel(value: unknown) {
  const unit = normalizeBusinessUnit(value);
  if (unit === "energy") return "Energy";
  if (unit === "all") return "All";
  return "Fiber";
}

export function normalizePermissions(value: unknown): AppUser["permissions"] {
  const source = value && typeof value === "object" ? value as Partial<Record<PermissionKey, unknown>> : {};
  const permissions = { ...DEFAULT_ADMIN_PERMISSIONS };
  for (const key of Object.keys(permissions) as PermissionKey[]) {
    if (typeof source[key] === "boolean") permissions[key] = source[key];
  }
  return permissions;
}

export function canAccessRule(profile: AppUser | null | undefined, rule: AccessRule) {
  if (!profile) return false;
  if (profile.role === "superAdmin" && !profile.demoSeedId) return true;
  if (rule.superAdminOnly) return false;

  const userUnit = normalizeBusinessUnit(profile.businessUnit);
  const requiredUnit = rule.businessUnit ? normalizeBusinessUnit(rule.businessUnit) : "all";
  if (requiredUnit !== "all" && userUnit !== "all" && userUnit !== requiredUnit) return false;

  const permissions = normalizePermissions(profile.permissions);
  const requiredPermissions = [rule.permission, ...(rule.permissions ?? [])].filter(Boolean) as PermissionKey[];
  return requiredPermissions.every((permission) => Boolean(permissions[permission]));
}
