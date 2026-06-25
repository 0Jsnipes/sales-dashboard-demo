import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";

export const runtime = "nodejs";

const permissions = z.object({ canEditSales: z.boolean(), canEditKnocks: z.boolean(), canEditRoster: z.boolean(), canEditOnboarding: z.boolean(), canCreateUsers: z.boolean(), canViewPerformance: z.boolean(), canRunBackfill: z.boolean(), canReassignSales: z.boolean() });
const update = z.object({ authUid: z.string().min(1), role: z.enum(["admin", "manager", "user"]), permissions, repUid: z.string().nullable().optional(), managerUid: z.string().nullable().optional(), locationIds: z.array(z.string()).default([]) });
export async function GET(request: Request) { try { const actor = await requireActor(request); if (actor.profile.role !== "superAdmin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); const snapshot = await getAdminDb().collection("users").get(); return NextResponse.json({ users: snapshot.docs.map((document) => document.data()).sort((a, b) => String(a.email).localeCompare(String(b.email))) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); } }
export async function PATCH(request: Request) { try { const actor = await requireActor(request); if (actor.profile.role !== "superAdmin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); const value = update.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 }); const reference = getAdminDb().collection("users").doc(value.data.authUid); const existing = await reference.get(); if (!existing.exists) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 }); if (existing.data()?.role === "superAdmin") return NextResponse.json({ error: "SUPER_ADMIN_PROTECTED" }, { status: 400 }); await reference.update({ ...value.data, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid }); return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); } }
