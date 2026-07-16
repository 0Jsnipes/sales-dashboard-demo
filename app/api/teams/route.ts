import { NextResponse } from "next/server";
import { z } from "zod";
import { canExportTeamReports, canManageTeamAutoEmails, canManageTeams, canEmailTeamReports, canViewTeams, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { createTeam, getTeamById, getTeams, syncTeamMembers } from "@/src/lib/teams/team-service";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2563eb"),
  active: z.boolean().default(true),
  members: z.array(z.string().trim().min(1)).max(400).default([]),
  managerRepUid: z.string().trim().min(1).nullable().default(null),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canViewTeams(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const [teams, repsSnapshot] = await Promise.all([getTeams(), getAdminDb().collection("reps").get()]);
    const canManage = canManageTeams(actor);
    const memberById = new Map<string, { repUid: string; displayName: string; email: string; status: string }>();
    for (const document of repsSnapshot.docs) {
      const data = document.data();
      const summary = {
        repUid: String(data.repUid || document.id),
        displayName: String(data.displayName || "Unknown rep"),
        email: String(data.email || ""),
        status: String(data.status || ""),
      };
      memberById.set(document.id, summary);
      memberById.set(summary.repUid, summary);
    }
    return NextResponse.json({
      teams: teams.map((team) => ({
        ...team,
        memberDetails: team.members.map((repUid) => memberById.get(repUid)).filter(Boolean),
        managerDetails: team.managerRepUid ? memberById.get(team.managerRepUid) ?? null : null,
      })),
      canManage,
      canExport: canExportTeamReports(actor),
      canEmail: canEmailTeamReports(actor),
      canManageAutoEmails: canManageTeamAutoEmails(actor),
      canPrepareExports: canExportTeamReports(actor),
    });
  } catch (error) {
    return errorResponse("teams", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeams(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const existing = await getTeams();
    if (existing.some((team) => team.name.toLowerCase() === value.data.name.toLowerCase())) {
      return NextResponse.json({ error: "A team with this name already exists." }, { status: 409 });
    }
    if (value.data.managerRepUid && !(await getAdminDb().collection("reps").doc(value.data.managerRepUid).get()).exists) {
      return NextResponse.json({ error: "Choose a valid team manager." }, { status: 400 });
    }
    const { members, ...details } = value.data;
    const team = await createTeam(details, actor.token.uid);
    if (members.length) await syncTeamMembers(team.teamId, members, actor.token.uid);
    return NextResponse.json({ team: await getTeamById(team.teamId) }, { status: 201 });
  } catch (error) {
    return errorResponse("teams", error);
  }
}
