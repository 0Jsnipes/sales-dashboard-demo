import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canRunBackfill, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({ repUid: z.string().min(1), orderDateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), provider: z.enum(["att", "tfiber", "frontier"]), accountStatus: z.string().max(120).default("Manual entry"), orderId: z.string().max(120).optional(), notes: z.string().max(1000).optional() });

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request); if (!canRunBackfill(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const repSnapshot = await getAdminDb().collection("reps").doc(value.data.repUid).get(); if (!repSnapshot.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 });
    const rep = repSnapshot.data()!; const orderUid = randomUUID(); const orderId = value.data.orderId?.trim() || `MANUAL-${orderUid.slice(0, 8).toUpperCase()}`;
    const data = { orderUid, orderId, provider: value.data.provider, sourceUploadId: null, orderDate: value.data.orderDateId, orderDateId: value.data.orderDateId, saleCount: 1, rawRepName: String(rep.displayName), rawSalesId: "", rawManagerName: String(rep.managerName || ""), matchedRepUid: value.data.repUid, matchStatus: "manual", matchMethod: "manual", lockedAssignment: true, accountStatus: value.data.accountStatus.trim(), installationDateId: "", cancellationDateId: "", packageName: "Manual sale", serviceType: "manual", rawData: { "Order Date": value.data.orderDateId, "Order ID": orderId, "Representative": rep.displayName, "Provider": value.data.provider === "tfiber" ? "T-Fiber" : value.data.provider === "att" ? "ATT" : "Frontier", "Account Status": value.data.accountStatus.trim(), "Notes": value.data.notes?.trim() || "" }, createdAt: FieldValue.serverTimestamp(), createdBy: actor.token.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid };
    await getAdminDb().collection("salesOrders").doc("manual").collection("orders").doc(orderUid).create(data);
    await getAdminDb().collection("auditLogs").add({ type: "manualSale", actorUid: actor.token.uid, repUid: value.data.repUid, orderUid, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ sale: data }, { status: 201 });
  } catch (error) { return errorResponse("backfill", error); }
}
