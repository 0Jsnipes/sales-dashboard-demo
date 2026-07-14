import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({ name: z.string().min(2).max(120) });
const idFor = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export async function GET(request: Request) {
  try { await requireActor(request); const snapshot = await getAdminDb().collection("managers").orderBy("name").get(); return NextResponse.json({ managers: snapshot.docs.map((document) => document.data()) }); }
  catch (error) { return errorResponse("managers", error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request); if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const name = value.data.name.trim(); const managerUid = idFor(name); const reference = getAdminDb().collection("managers").doc(managerUid);
    if (!managerUid) return NextResponse.json({ error: "INVALID_MANAGER" }, { status: 400 });
    if ((await reference.get()).exists) return NextResponse.json({ error: "A manager with this name already exists." }, { status: 409 });
    const manager = { managerUid, name, createdAt: FieldValue.serverTimestamp(), createdBy: actor.token.uid }; await reference.create(manager);
    return NextResponse.json({ manager }, { status: 201 });
  } catch (error) { return errorResponse("managers", error); }
}
