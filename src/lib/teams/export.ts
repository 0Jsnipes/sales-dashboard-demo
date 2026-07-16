import "server-only";

import * as XLSX from "xlsx";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { enableWorksheetFilters } from "@/src/lib/exports/worksheet";
import { readKnockExportCacheRows } from "@/src/lib/knocks/export-cache";
import { buildSourceExportRows, buildSourceWorksheetData, EXCEL_DATE_FORMAT } from "@/src/lib/reports/sales-export";
import type { Team } from "@/src/types/team";

type ExportRange = { start: string; end: string };
type SourceRow = { provider: "ATT" | "T-Fiber"; rawData: Record<string, unknown> };
export type TeamExportProvider = "att" | "tfiber";
type TeamSalesExportOptions = { dateOrder?: "source" | "newest-first" };

const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;

export function parseTeamExportRange(searchParams: URLSearchParams): ExportRange | null {
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  return DATE_ID.test(start) && DATE_ID.test(end) && start <= end ? { start, end } : null;
}

export function teamExportSlug(team: Team) {
  return team.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
}

export function sortSalesOrdersNewestFirst<T extends { orderDateId?: unknown }>(orders: T[]) {
  return [...orders].sort((left, right) => String(right.orderDateId ?? "").localeCompare(String(left.orderDateId ?? "")));
}

function sourceWorksheet(rows: SourceRow[]) {
  const sourceRows = buildSourceExportRows(rows);
  const data = buildSourceWorksheetData(sourceRows);
  return enableWorksheetFilters(XLSX.utils.json_to_sheet(data.rows, { header: data.headers, dateNF: EXCEL_DATE_FORMAT }));
}

export async function buildTeamSalesExport(team: Team, range: ExportRange, provider: TeamExportProvider, options: TeamSalesExportOptions = {}) {
  const db = getAdminDb();
  const members = new Set(team.members);
  const snapshot = await db.collection("salesOrders").doc(provider).collection("orders")
    .where("orderDateId", ">=", range.start)
    .where("orderDateId", "<=", range.end)
    .get();
  const providerLabel = provider === "att" ? "ATT" : "T-Fiber";
  const matchingOrders = snapshot.docs
    .map((document) => document.data())
    .filter((order) => members.has(String(order.matchedRepUid || "")));
  const orderedOrders = options.dateOrder === "newest-first" ? sortSalesOrdersNewestFirst(matchingOrders) : matchingOrders;
  const rows: SourceRow[] = orderedOrders
    .map((order) => ({
      provider: providerLabel,
      rawData: order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {},
    }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(rows), providerLabel);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export async function buildTeamKnocksExport(team: Team, range: ExportRange, provider: TeamExportProvider) {
  const members = new Set(team.members);
  const cachedRows = await readKnockExportCacheRows(range.start, range.end, team.members);
  const providerLabel = provider === "att" ? "ATT" : "T-Fiber";
  const matching = cachedRows
    .filter((row) => Boolean(row.repUid && members.has(row.repUid) && row.provider === providerLabel))
    .sort((left, right) => left.activityDateKey.localeCompare(right.activityDateKey) || left.rowIndex - right.rowIndex);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sourceWorksheet(matching.map((row) => ({ provider: row.provider, rawData: row.rawData }))), providerLabel);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
