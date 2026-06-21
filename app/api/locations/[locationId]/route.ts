import { NextResponse } from "next/server";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";

export async function DELETE(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { locationId } = await params;
    await getAdminDb().collection("locations").doc(locationId).delete();
    return NextResponse.json({ deleted: locationId });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
