import { NextResponse } from "next/server";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { locationId } = await params;
    await getAdminDb().collection("locations").doc(locationId).delete();
    return NextResponse.json({ deleted: locationId });
  } catch (error) { return errorResponse("locations/[locationId]", error); }
}
