import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { importEmailAttachments } from "@/src/lib/imports/email-import";

export const runtime = "nodejs";

function inboundSecretValid(request: Request) {
  const expected = process.env.REPORTS_INBOUND_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-reports-inbound-secret")?.trim() || url.searchParams.get("token")?.trim() || "";
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

function attachmentFiles(form: FormData) {
  return [...form.entries()]
    .map(([, value]) => value)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request) {
  try {
    if (!inboundSecretValid(request)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData();
    const files = attachmentFiles(form);
    if (!files.length) return NextResponse.json({ error: "NO_ATTACHMENTS" }, { status: 400 });

    const actorUid = "system:email-import";
    const sender = String(form.get("sender") ?? form.get("from") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim();
    const attachments = [];
    for (const file of files) {
      attachments.push({
        fileName: file.name,
        contentType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }
    const results = await importEmailAttachments(attachments, { actorUid, sender, subject, origin: "email-webhook" });

    return NextResponse.json({ ok: true, sender, subject, imported: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
