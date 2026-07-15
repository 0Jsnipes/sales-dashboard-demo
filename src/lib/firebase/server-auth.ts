import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { AppUser } from "@/src/types/user";
import { getAdminAuth, getAdminDb } from "./admin";
import { normalizeBusinessUnit, normalizePermissions } from "@/src/lib/access";
import type { PermissionKey } from "@/src/lib/access";

export type ServerActor = { token: DecodedIdToken; profile: AppUser };

export async function requireActor(request: Request): Promise<ServerActor> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = await getAdminAuth().verifyIdToken(header.slice(7));
  const profile = await getAdminDb().collection("users").doc(token.uid).get();
  if (!profile.exists) throw new Error("PROFILE_NOT_FOUND");
  return { token, profile: profile.data() as AppUser };
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

export function canManageRosterOptions(actor: ServerActor) {
  return hasFeaturePermission(actor, "canManageRosterOptions");
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
