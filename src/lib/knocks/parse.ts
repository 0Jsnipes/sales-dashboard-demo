import * as XLSX from "xlsx";
import type { Rep } from "@/src/types/rep";
import { getWeekStartKey, parseEasternDispositionTime, parseFlexibleDate, toDateKey, toEasternDateKey } from "./date";
import { normalizeKnockStatus } from "./status";
import { detectKnockSource } from "./source-detection";
import { generateKnockUid } from "./uid";
import type { KnockPreviewSummary, KnockSource, NormalizedKnockRow } from "./types";
import { matchKnockToRep } from "./matching";

type RawRow = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const getHeaders = (rows: RawRow[]) => Object.keys(rows[0] ?? {});
const nonEmpty = (row: RawRow) => Object.values(row).some((value) => String(value ?? "").trim().length > 0);

function normalizeCommon(row: RawRow, source: KnockSource): NormalizedKnockRow | null {
  const repName = source === "companya_activity" ? text(row.Name) : text(row.Rep);
  const rawStatus = source === "companya_activity" ? text(row.Activity) : text(row.Status);
  const rawDate = source === "companya_activity" ? row.Date : row["Disposition Time (Eastern)"];
  const date = source === "companyb" ? parseEasternDispositionTime(rawDate) : parseFlexibleDate(rawDate);
  if (!repName && !rawStatus && !date) return null;
  if (!date) return null;
  // Activity/Company B exports include helper count columns that reflect grouped totals,
  // not per-activity quantities. Each row in these files should count as one knock.
  const quantity = 1;
  const activityDateKey = source === "companyb" ? toEasternDateKey(date) : toDateKey(date);
  const rowBase: NormalizedKnockRow = {
    knockUid: "",
    source,
    provider: source === "companya_activity" ? "Company A" : "Company B",
    program: source === "companya_activity" ? "Company A" : "Company B",
    sourceActivityId: source === "companya_activity" ? text(row.Id) || null : null,
    sourceLeadId: source === "companya_activity" ? text(row["Activity Lead ID"]) || null : text(row["Lead ID"]) || null,
    sourceRepExternalId: source === "companya_activity" ? text(row.Id) || null : text(row.external_id) || null,
    repName: repName || "Unknown",
    repEmail: text(row.Email) || null,
    team: text(row.Team) || null,
    manager: null,
    location: null,
    rawStatus,
    normalizedStatus: normalizeKnockStatus(rawStatus),
    activityDate: date.toISOString(),
    activityDateKey,
    weekStart: getWeekStartKey(`${activityDateKey}T12:00:00`),
    monthKey: activityDateKey.slice(0, 7),
    company: text(row.Company) || null,
    lcp: text(row.LCP) || null,
    address: source === "companya_activity" ? null : { street: text(row.street_1) || null, city: text(row.City) || null, state: text(row.state) || null, zip: text(row.Zip) || null },
    leadName: source === "companya_activity" ? text(row["Lead Name"]) || null : text(row.Company) || null,
    proximity: text(row.Proximity) || null,
    quantity,
    matchStatus: "unmatched",
    raw: row,
  };
  const uid = generateKnockUid(row, source);
  if (!uid) return null;
  rowBase.knockUid = uid;
  return rowBase;
}

export function parseCompanyAActivityKnockRows(rows: RawRow[], reps: Rep[] = []) {
  return buildPreview(rows, "companya_activity", reps);
}

export function parseCompanyBKnockRows(rows: RawRow[], reps: Rep[] = []) {
  return buildPreview(rows, "companyb", reps);
}

function buildPreview(rows: RawRow[], source: KnockSource, reps: Rep[]) {
  const output: NormalizedKnockRow[] = [];
  let skippedRows = 0;
  for (const row of rows) {
    if (!nonEmpty(row)) continue;
    const normalized = normalizeCommon(row, source);
    if (!normalized) {
      skippedRows += 1;
      continue;
    }
    const match = matchKnockToRep(normalized, reps);
    output.push({ ...normalized, repId: match.repId, matchStatus: match.repId ? "matched" : "unmatched", matchMethod: match.method, matchConfidence: match.confidence });
  }
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of output) {
    if (seen.has(row.knockUid)) duplicates += 1;
    seen.add(row.knockUid);
  }
  const dates = output.map((row) => row.activityDateKey).filter(Boolean).sort();
  const uniqueLeads = new Set(output.map((row) => row.sourceLeadId || row.sourceActivityId || row.knockUid)).size;
  const totalKnocks = output.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const summary: KnockPreviewSummary = {
    totalRowsSeen: rows.length,
    validRows: output.length,
    totalKnocks,
    skippedRows,
    matchedRows: output.filter((row) => row.matchStatus === "matched").length,
    unmatchedRows: output.filter((row) => row.matchStatus === "unmatched").length,
    duplicateKnockUidsInFile: duplicates,
    uniqueLeads,
    dateRange: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    statusBreakdown: count(output.map((row) => row.rawStatus)),
    normalizedStatusBreakdown: count(output.map((row) => row.normalizedStatus)),
    sourceBreakdown: count(output.map((row) => row.source)),
    providerBreakdown: count(output.map((row) => row.provider)),
  };
  return { rows: output, summary };
}

function count(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function parseKnockWorkbook(fileBuffer: Buffer, reps: Rep[] = []) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true }).filter(nonEmpty);
  const source = detectKnockSource(getHeaders(rows));
  if (!source) throw new Error("Unable to detect knock source from workbook headers.");
  return source === "companya_activity" ? parseCompanyAActivityKnockRows(rows, reps) : parseCompanyBKnockRows(rows, reps);
}
