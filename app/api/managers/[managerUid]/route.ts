import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRosterOptions, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ managerUid: string }> }) {
  try { const actor = await requireActor(request); if (!canManageRosterOptions(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); const { managerUid } = await params; await getAdminDb().collection("managers").doc(managerUid).delete(); return NextResponse.json({ deleted: managerUid }); }
  catch (error) { return errorResponse("managers/[managerUid]", error); }
}
