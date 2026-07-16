import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { AppUser } from "@/src/types/user";
import { getAdminAuth, getAdminDb } from "./admin";
import { normalizeBusinessUnit, normalizePermissions } from "@/src/lib/access";
import type { PermissionKey } from "@/src/lib/access";
import { VIEW_AS_HEADER, viewAsRequestIsReadOnly } from "@/src/lib/auth/view-as";
import { rosterViewProfile, rosterViewRepUid } from "@/src/lib/auth/roster-view-profile";
import type { Rep } from "@/src/types/rep";

export type ServerActor = { token: DecodedIdToken; profile: AppUser; actualProfile: AppUser; viewAsAuthUid: string | null };

export async function requireActor(request: Request): Promise<ServerActor> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = await getAdminAuth().verifyIdToken(header.slice(7));
  const profile = await getAdminDb().collection("users").doc(token.uid).get();
  if (!profile.exists) throw new Error("PROFILE_NOT_FOUND");
  const actualProfile = profile.data() as AppUser;
  const viewAsAuthUid = request.headers.get(VIEW_AS_HEADER)?.trim() || null;
  if (!viewAsAuthUid) return { token, profile: actualProfile, actualProfile, viewAsAuthUid: null };
  if (actualProfile.role !== "superAdmin") throw new Error("FORBIDDEN");
  if (!viewAsRequestIsReadOnly(request.method)) throw new Error("VIEW_AS_READ_ONLY");
  const rosterRepUid = rosterViewRepUid(viewAsAuthUid);
  if (rosterRepUid) {
    const targetRep = await getAdminDb().collection("reps").doc(rosterRepUid).get();
    if (!targetRep.exists) throw new Error("VIEW_AS_TARGET_NOT_FOUND");
    return { token, profile: rosterViewProfile(targetRep.data() as Rep), actualProfile, viewAsAuthUid };
  }
  const target = await getAdminDb().collection("users").doc(viewAsAuthUid).get();
  if (!target.exists) throw new Error("VIEW_AS_TARGET_NOT_FOUND");
  return { token, profile: target.data() as AppUser, actualProfile, viewAsAuthUid };
}

function canAccessFiber(actor: ServerActor) {
  const unit = normalizeBusinessUnit(actor.profile.businessUnit);
  return actor.profile.role === "superAdmin" || unit === "all" || unit === "fiber";
}

function hasFeaturePermission(actor: ServerActor, permission: PermissionKey) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && normalizePermissions(actor.profile.permissions)[permission]);
}

export function canManageRoster(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canEditRoster);
}

export function canCreateUsers(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && normalizePermissions(actor.profile.permissions).canCreateUsers);
}

export function canImportSales(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canEditSales);
}

export function canRunBackfill(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canRunBackfill);
}

export function canManageOnboarding(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canEditOnboarding);
}

export function canReassignSales(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canReassignSales);
}

export function canViewKnockHours(actor: ServerActor) {
  return hasFeaturePermission(actor, "canViewKnockHours");
}

export function canManageTeams(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageTeams");
}

export function canExportTeamReports(actor: ServerActor) {
  return hasFeaturePermission(actor, "canExportTeamReports");
}

export function canEmailTeamReports(actor: ServerActor) {
  return hasFeaturePermission(actor, "canEmailTeamReports");
}

export function canManageTeamAutoEmails(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageTeamAutoEmails");
}

export function canManageRosterOptions(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageRosterOptions");
}

export function canManageRepRoles(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageRepRoles");
}

export function canManageResources(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageResources");
}

export function canImportEmailReports(actor: ServerActor) {
  return hasFeaturePermission(actor, "canImportEmailReports");
}

export function canViewReporting(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && actor.profile.role === "admin" && actor.profile.permissions.canViewReporting);
}

export function canViewTeams(actor: ServerActor) {
  return actor.profile.role === "superAdmin" || (canAccessFiber(actor) && normalizePermissions(actor.profile.permissions).canViewTeams);
}
