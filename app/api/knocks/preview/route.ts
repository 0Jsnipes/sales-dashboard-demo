import { NextResponse } from "next/server";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { detectKnockSource } from "@/src/lib/knocks/source-detection";
import { parseCompanyAActivityKnockRows, parseCompanyBKnockRows } from "@/src/lib/knocks/parse";
import { expectedKnockImportFileLabel, validateKnockImportFileName } from "@/src/lib/imports/file-conventions";
import * as XLSX from "xlsx";
import type { Rep } from "@/src/types/rep";
import type { KnockSource } from "@/src/lib/knocks/types";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    const sourceOverride = String(form.get("source") ?? "auto").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File exceeds the 20 MB upload limit." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const repsSnapshot = await getAdminDb().collection("reps").get();
    const reps = repsSnapshot.docs.map((document) => document.data() as Rep);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return NextResponse.json({ error: "The workbook does not contain a worksheet." }, { status: 400 });
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true }).filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));
    const detected = (sourceOverride === "auto" || !sourceOverride ? detectKnockSource(Object.keys(rawRows[0] ?? {})) : sourceOverride) as KnockSource | null;
    if (!detected) return NextResponse.json({ error: "Unable to detect knock source from workbook headers." }, { status: 400 });
    if (!validateKnockImportFileName(detected, file.name)) return NextResponse.json({ error: `Knock files for ${detected === "companya_activity" ? "Company A" : "Company B"} must follow the ${expectedKnockImportFileLabel(detected)} naming format.` }, { status: 400 });
    const parsed = detected === "companya_activity" ? parseCompanyAActivityKnockRows(rawRows, reps) : parseCompanyBKnockRows(rawRows, reps);
    return NextResponse.json({
      ok: true,
      source: detected,
      provider: detected === "companya_activity" ? "Company A" : "Company B",
      program: detected === "companya_activity" ? "Company A" : "Company B",
      fileName: file.name,
      summary: parsed.summary,
      matchedPreview: parsed.rows.filter((row) => row.matchStatus === "matched").slice(0, 50),
      unmatchedPreview: parsed.rows.filter((row) => row.matchStatus === "unmatched").slice(0, 50),
      warnings: [],
      errors: [],
    });
  } catch (error) {
    return errorResponse("knocks/preview", error);
  }
}
