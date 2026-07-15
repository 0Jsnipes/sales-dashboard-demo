import { NextResponse } from "next/server";
import { canExportTeamReports, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import { rebuildKnockExportCache } from "@/src/lib/knocks/export-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canExportTeamReports(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json(await rebuildKnockExportCache());
  } catch (error) {
    return errorResponse("knocks/export-cache", error, "EXPORT_CACHE_FAILED");
  }
}
