import { NextResponse } from "next/server";
import { canManageTeamAutoEmails, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import { teamAutoEmailRulesSchema } from "@/src/lib/teams/auto-email-config";
import { getTeamAutoEmailRules, saveTeamAutoEmailRules } from "@/src/lib/teams/auto-email-service";
import { getTeamById } from "@/src/lib/teams/team-service";

export const runtime = "nodejs";
type Params = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { teamId } = await params;
    if (!(await getTeamById(teamId))) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ rules: await getTeamAutoEmailRules(teamId) });
  } catch (error) {
    return errorResponse("teams/[teamId]/auto-email-rules", error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { teamId } = await params;
    const parsed = teamAutoEmailRulesSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.some((rule) => rule.teamId !== teamId)) return NextResponse.json({ error: "TEAM_MISMATCH" }, { status: 400 });
    return NextResponse.json({ rules: await saveTeamAutoEmailRules(teamId, parsed.data, actor.token.uid) });
  } catch (error) {
    return errorResponse("teams/[teamId]/auto-email-rules", error);
  }
}
