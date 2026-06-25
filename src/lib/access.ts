import type { AppUser, BusinessUnit } from "@/src/types/user";

export type PermissionKey = keyof AppUser["permissions"];

export type AccessRule = {
  businessUnit?: BusinessUnit;
  permission?: PermissionKey;
  superAdminOnly?: boolean;
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

export function canAccessRule(profile: AppUser | null | undefined, rule: AccessRule) {
  if (!profile) return false;
  if (profile.role === "superAdmin") return true;
  if (rule.superAdminOnly) return false;

  const userUnit = normalizeBusinessUnit(profile.businessUnit);
  const requiredUnit = rule.businessUnit ? normalizeBusinessUnit(rule.businessUnit) : "all";
  if (requiredUnit !== "all" && userUnit !== "all" && userUnit !== requiredUnit) return false;

  return rule.permission ? Boolean(profile.permissions?.[rule.permission]) : true;
}
