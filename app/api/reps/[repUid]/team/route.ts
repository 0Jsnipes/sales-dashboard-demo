import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { assignUserToTeam } from "@/src/lib/teams/team-service";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";
type Params = { params: Promise<{ repUid: string }> };
const input = z.object({ teamId: z.string().min(1).nullable() });

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const { repUid } = await params;
    await assignUserToTeam(repUid, value.data.teamId, actor.token.uid);
    return NextResponse.json({ repUid, teamId: value.data.teamId });
  } catch (error) {
    return errorResponse("reps/[repUid]/team", error);
  }
}
