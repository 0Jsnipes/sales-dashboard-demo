import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageRoster, canViewTeams, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { archiveTeam, getTeamById, getTeams, syncTeamMembers, updateTeam } from "@/src/lib/teams/team-service";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  active: z.boolean().optional(),
  members: z.array(z.string().min(1)).max(400).optional(),
  managerRepUid: z.string().trim().min(1).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

type Params = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canViewTeams(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { teamId } = await params;
    const team = await getTeamById(teamId);
    if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ team });
  } catch (error) {
    return errorResponse("teams/[teamId]", error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const { teamId } = await params;
    if (!await getTeamById(teamId)) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
    if (value.data.name) {
      const teams = await getTeams();
      if (teams.some((team) => team.teamId !== teamId && team.name.toLowerCase() === value.data.name!.toLowerCase())) {
        return NextResponse.json({ error: "A team with this name already exists." }, { status: 409 });
      }
    }
    if (value.data.managerRepUid && !(await getAdminDb().collection("reps").doc(value.data.managerRepUid).get()).exists) {
      return NextResponse.json({ error: "Choose a valid team manager." }, { status: 400 });
    }
    const { members, ...details } = value.data;
    if (Object.keys(details).length) await updateTeam(teamId, details, actor.token.uid);
    if (members) await syncTeamMembers(teamId, members, actor.token.uid);
    return NextResponse.json({ team: await getTeamById(teamId) });
  } catch (error) {
    return errorResponse("teams/[teamId]", error);
  }
}

/** Teams are archived by default so historical reports retain a stable grouping. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { teamId } = await params;
    if (!await getTeamById(teamId)) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ team: await archiveTeam(teamId, actor.token.uid) });
  } catch (error) {
    return errorResponse("teams/[teamId]", error);
  }
}
