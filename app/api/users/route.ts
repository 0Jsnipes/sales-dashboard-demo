import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { normalizeBusinessUnit } from "@/src/lib/access";

export const runtime = "nodejs";

const permissions = z.object({
  canEditSales: z.boolean(),
  canEditKnocks: z.boolean(),
  canEditRoster: z.boolean(),
  canEditOnboarding: z.boolean(),
  canCreateUsers: z.boolean(),
  canViewPerformance: z.boolean(),
  canRunBackfill: z.boolean(),
  canReassignSales: z.boolean(),
});

type Permissions = z.infer<typeof permissions>;

const defaultAdminPermissions: Permissions = {
  canEditSales: true,
  canEditKnocks: true,
  canEditRoster: true,
  canEditOnboarding: true,
  canCreateUsers: false,
  canViewPerformance: true,
  canRunBackfill: true,
  canReassignSales: true,
};

const update = z.object({
  authUid: z.string().min(1),
  role: z.enum(["admin", "manager", "user"]),
  businessUnit: z.enum(["fiber", "energy", "all"]).default("fiber"),
  permissions,
  repUid: z.string().nullable().optional(),
  managerUid: z.string().nullable().optional(),
  locationIds: z.array(z.string()).default([]),
});

const create = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  businessUnit: z.enum(["fiber", "energy"]).default("fiber"),
  role: z.enum(["admin", "manager", "user"]).default("admin"),
  permissions: permissions.optional(),
  repUid: z.string().nullable().optional(),
  managerUid: z.string().nullable().optional(),
  locationIds: z.array(z.string()).default([]),
});

function authErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.profile.role !== "superAdmin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const snapshot = await getAdminDb().collection("users").get();
    const users = snapshot.docs
      .map((document): Record<string, unknown> => {
        const data = document.data() as Record<string, unknown>;
        return { ...data, businessUnit: normalizeBusinessUnit(data.businessUnit) };
      })
      .sort((a, b) => String(a["email"]).localeCompare(String(b["email"])));
    return NextResponse.json({
      users,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let createdAuthUid: string | null = null;
  try {
    const actor = await requireActor(request);
    if (actor.profile.role !== "superAdmin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = create.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });

    const auth = getAdminAuth();
    const db = getAdminDb();
    let authUser = await auth.getUserByEmail(value.data.email).catch((error) => {
      if (authErrorCode(error) === "auth/user-not-found") return null;
      throw error;
    });

    if (authUser) {
      const existingProfile = await db.collection("users").doc(authUser.uid).get();
      if (existingProfile.exists) return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 409 });
    }

    if (!authUser) {
      authUser = await auth.createUser({
        email: value.data.email,
        emailVerified: false,
        disabled: false,
        password: value.data.password,
      });
      createdAuthUid = authUser.uid;
    } else {
      await auth.updateUser(authUser.uid, { password: value.data.password, disabled: false });
    }

    const reference = db.collection("users").doc(authUser.uid);
    const existing = await reference.get();
    if (existing.exists) return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 409 });

    const now = FieldValue.serverTimestamp();
    const profile = {
      authUid: authUser.uid,
      email: value.data.email,
      role: value.data.role,
      businessUnit: value.data.businessUnit,
      mustChangePassword: true,
      permissions: value.data.permissions ?? defaultAdminPermissions,
      repUid: value.data.repUid ?? null,
      managerUid: value.data.managerUid ?? null,
      locationIds: value.data.locationIds,
      createdAt: now,
      createdBy: actor.token.uid,
      updatedAt: now,
      updatedBy: actor.token.uid,
      lastLoginAt: null,
    };
    await reference.create(profile);

    return NextResponse.json({
      user: {
        ...profile,
        createdAt: null,
        updatedAt: null,
      },
    }, { status: 201 });
  } catch (error) {
    if (createdAuthUid) await getAdminAuth().deleteUser(createdAuthUid).catch(() => undefined);
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.profile.role !== "superAdmin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = update.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const reference = getAdminDb().collection("users").doc(value.data.authUid);
    const existing = await reference.get();
    if (!existing.exists) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (existing.data()?.role === "superAdmin") return NextResponse.json({ error: "SUPER_ADMIN_PROTECTED" }, { status: 400 });
    await reference.update({ ...value.data, businessUnit: normalizeBusinessUnit(value.data.businessUnit), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
