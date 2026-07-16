import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebase/admin";
import { canCreateUsers, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import { DASHBOARD_ONLY_PERMISSIONS } from "@/src/lib/auth/roster-view-profile";
import { normalizeRepAccessRole, repRolePermissions } from "@/src/lib/reps/access-role";
import type { Rep } from "@/src/types/rep";

export const runtime = "nodejs";

type Params = { params: Promise<{ repUid: string }> };

function authErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

export async function POST(request: Request, { params }: Params) {
  let createdAuthUid: string | null = null;
  try {
    const actor = await requireActor(request);
    if (!canCreateUsers(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const { repUid } = await params;
    const db = getAdminDb();
    const repReference = db.collection("reps").doc(repUid);
    const repSnapshot = await repReference.get();
    if (!repSnapshot.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 });

    const rep = { ...repSnapshot.data(), repUid } as Rep;
    const displayName = rep.displayName?.trim();
    const email = rep.email?.trim().toLowerCase();
    if (!displayName || !email) return NextResponse.json({ error: "NAME_AND_EMAIL_REQUIRED" }, { status: 400 });
    if (rep.authUid) return NextResponse.json({ error: "ACCOUNT_ALREADY_LINKED" }, { status: 409 });

    const auth = getAdminAuth();
    let authUser = await auth.getUserByEmail(email).catch((error) => {
      if (authErrorCode(error) === "auth/user-not-found") return null;
      throw error;
    });

    if (authUser) {
      const existingProfile = await db.collection("users").doc(authUser.uid).get();
      if (existingProfile.exists) return NextResponse.json({ error: "EMAIL_ALREADY_HAS_ACCOUNT" }, { status: 409 });
      await auth.updateUser(authUser.uid, { displayName, disabled: false });
    } else {
      authUser = await auth.createUser({ email, displayName, emailVerified: false, disabled: false });
      createdAuthUid = authUser.uid;
    }

    const accessRole = normalizeRepAccessRole(rep.accessRole);
    const rolePolicy = repRolePermissions(accessRole);
    const now = FieldValue.serverTimestamp();
    const userProfile = {
      authUid: authUser.uid,
      displayName,
      email,
      role: accessRole === "rep" ? "user" : "manager",
      businessUnit: "fiber",
      mustChangePassword: true,
      repUid,
      managerUid: rep.managerUid ?? null,
      teamId: rep.teamId ?? null,
      repAccessRole: accessRole,
      dashboardScope: rolePolicy.dashboardScope,
      locationIds: rep.locationId ? [rep.locationId] : [],
      permissions: { ...DASHBOARD_ONLY_PERMISSIONS },
      createdAt: now,
      createdBy: actor.token.uid,
      updatedAt: now,
      updatedBy: actor.token.uid,
      lastLoginAt: null,
    };

    const batch = db.batch();
    batch.create(db.collection("users").doc(authUser.uid), userProfile);
    batch.update(repReference, {
      authUid: authUser.uid,
      accountStatus: "active",
      accountCreatedAt: now,
      accountCreatedBy: actor.token.uid,
      updatedAt: now,
      updatedBy: actor.token.uid,
    });
    await batch.commit();

    return NextResponse.json({ authUid: authUser.uid, accountStatus: "active", emailSent: false }, { status: 201 });
  } catch (error) {
    if (createdAuthUid) await getAdminAuth().deleteUser(createdAuthUid).catch(() => undefined);
    return errorResponse("reps/[repUid]/account", error);
  }
}
