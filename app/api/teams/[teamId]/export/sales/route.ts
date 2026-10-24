import { NextResponse } from "next/server";
import { canExportTeamReports, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import { buildTeamSalesExport, parseTeamExportRange, teamExportSlug, type TeamExportProvider } from "@/src/lib/teams/export";
import { getTeamById } from "@/src/lib/teams/team-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canExportTeamReports(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const range = parseTeamExportRange(new URL(request.url).searchParams);
    if (!range) return NextResponse.json({ error: "Choose a valid export date range." }, { status: 400 });
    const provider = new URL(request.url).searchParams.get("provider") as TeamExportProvider | null;
    if (provider !== "companya" && provider !== "companyb") return NextResponse.json({ error: "Choose Company A or Company B." }, { status: 400 });
    const team = await getTeamById((await params).teamId);
    if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
    const file = await buildTeamSalesExport(team, range, provider);
    return new NextResponse(file, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${teamExportSlug(team)}-${provider}-sales-${range.start}-to-${range.end}.xlsx"`,
    } });
  } catch (error) {
    return errorResponse("teams/[teamId]/export/sales", error, "EXPORT_FAILED");
  }
}
