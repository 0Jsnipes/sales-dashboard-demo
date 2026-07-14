import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({
  weekISO: z.string().regex(/^\d{4}-W\d{1,2}$/).transform((value) => {
    const [year, week] = value.split("-W");
    return `${year}-W${week.padStart(2, "0")}`;
  }),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  mode: z.enum(["forward", "single"]),
  persistRepLocation: z.boolean().optional(),
});
export async function POST(request: Request, { params }: { params: Promise<{ repUid: string }> }) {
  try {
    const actor = await requireActor(request); if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const { repUid } = await params;
    const assignmentId = [repUid, value.data.weekISO, value.data.mode].join("_");
    const db = getAdminDb();
    const assignment = { assignmentId, repUid, weekISO: value.data.weekISO, locationId: value.data.locationId, locationName: value.data.locationName, mode: value.data.mode, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid };
    await db.collection("repLocationAssignments").doc(assignmentId).set(assignment, { merge: true });
    if (value.data.persistRepLocation !== false) {
      await db.collection("reps").doc(repUid).set({
        locationId: value.data.locationId,
        locationName: value.data.locationName,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.token.uid,
      }, { merge: true });
    }
    return NextResponse.json({ assignment });
  } catch (error) { return errorResponse("reps/[repUid]/location", error); }
}
