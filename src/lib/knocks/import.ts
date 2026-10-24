import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Rep } from "@/src/types/rep";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";
import { reactivateInactiveRepsForMatchedSales } from "@/src/lib/reps/lifecycle";
import { detectKnockSource } from "@/src/lib/knocks/source-detection";
import { parseCompanyASalesRabbitKnockRows, parseCompanyBKnockRows } from "@/src/lib/knocks/parse";
import { normalizeRepName } from "@/src/lib/knocks/matching";
import { expectedKnockImportFileLabel, validateKnockImportFileName } from "@/src/lib/imports/file-conventions";
import type { KnockSource } from "@/src/lib/knocks/types";
import { replaceKnockExportCacheRows } from "@/src/lib/knocks/export-cache";

type KnockImportOptions = {
  actorUid: string;
  fileName: string;
  sourceOverride?: string;
  contentType?: string;
  metadata?: Record<string, string>;
};

export async function importKnockWorkbook(buffer: Buffer, options: KnockImportOptions) {
  const sourceOverride = String(options.sourceOverride ?? "auto").trim();
  const uploadId = randomUUID();
  const storagePath = `imports/knocks/${uploadId}/${options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await getStorage(getAdminApp()).bucket().file(storagePath).save(buffer, {
    contentType: options.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    metadata: { metadata: { uploadId, uploadedBy: options.actorUid, ...(options.metadata ?? {}) } },
  });

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");

  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));

  const source = (sourceOverride === "auto" || !sourceOverride ? detectKnockSource(Object.keys(rows[0] ?? {})) : sourceOverride) as KnockSource | null;
  if (!source) throw new Error("Unable to detect knock source from workbook headers.");
  if (!validateKnockImportFileName(source, options.fileName)) {
    throw new Error(`Knock files for ${source === "companya_salesrabbit" ? "Company A" : "Company B"} must follow the ${expectedKnockImportFileLabel(source)} naming format.`);
  }

  const repsSnapshot = await getAdminDb().collection("reps").get();
  const reps = repsSnapshot.docs.map((document) => document.data() as Rep);
  const parsed = source === "companya_salesrabbit" ? parseCompanyASalesRabbitKnockRows(rows, reps) : parseCompanyBKnockRows(rows, reps);

  const db = getAdminDb();
  const knockDaily = db.collection("knockDaily");
  const repMap = new Map(reps.map((rep) => [rep.repUid, rep]));
  const inactiveRepUids = new Set(reps.filter((rep) => rep.status === "inactive").map((rep) => rep.repUid));
  const dayTotals = new Map<string, Map<string, { knocks: number; companyAKnocks: number; companyBKnocks: number; source: string; rawRepName: string; rawSalesId: string; managerName: string; locationName: string; lcps: Set<string> }>>();

  for (const row of parsed.rows) {
    const day = row.activityDateKey;
    const repUid = row.repId ?? `unmatched:${normalizeRepName(row.repName)}`;
    const rep = row.repId ? repMap.get(row.repId) : undefined;
    const byRep = dayTotals.get(day) ?? new Map();
    const current = byRep.get(repUid) ?? {
      knocks: 0,
      companyAKnocks: 0,
      companyBKnocks: 0,
      source,
      rawRepName: row.repName,
      rawSalesId: row.sourceRepExternalId ?? "",
      managerName: rep?.managerName ?? "",
      locationName: rep?.locationName ?? "",
      lcps: new Set<string>(),
    };
    const count = Number(row.quantity || 1);
    current.knocks += count;
    if (row.provider === "Company A") current.companyAKnocks += count;
    if (row.provider === "Company B") current.companyBKnocks += count;
    if (row.provider === "Company B" && row.lcp) current.lcps.add(String(row.lcp).trim());
    if (!rep && row.repName && row.repName.length < current.rawRepName.length) current.rawRepName = row.repName;
    byRep.set(repUid, current);
    dayTotals.set(day, byRep);
  }

  const existingKnockCountsByRepDay = new Map<string, number>();
  for (const day of dayTotals.keys()) {
    const snapshot = await knockDaily.doc(day).collection("reps").get();
    for (const document of snapshot.docs) {
      const repUid = String(document.id || "").trim();
      if (!repUid || !inactiveRepUids.has(repUid)) continue;
      const data = document.data();
      existingKnockCountsByRepDay.set(`${repUid}::${day}`, Number(data.knocks ?? data.count ?? 0));
    }
  }

  const newlyActiveKnockRepUids = new Set<string>();
  for (const [day, repsForDay] of dayTotals.entries()) {
    const existingSnapshot = await knockDaily.doc(day).collection("reps").get();
    const existingByRepUid = new Map(existingSnapshot.docs.map((document) => [document.id, document]));
    const repUidsForDay = new Set<string>([...existingByRepUid.keys(), ...repsForDay.keys()]);
    const batch = db.batch();

    for (const repUid of repUidsForDay) {
      const data = repsForDay.get(repUid) ?? {
        knocks: 0,
        companyAKnocks: 0,
        companyBKnocks: 0,
        source,
        rawRepName: "",
        rawSalesId: "",
        managerName: "",
        locationName: "",
        lcps: new Set<string>(),
      };
      const existing = existingByRepUid.get(repUid)?.data() as Record<string, unknown> | undefined;
      const nextCompanyAKnocks = source === "companya_salesrabbit" ? Number(data.companyAKnocks || 0) : Number(existing?.companyAKnocks ?? 0);
      const nextCompanyBKnocks = source === "companyb" ? Number(data.companyBKnocks || 0) : Number(existing?.companyBKnocks ?? 0);
      const nextKnocks = nextCompanyAKnocks + nextCompanyBKnocks;

      if (inactiveRepUids.has(repUid) && nextKnocks > 0) {
        const repDayKey = `${repUid}::${day}`;
        const existingCount = existingKnockCountsByRepDay.get(repDayKey) ?? 0;
        if (existingCount <= 0 && Number(data.knocks || 0) > 0) {
          newlyActiveKnockRepUids.add(repUid);
          existingKnockCountsByRepDay.set(repDayKey, nextKnocks);
        }
      }

      const ref = knockDaily.doc(day).collection("reps").doc(repUid);
      const rep = repMap.get(repUid);
      const nextLcps = source === "companyb"
        ? Array.from(data.lcps)
        : Array.isArray(existing?.lcps)
          ? existing.lcps.map((value) => String(value).trim()).filter(Boolean)
          : [];

      const payload: Record<string, unknown> = {
        repUid,
        displayName: rep?.displayName ?? String(existing?.displayName || data.rawRepName || repUid),
        rawRepName: data.rawRepName || String(existing?.rawRepName || ""),
        rawSalesId: data.rawSalesId || String(existing?.rawSalesId || ""),
        source,
        sourceUploadId: uploadId,
        managerName: rep?.managerName ?? data.managerName ?? String(existing?.managerName || ""),
        teamId: rep?.teamId ?? existing?.teamId ?? null,
        locationName: rep?.locationName ?? data.locationName ?? String(existing?.locationName || ""),
        companyAKnocks: nextCompanyAKnocks,
        companyBKnocks: nextCompanyBKnocks,
        knocks: nextKnocks,
        count: nextKnocks,
        lcps: nextLcps,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!existing) payload.createdAt = FieldValue.serverTimestamp();
      batch.set(ref, payload, { merge: true });
    }

    await batch.commit();
  }

  const repsReactivated = await reactivateInactiveRepsForMatchedSales(newlyActiveKnockRepUids, db, "system:matched-knock-import");
  await replaceKnockExportCacheRows(parsed.rows, uploadId, db);
  await db.collection("uploadRuns").doc(uploadId).set({
    uploadId,
    type: "knockImport",
    fileName: options.fileName,
    storagePath,
    uploadedBy: options.actorUid,
    uploadedAt: FieldValue.serverTimestamp(),
    rowsRead: parsed.summary.totalRowsSeen,
    rowsValid: parsed.summary.validRows,
    rowsSkipped: parsed.summary.skippedRows,
    rowsMatched: parsed.summary.matchedRows,
    rowsUnmatched: parsed.summary.unmatchedRows,
    status: "complete",
    summary: { source, knockCount: parsed.summary.totalKnocks, repsReactivated },
  }, { merge: true });

  return { ok: true, uploadId, storagePath, source, summary: { ...parsed.summary, repsReactivated } };
}
