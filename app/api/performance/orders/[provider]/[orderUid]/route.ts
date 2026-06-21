import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canReassignSales, requireActor } from "@/src/lib/firebase/server-auth";

const input = z.object({ repUid: z.string().min(1) });
export async function PATCH(request: Request, { params }: { params: Promise<{ provider: string; orderUid: string }> }) {
  try { const actor = await requireActor(request); if (!canReassignSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 }); const { provider, orderUid } = await params; if (!["att", "tfiber", "manual"].includes(provider)) return NextResponse.json({ error: "INVALID_PROVIDER" }, { status: 400 }); const rep = await getAdminDb().collection("reps").doc(value.data.repUid).get(); if (!rep.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 }); const ref = getAdminDb().collection("salesOrders").doc(provider).collection("orders").doc(orderUid); if (!(await ref.get()).exists) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 }); await ref.update({ matchedRepUid: value.data.repUid, matchStatus: "manual", matchMethod: "manual", lockedAssignment: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid }); return NextResponse.json({ rep: rep.data() }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
