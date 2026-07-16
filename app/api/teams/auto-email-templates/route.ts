import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageTeamAutoEmails, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import { teamAutoEmailTemplateInputSchema } from "@/src/lib/teams/auto-email-config";
import { createTeamAutoEmailTemplate, deleteTeamAutoEmailTemplate, getTeamAutoEmailTemplates } from "@/src/lib/teams/auto-email-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ templates: await getTeamAutoEmailTemplates() });
  } catch (error) {
    return errorResponse("teams/auto-email-templates", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const parsed = teamAutoEmailTemplateInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json({ template: await createTeamAutoEmailTemplate(parsed.data, actor.token.uid) }, { status: 201 });
  } catch (error) {
    return errorResponse("teams/auto-email-templates", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const parsed = z.object({ templateId: z.string().trim().min(1).max(100) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    await deleteTeamAutoEmailTemplate(parsed.data.templateId);
    return NextResponse.json({ deleted: parsed.data.templateId });
  } catch (error) {
    return errorResponse("teams/auto-email-templates", error);
  }
}
