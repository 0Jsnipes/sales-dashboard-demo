import { NextResponse } from "next/server";
import { errorResponse } from "@/src/lib/api/error-response";
import { processGmailReportInbox } from "@/src/lib/imports/gmail-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (!process.env.GMAIL_REPORTS_QUERY?.trim()) {
      return NextResponse.json({ error: "Set GMAIL_REPORTS_QUERY to a narrow Gmail search for report attachments." }, { status: 503 });
    }
    const maxMessages = Number(process.env.GMAIL_REPORTS_MAX_MESSAGES ?? 10);
    return NextResponse.json(await processGmailReportInbox({ actorUid: "system:gmail-cron", maxMessages }));
  } catch (error) {
    return errorResponse("cron/gmail-reports", error, "GMAIL_AUTOMATION_FAILED");
  }
}
