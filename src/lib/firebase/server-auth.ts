import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { AppUser } from "@/src/types/user";
import { getAdminAuth, getAdminDb } from "./admin";
import { normalizeBusinessUnit } from "@/src/lib/access";

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
