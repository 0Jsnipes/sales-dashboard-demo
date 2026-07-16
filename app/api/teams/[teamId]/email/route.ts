import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/src/lib/api/error-response";
import { canEmailTeamReports, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { queueTeamReportEmail } from "@/src/lib/teams/email-report";
import { teamReportFileKinds } from "@/src/lib/teams/report-types";
import { getTeamById } from "@/src/lib/teams/team-service";

export const runtime = "nodejs";

const dateRange = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.start <= value.end, { message: "Choose a valid date range." });

const input = z.object({
  recipient: z.string().trim().email().optional(),
  cc: z.array(z.string().trim().email()).max(20).default([]),
  subject: z.string().trim().min(1).max(200).default("Orders to date"),
  message: z.string().trim().min(1).max(4000),
  files: z.array(z.enum(teamReportFileKinds)).min(1).max(4),
  salesRange: dateRange,
  knocksRange: dateRange,
});

type Params = { params: Promise<{ teamId: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canEmailTeamReports(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const team = await getTeamById((await params).teamId);
    if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });

    let managerEmail = "";
    if (team.managerRepUid) {
      const manager = await getAdminDb().collection("reps").doc(team.managerRepUid).get();
      managerEmail = manager.exists ? String(manager.data()?.email ?? "").trim() : "";
    }
    const recipient = value.data.recipient || managerEmail;
    if (!recipient) return NextResponse.json({ error: "The team manager has no email. Enter a recipient email." }, { status: 400 });

    const queued = await queueTeamReportEmail({
      team,
      recipient,
      cc: value.data.cc,
      subject: value.data.subject,
      message: value.data.message,
      files: value.data.files,
      ranges: { sales: value.data.salesRange, knocks: value.data.knocksRange },
      requestedBy: actor.token.uid,
      metadata: { automated: false },
    });
    return NextResponse.json({ queued: true, ...queued });
  } catch (error) {
    return errorResponse("teams/[teamId]/email", error, "EMAIL_FAILED");
  }
}
