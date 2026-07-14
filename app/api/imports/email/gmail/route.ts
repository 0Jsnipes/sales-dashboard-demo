import { NextResponse } from "next/server";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { getReportMessage, listReportMessages, markMessageProcessed } from "@/src/lib/gmail/client";
import { importEmailAttachments } from "@/src/lib/imports/email-import";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const messages = await listReportMessages(10);
    const results: Array<Record<string, unknown>> = [];

    for (const item of messages) {
      const message = await getReportMessage(item.id);
      if (!message.attachments.length) {
        await markMessageProcessed(message.id);
        continue;
      }

      const imported = await importEmailAttachments(message.attachments, {
        actorUid: actor.token.uid,
        sender: message.from,
        subject: message.subject,
        origin: "gmail-api",
      });

      await markMessageProcessed(message.id);
      results.push({
        messageId: message.id,
        from: message.from,
        subject: message.subject,
        attachments: imported,
      });
    }

    return NextResponse.json({ ok: true, processedMessages: results.length, results });
  } catch (error) {
    return errorResponse("imports/email/gmail", error);
  }
}
