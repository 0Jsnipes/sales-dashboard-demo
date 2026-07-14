import "server-only";

import * as XLSX from "xlsx";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { readKnockExportCacheRows } from "@/src/lib/knocks/export-cache";
import { buildSourceExportRows, buildSourceWorksheetData } from "@/src/lib/reports/sales-export";
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

export async function buildTeamKnocksExport(team: Team, range: ExportRange) {
  const members = new Set(team.members);
  const cachedRows = await readKnockExportCacheRows(range.start, range.end, team.members);
  const matching = cachedRows
    .filter((row) => Boolean(row.repUid && members.has(row.repUid)))
    .sort((left, right) => left.activityDateKey.localeCompare(right.activityDateKey) || left.rowIndex - right.rowIndex);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(matching.filter((row) => row.provider === "ATT").map((row) => ({ provider: row.provider, rawData: row.rawData }))), "ATT");
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(matching.filter((row) => row.provider === "T-Fiber").map((row) => ({ provider: row.provider, rawData: row.rawData }))), "T-Fiber");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
