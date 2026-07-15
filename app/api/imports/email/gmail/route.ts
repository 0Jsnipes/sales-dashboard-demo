import { NextResponse } from "next/server";
import { canImportEmailReports, requireActor } from "@/src/lib/firebase/server-auth";
import { processGmailReportInbox } from "@/src/lib/imports/gmail-automation";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportEmailReports(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    return NextResponse.json(await processGmailReportInbox({ actorUid: actor.token.uid }));
  } catch (error) {
    return errorResponse("imports/email/gmail", error);
  }
}
