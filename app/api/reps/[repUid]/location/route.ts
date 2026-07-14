import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import {
  assignmentDocId,
  findSupersedingWeekOnlyOverride,
  groupAssignmentsByRep,
  isWeekStart,
  normalizeAssignmentDoc,
  resolveRepLocation,
} from "@/src/lib/reps/location-assignments";
import type { Rep } from "@/src/types/rep";

export const runtime = "nodejs";

const postInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  scope: z.enum(["week_only", "forward"]),
});

// This endpoint only ever writes to repLocationAssignments. It intentionally
// never touches reps/{repUid}.locationId — that field is a fallback of last
// resort for weeks with no assignment, set only from the roster profile editor.
// Mutating it here was the root cause of "changing one week's location changed
// every historical week": every week without its own assignment reads through
// to that global default, so overwriting it silently rewrote the whole history.
export async function POST(request: Request, { params }: { params: Promise<{ repUid: string }> }) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const parsed = postInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { weekStart, locationId, locationName, scope } = parsed.data;
    if (!isWeekStart(weekStart)) return NextResponse.json({ error: "WEEK_START_MUST_BE_MONDAY" }, { status: 400 });

    const { repUid } = await params;
    const db = getAdminDb();
    const [repSnap, locationSnap, assignmentsSnap] = await Promise.all([
      db.collection("reps").doc(repUid).get(),
      db.collection("locations").doc(locationId).get(),
      db.collection("repLocationAssignments").where("repUid", "==", repUid).get(),
    ]);
    if (!repSnap.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 });
    if (!locationSnap.exists) return NextResponse.json({ error: "LOCATION_NOT_FOUND" }, { status: 400 });

    const existingAssignments = assignmentsSnap.docs
      .map((document) => normalizeAssignmentDoc(document.data()))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const docId = assignmentDocId(repUid, weekStart, scope);
    const reference = db.collection("repLocationAssignments").doc(docId);
    const existingDoc = assignmentsSnap.docs.find((document) => document.id === docId);
    // A legacy doc (old weekISO/mode id) can normalize to this exact same
    // (weekStart, scope) slot. Replace it in the same batch so we never end up
    // with two documents both claiming to be the current value for one slot.
    const legacyDuplicate = assignmentsSnap.docs.find((document) => {
      if (document.id === docId) return false;
      const normalized = normalizeAssignmentDoc(document.data());
      return normalized?.weekStart === weekStart && normalized.scope === scope;
    });

    const payload = {
      repUid,
      weekStart,
      scope,
      locationId,
      locationName,
      createdAt: existingDoc?.data()?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.token.uid,
    };

    const batch = db.batch();
    batch.set(reference, payload);
    if (legacyDuplicate) batch.delete(legacyDuplicate.ref);
    await batch.commit();

    // Read back what actually landed instead of trusting that the write call
    // resolving without throwing means the data is really there.
    const confirmed = await reference.get();
    const savedAssignment = normalizeAssignmentDoc(confirmed.data());
    if (!confirmed.exists || !savedAssignment) {
      return NextResponse.json({ error: "ASSIGNMENT_WRITE_FAILED" }, { status: 500 });
    }

    const supersededBy = scope === "forward" ? findSupersedingWeekOnlyOverride(existingAssignments, weekStart) : null;

    return NextResponse.json({ assignment: savedAssignment, supersededBy });
  } catch (error) {
    return errorResponse("reps/[repUid]/location", error);
  }
}

// Resolves a rep's location for one specific week using the same shared
// algorithm every other reader uses, so the "current location" a modal shows
// before saving can never disagree with what the rest of the app displays.
export async function GET(request: Request, { params }: { params: Promise<{ repUid: string }> }) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const weekStart = url.searchParams.get("weekStart") ?? "";
    if (!isWeekStart(weekStart)) return NextResponse.json({ error: "WEEK_START_MUST_BE_MONDAY" }, { status: 400 });

    const { repUid } = await params;
    const db = getAdminDb();
    const [repSnap, assignmentsSnap] = await Promise.all([
      db.collection("reps").doc(repUid).get(),
      db.collection("repLocationAssignments").where("repUid", "==", repUid).get(),
    ]);
    if (!repSnap.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 });

    const rep = repSnap.data() as Rep;
    const assignments = assignmentsSnap.docs
      .map((document) => normalizeAssignmentDoc(document.data()))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const resolved = resolveRepLocation(rep, weekStart, groupAssignmentsByRep(assignments));
    const supersededBy = findSupersedingWeekOnlyOverride(assignments, weekStart);

    return NextResponse.json({ resolved, supersededBy });
  } catch (error) {
    return errorResponse("reps/[repUid]/location", error);
  }
}
