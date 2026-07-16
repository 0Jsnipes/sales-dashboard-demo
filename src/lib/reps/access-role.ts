export const repAccessRoleValues = ["rep", "manager", "travelingSalesManager", "regionalManager"] as const;
export type RepAccessRole = typeof repAccessRoleValues[number];
export type RepDashboardScope = "self" | "managedTeam" | "currentTeam";

export type RepRolePermissions = {
  dashboardOnly: true;
  dashboardScope: RepDashboardScope;
  canFilterRepresentatives: boolean;
};

export const REP_ROLE_PERMISSIONS: Record<RepAccessRole, RepRolePermissions> = {
  rep: { dashboardOnly: true, dashboardScope: "self", canFilterRepresentatives: false },
  manager: { dashboardOnly: true, dashboardScope: "managedTeam", canFilterRepresentatives: true },
  travelingSalesManager: { dashboardOnly: true, dashboardScope: "currentTeam", canFilterRepresentatives: true },
  regionalManager: { dashboardOnly: true, dashboardScope: "currentTeam", canFilterRepresentatives: true },
};

export const REP_ACCESS_ROLE_OPTIONS: Array<{ value: RepAccessRole; label: string; description: string }> = [
  { value: "rep", label: "Rep", description: "Dashboard only; their own statistics." },
  { value: "manager", label: "Manager", description: "Dashboard only; their managed team and its reps." },
  { value: "travelingSalesManager", label: "Traveling sales manager", description: "Dashboard only; the team they are currently assigned to." },
  { value: "regionalManager", label: "Regional manager", description: "Dashboard only; the team they are currently assigned to." },
];

export function normalizeRepAccessRole(value: unknown): RepAccessRole {
  return repAccessRoleValues.includes(value as RepAccessRole) ? value as RepAccessRole : "rep";
}

export function repRolePermissions(value: unknown) {
  return REP_ROLE_PERMISSIONS[normalizeRepAccessRole(value)];
}

export function repAccessRoleLabel(value: unknown) {
  const role = normalizeRepAccessRole(value);
  return REP_ACCESS_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "Rep";
}
