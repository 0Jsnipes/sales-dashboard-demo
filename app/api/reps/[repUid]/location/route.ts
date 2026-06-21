import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";

const input = z.object({ weekISO: z.string().regex(/^\d{4}-W\d{1,2}$/).transform((value) => { const [year, week] = value.split("-W"); return `${year}-W${week.padStart(2, "0")}`; }), locationId: z.string().min(1), locationName: z.string().min(1), mode: z.enum(["forward", "single"]) });
export async function POST(request: Request, { params }: { params: Promise<{ repUid: string }> }) {
  try {
    const actor = await requireActor(request); if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json()); if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const { repUid } = await params; const assignmentId = [repUid, value.data.weekISO, value.data.mode].join("_");
    const assignment = { assignmentId, repUid, ...value.data, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid };
    await getAdminDb().collection("repLocationAssignments").doc(assignmentId).set(assignment, { merge: true });
    return NextResponse.json({ assignment });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
