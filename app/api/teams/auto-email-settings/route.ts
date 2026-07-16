import { NextResponse } from "next/server";
import { errorResponse } from "@/src/lib/api/error-response";
import { canManageTeamAutoEmails, requireActor } from "@/src/lib/firebase/server-auth";
import { teamAutoEmailSettingsSchema } from "@/src/lib/teams/auto-email-config";
import { getTeamAutoEmailSettings, saveTeamAutoEmailSettings } from "@/src/lib/teams/auto-email-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ settings: await getTeamAutoEmailSettings() });
  } catch (error) {
    return errorResponse("teams/auto-email-settings", error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageTeamAutoEmails(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const parsed = teamAutoEmailSettingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const settings = await saveTeamAutoEmailSettings(parsed.data, actor.token.uid);
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse("teams/auto-email-settings", error);
  }
}
