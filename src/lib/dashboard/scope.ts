import { repRolePermissions, type RepDashboardScope } from "@/src/lib/reps/access-role";
import type { AppUser } from "@/src/types/user";

export type DashboardScopeRep = {
  repUid: string;
  displayName?: string;
  managerUid?: string | null;
  managerName?: string;
  teamId?: string | null;
};

export type DashboardScopeTeam = {
  teamId: string;
  active?: boolean;
  managerRepUid?: string | null;
  members: string[];
};

export type DashboardAccessScope = {
  mode: "all" | RepDashboardScope;
  restricted: boolean;
  canFilterReps: boolean;
  allowedRepUids: Set<string> | null;
};

function managerKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function requestedScope(profile: AppUser): RepDashboardScope {
  if (profile.dashboardScope === "self" || profile.dashboardScope === "managedTeam" || profile.dashboardScope === "currentTeam") return profile.dashboardScope;
  if (profile.repAccessRole) return repRolePermissions(profile.repAccessRole).dashboardScope;
  return profile.role === "manager" ? "managedTeam" : "self";
}

export function resolveDashboardAccessScope(profile: AppUser, reps: DashboardScopeRep[], teams: DashboardScopeTeam[]): DashboardAccessScope {
  if (profile.role === "superAdmin" || profile.role === "admin") return { mode: "all", restricted: false, canFilterReps: true, allowedRepUids: null };
  const mode = requestedScope(profile);
  const repUid = profile.repUid?.trim() || "";
  const allowed = new Set<string>();
  if (repUid) allowed.add(repUid);
  const actorRep = reps.find((rep) => rep.repUid === repUid);

  if (mode === "managedTeam" && repUid) {
    const managedTeams = teams.filter((team) => team.active !== false && team.managerRepUid === repUid);
    for (const team of managedTeams) for (const member of team.members) allowed.add(member);
    if (!managedTeams.length && actorRep) {
      const name = actorRep.displayName?.trim().toLowerCase() || "";
      const key = managerKey(actorRep.displayName || "");
      for (const rep of reps) {
        if ((name && rep.managerName?.trim().toLowerCase() === name) || (key && rep.managerUid === key)) allowed.add(rep.repUid);
      }
    }
  }

  if (mode === "currentTeam") {
    const teamId = profile.teamId || actorRep?.teamId;
    const currentTeam = teams.find((team) => team.active !== false && team.teamId === teamId);
    if (currentTeam) for (const member of currentTeam.members) allowed.add(member);
  }

  return { mode, restricted: true, canFilterReps: mode !== "self", allowedRepUids: allowed };
}

export function dashboardRepAllowed(scope: DashboardAccessScope, repUid: string | null | undefined) {
  return scope.allowedRepUids === null || Boolean(repUid && scope.allowedRepUids.has(repUid));
}
