import { DEFAULT_ADMIN_PERMISSIONS } from "@/src/lib/access";
import { normalizeRepAccessRole, repRolePermissions } from "@/src/lib/reps/access-role";
import type { Rep } from "@/src/types/rep";
import type { AppUser } from "@/src/types/user";

export const ROSTER_VIEW_PREFIX = "roster:";

export const DASHBOARD_ONLY_PERMISSIONS: AppUser["permissions"] = {
  ...Object.fromEntries(Object.keys(DEFAULT_ADMIN_PERMISSIONS).map((key) => [key, false])) as AppUser["permissions"],
  canViewDashboard: true,
};

export function rosterViewAuthUid(repUid: string) {
  return `${ROSTER_VIEW_PREFIX}${repUid}`;
}

export function rosterViewRepUid(value: string) {
  return value.startsWith(ROSTER_VIEW_PREFIX) ? value.slice(ROSTER_VIEW_PREFIX.length).trim() : null;
}

export function rosterViewProfile(rep: Rep): AppUser {
  const accessRole = normalizeRepAccessRole(rep.accessRole);
  const rolePolicy = repRolePermissions(accessRole);
  return {
    authUid: rosterViewAuthUid(rep.repUid),
    email: rep.email?.trim() || `${rep.displayName} (roster preview)`,
    role: accessRole === "rep" ? "user" : "manager",
    businessUnit: "fiber",
    repUid: rep.repUid,
    managerUid: rep.managerUid ?? null,
    teamId: rep.teamId ?? null,
    repAccessRole: accessRole,
    dashboardScope: rolePolicy.dashboardScope,
    locationIds: rep.locationId ? [rep.locationId] : [],
    permissions: { ...DASHBOARD_ONLY_PERMISSIONS },
  };
}
