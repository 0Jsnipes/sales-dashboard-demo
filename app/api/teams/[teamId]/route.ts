import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({
  name: z.string().min(2).max(120).optional(),
  repUids: z.array(z.string().min(1)).max(500).optional(),
}).refine((value) => value.name !== undefined || value.repUids !== undefined, { message: "Nothing to update." });

type Params = { params: Promise<{ teamId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const { teamId } = await params;

    const db = getAdminDb();
    const reference = db.collection("teams").doc(teamId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid };
    if (value.data.name !== undefined) {
      const name = value.data.name.trim();
      const existing = await db.collection("teams").get();
      const duplicate = existing.docs.some((document) => document.id !== teamId && String(document.data().name || "").trim().toLowerCase() === name.toLowerCase());
      if (duplicate) return NextResponse.json({ error: "A team with this name already exists." }, { status: 409 });
      updates.name = name;
    }
    if (value.data.repUids !== undefined) updates.repUids = [...new Set(value.data.repUids)];

    await reference.update(updates);
    const updated = await reference.get();
    return NextResponse.json({ team: updated.data() });
  } catch (error) {
    return errorResponse("teams/[teamId]", error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { teamId } = await params;
    await getAdminDb().collection("teams").doc(teamId).delete();
    return NextResponse.json({ deleted: teamId });
  } catch (error) {
    return errorResponse("teams/[teamId]", error);
  }
}
