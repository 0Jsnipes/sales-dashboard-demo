import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { canManageOnboarding, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";

export const runtime = "nodejs";

const input = z.object({ checks: z.record(z.string(), z.boolean()), onboarded: z.boolean() });
export async function PATCH(request: Request, { params }: { params: Promise<{ repUid: string }> }) {
  try { const actor = await requireActor(request); if (!canManageOnboarding(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 }); const { repUid } = await params; const ref = getAdminDb().collection("reps").doc(repUid); if (!(await ref.get()).exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 }); const onboarding = { onboarded: value.data.onboarded, checks: value.data.checks, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid }; await ref.update({ onboarding, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid }); return NextResponse.json({ onboarding }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
