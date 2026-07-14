import "server-only";

import { getStorage } from "firebase-admin/storage";
import * as XLSX from "xlsx";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";
import { parseKnockWorkbook } from "@/src/lib/knocks/parse";
import { buildSourceExportRows, buildSourceWorksheetData } from "@/src/lib/reports/sales-export";
import type { Rep } from "@/src/types/rep";
import type { Team } from "@/src/types/team";

type ExportRange = { start: string; end: string };
type SourceRow = { provider: "ATT" | "T-Fiber"; rawData: Record<string, unknown> };

const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;

export function parseTeamExportRange(searchParams: URLSearchParams): ExportRange | null {
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  return DATE_ID.test(start) && DATE_ID.test(end) && start <= end ? { start, end } : null;
}

export function teamExportSlug(team: Team) {
  return team.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
}

function sourceWorksheet(rows: SourceRow[]) {
  const sourceRows = buildSourceExportRows(rows);
  const data = buildSourceWorksheetData(sourceRows);
  return XLSX.utils.json_to_sheet(data.rows, { header: data.headers });
}

export async function buildTeamSalesExport(team: Team, range: ExportRange) {
  const db = getAdminDb();
  const members = new Set(team.members);
  const orders = (provider: "att" | "tfiber") => db.collection("salesOrders").doc(provider).collection("orders")
    .where("orderDateId", ">=", range.start)
    .where("orderDateId", "<=", range.end)
    .get();
  const [attSnapshot, tfiberSnapshot] = await Promise.all([orders("att"), orders("tfiber")]);

  const rows = (provider: "ATT" | "T-Fiber", documents: typeof attSnapshot.docs): SourceRow[] => documents
    .map((document) => document.data())
    .filter((order) => members.has(String(order.matchedRepUid || "")))
    .map((order) => ({
      provider,
      rawData: order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {},
    }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(rows("ATT", attSnapshot.docs)), "ATT");
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(rows("T-Fiber", tfiberSnapshot.docs)), "T-Fiber");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function uploadTime(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.valueOf();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.valueOf()) ? 0 : parsed.valueOf();
}

export async function buildTeamKnocksExport(team: Team, range: ExportRange) {
  const db = getAdminDb();
  const [runsSnapshot, repsSnapshot] = await Promise.all([
    db.collection("uploadRuns").where("type", "==", "knockImport").get(),
    db.collection("reps").get(),
  ]);
  const reps = repsSnapshot.docs.map((document) => ({ repUid: document.id, ...document.data() }) as Rep);
  const members = new Set(team.members);
  const bucket = getStorage(getAdminApp()).bucket();
  const runs = runsSnapshot.docs
    .map((document) => {
      const data = document.data();
      return { uploadId: document.id, status: String(data.status || ""), storagePath: String(data.storagePath || ""), uploadedAt: data.uploadedAt };
    })
    .filter((run) => run.status === "complete" && run.storagePath)
    .sort((left, right) => uploadTime(left.uploadedAt) - uploadTime(right.uploadedAt) || left.uploadId.localeCompare(right.uploadId));

  const parsedRuns = await Promise.all(runs.map(async (run) => {
    try {
      const [buffer] = await bucket.file(String(run.storagePath)).download();
      return parseKnockWorkbook(buffer, reps);
    } catch {
      return null;
    }
  }));

  // A later source upload replaces that source's earlier rows for every date it contains,
  // mirroring the replacement behavior used by knockDaily during import.
  const currentRowsBySourceDate = new Map<string, NonNullable<(typeof parsedRuns)[number]>["rows"]>();
  for (const parsed of parsedRuns) {
    if (!parsed) continue;
    const byDate = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) {
      const rows = byDate.get(row.activityDateKey) ?? [];
      rows.push(row);
      byDate.set(row.activityDateKey, rows);
    }
    for (const [dateId, rows] of byDate) currentRowsBySourceDate.set(`${parsed.rows[0]?.source ?? "unknown"}:${dateId}`, rows);
  }

  const attRows: SourceRow[] = [];
  const tfiberRows: SourceRow[] = [];
  for (const key of [...currentRowsBySourceDate.keys()].sort()) {
    const dateId = key.slice(key.lastIndexOf(":") + 1);
    if (dateId < range.start || dateId > range.end) continue;
    for (const row of currentRowsBySourceDate.get(key) ?? []) {
      if (!row.repId || !members.has(row.repId)) continue;
      const target = row.provider === "ATT" ? attRows : tfiberRows;
      target.push({ provider: row.provider, rawData: row.raw });
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(attRows), "ATT");
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(tfiberRows), "T-Fiber");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
