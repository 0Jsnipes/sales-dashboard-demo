import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { importCompanyARows, parseCompanyAReport } from "@/src/lib/imports/companya";
import { expectedImportFileLabel, validateImportFileName } from "@/src/lib/imports/file-conventions";
import { errorResponse } from "@/src/lib/api/error-response";
import { safelyQueueAutomaticTeamReports } from "@/src/lib/teams/auto-email-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (!/\.csv$/i.test(file.name)) return NextResponse.json({ error: "Company A imports must be .csv files." }, { status: 400 });
    if (!validateImportFileName("companyASales", file.name)) return NextResponse.json({ error: `Company A sales files must follow the ${expectedImportFileLabel("companyASales")} naming format.` }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File exceeds the 20 MB upload limit." }, { status: 400 });
    const uploadId = randomUUID(); const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `imports/companya/${uploadId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await getAdminDb().collection("uploadRuns").doc(uploadId).set({ uploadId, type: "companyASales", fileName: file.name, storagePath, uploadedBy: actor.token.uid, uploadedAt: new Date(), status: "pending" });
    const summary = await importCompanyARows({ rows: parseCompanyAReport(buffer), uploadId, actorUid: actor.token.uid, fileName: file.name, storagePath });
    const autoEmails = await safelyQueueAutomaticTeamReports({ trigger: "companya-sales", uploadId, actorUid: actor.token.uid });
    return NextResponse.json({ uploadId, storagePath, summary, autoEmails }, { status: 201 });
  } catch (error) {
    return errorResponse("imports/companya", error, "UPLOAD_FAILED");
  }
}
