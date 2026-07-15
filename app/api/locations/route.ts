import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRosterOptions, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({ name: z.string().min(2).max(120) });
const idFor = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const snapshot = await getAdminDb().collection("locations").orderBy("name").get();
    return NextResponse.json({ locations: snapshot.docs.map((document) => document.data()) });
  } catch (error) { return errorResponse("locations", error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageRosterOptions(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const name = value.data.name.trim(); const locationId = idFor(name);
    if (!locationId) return NextResponse.json({ error: "INVALID_LOCATION" }, { status: 400 });
    const reference = getAdminDb().collection("locations").doc(locationId);
    if ((await reference.get()).exists) return NextResponse.json({ error: "A location with this name already exists." }, { status: 409 });
    const location = { locationId, name, createdAt: FieldValue.serverTimestamp(), createdBy: actor.token.uid };
    await reference.create(location);
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) { return errorResponse("locations", error); }
}
