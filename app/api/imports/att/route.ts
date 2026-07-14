import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";
import { importATTRows, parseATTReport } from "@/src/lib/imports/att";
import { expectedImportFileLabel, validateImportFileName } from "@/src/lib/imports/file-conventions";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (!/\.csv$/i.test(file.name)) return NextResponse.json({ error: "ATT imports must be .csv files." }, { status: 400 });
    if (!validateImportFileName("attSales", file.name)) return NextResponse.json({ error: `ATT sales files must follow the ${expectedImportFileLabel("attSales")} naming format.` }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File exceeds the 20 MB upload limit." }, { status: 400 });
    const uploadId = randomUUID(); const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `imports/att/${uploadId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await getStorage(getAdminApp()).bucket().file(storagePath).save(buffer, { contentType: file.type || "text/csv", metadata: { metadata: { uploadId, uploadedBy: actor.token.uid } } });
    await getAdminDb().collection("uploadRuns").doc(uploadId).set({ uploadId, type: "attSales", fileName: file.name, storagePath, uploadedBy: actor.token.uid, uploadedAt: new Date(), status: "pending" });
    const summary = await importATTRows({ rows: parseATTReport(buffer), uploadId, actorUid: actor.token.uid, fileName: file.name, storagePath });
    return NextResponse.json({ uploadId, storagePath, summary }, { status: 201 });
  } catch (error) {
    return errorResponse("imports/att", error, "UPLOAD_FAILED");
  }
}
