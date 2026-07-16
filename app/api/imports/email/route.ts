import { NextResponse } from "next/server";
import { importEmailAttachments } from "@/src/lib/imports/email-import";
import { mailgunSignatureValid, senderAllowed, sharedSecretValid } from "@/src/lib/imports/mailgun-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

function inboundRequestValid(request: Request, form: FormData) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim();
  if (signingKey) {
    return mailgunSignatureValid({
      timestamp: String(form.get("timestamp") ?? "").trim(),
      token: String(form.get("token") ?? "").trim(),
      signature: String(form.get("signature") ?? "").trim(),
    }, signingKey);
  }

  const expected = process.env.REPORTS_INBOUND_SECRET?.trim() ?? "";
  const url = new URL(request.url);
  const provided = request.headers.get("x-reports-inbound-secret")?.trim() || url.searchParams.get("token")?.trim() || "";
  return sharedSecretValid(provided, expected);
}

function attachmentFiles(form: FormData) {
  return [...form.entries()]
    .map(([, value]) => value)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    if (!inboundRequestValid(request, form)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const sender = String(form.get("sender") ?? form.get("from") ?? "").trim();
    if (!senderAllowed(sender, process.env.REPORTS_ALLOWED_SENDERS)) {
      return NextResponse.json({ error: "SENDER_NOT_ALLOWED" }, { status: 403 });
    }

    const files = attachmentFiles(form);
    if (!files.length) return NextResponse.json({ error: "NO_ATTACHMENTS" }, { status: 400 });

    const actorUid = "system:email-import";
    const subject = String(form.get("subject") ?? "").trim();
    const attachments = [];
    for (const file of files) {
      attachments.push({
        fileName: file.name,
        contentType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }
    const { results, ignored } = await importEmailAttachments(attachments, { actorUid, sender, subject, origin: "mailgun-email-webhook" });

    return NextResponse.json({ ok: true, sender, subject, imported: results.length, ignoredAttachments: ignored, results });
  } catch (error) {
    return errorResponse("imports/email", error);
  }
}
