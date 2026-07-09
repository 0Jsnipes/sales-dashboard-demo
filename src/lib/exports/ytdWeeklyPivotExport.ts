import * as XLSX from "xlsx";
import { toDateId } from "@/src/lib/date/week";

export type YtdPivotProvider = "ATT" | "T-Fiber";

export type YtdPivotInputRow = {
  orderDateId?: string;
  provider?: string;
  providerKey?: string;
  representative?: string;
  repName?: string;
  rawRepName?: string;
  location?: string;
  locationName?: string;
  rawData?: Record<string, unknown>;
  source?: string;
  originalSheet?: string;
  originalRowNumber?: number;
};

export type NormalizedYtdPivotRow = {
  provider: YtdPivotProvider;
  source: string;
  repName: string;
  location: string;
  saleDate: string;
  weekNumber: number;
  weekLabel: string;
  dateRange: string;
  originalSheet: string;
  originalRowNumber: number;
};

const DATE_CANDIDATES = [
  "Date",
  "Sale Date",
  "Order Date",
  "Created Date",
  "Submitted Date",
  "Submission Date",
  "Completed Date",
  "Account Created",
  "Created",
];

const REP_CANDIDATES = [
  "Rep",
  "Sales Rep",
  "Salesperson",
  "Agent",
  "Agent Name",
  "Name",
  "Employee",
  "Employee Name",
];

const LOCATION_CANDIDATES = [
  "Location",
  "Market",
  "Territory",
  "City",
  "State",
  "Area",
];

const PROVIDER_CANDIDATES = [
  "Provider",
  "Program",
  "Vendor",
  "Service",
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function detectColumn(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeKey(header) }));
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    const exact = normalizedHeaders.find((header) => header.normalized === normalizedCandidate);
    if (exact) return exact.header;
  }
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    const partial = normalizedHeaders.find((header) => header.normalized.includes(normalizedCandidate));
    if (partial) return partial.header;
  }
  return null;
}

export function parseExcelDate(value: unknown) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const wholeDays = Math.floor(value);
    const millis = Math.round((value - wholeDays) * 86_400_000);
    const date = new Date(Date.UTC(1899, 11, 30 + wholeDays, 0, 0, 0, millis));
    return Number.isNaN(date.valueOf()) ? null : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (typeof value === "string") {
    const source = value.trim();
    if (!source) return null;
    const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const slash = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
      const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
      return new Date(year, Number(slash[1]) - 1, Number(slash[2]));
    }
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.valueOf())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

function formatDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

export function getYtdWeekInfo(date: Date, selectedYear: number) {
  const start = new Date(selectedYear, 0, 1);
  const cleanDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (cleanDate.getFullYear() !== selectedYear) return null;

  const diffDays = Math.floor((cleanDate.getTime() - start.getTime()) / 86_400_000);
  const weekNumber = Math.floor(diffDays / 7) + 1;

  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (weekNumber - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return {
    weekNumber,
    weekLabel: `Week ${weekNumber}`,
    dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
    weekStart,
    weekEnd,
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function detectValue(rawData: Record<string, unknown> | undefined, candidates: string[]) {
  if (!rawData) return "";
  const header = detectColumn(Object.keys(rawData), candidates);
  return header ? text(rawData[header]) : "";
}

function normalizeProvider(value: unknown, originalSheet?: string) {
  const sources = [text(value), text(originalSheet)].filter(Boolean).map((item) => item.toLowerCase());
  if (sources.some((item) => item === "att" || item === "at&t" || item === "sales att")) return "ATT" as const;
  if (sources.some((item) => item === "t-fiber" || item === "tfiber" || item === "t fiber" || item === "t-mobile fiber" || item === "tmobile fiber")) return "T-Fiber" as const;
  return null;
}

type NormalizeResult = {
  attRows: NormalizedYtdPivotRow[];
  tfiberRows: NormalizedYtdPivotRow[];
  skippedRows: number;
  firstDateFound: string;
  lastDateFound: string;
  totalWeeks: number;
};

export function normalizeSalesRows(rows: YtdPivotInputRow[], selectedYear: number): NormalizeResult {
  const normalized: NormalizedYtdPivotRow[] = [];
  let skippedRows = 0;
  let firstDateFound = "";
  let lastDateFound = "";

  rows.forEach((row, index) => {
    const rawData = row.rawData && typeof row.rawData === "object" ? row.rawData : undefined;
    const saleDate = parseExcelDate(row.orderDateId ?? detectValue(rawData, DATE_CANDIDATES));
    if (!saleDate) {
      skippedRows += 1;
      return;
    }

    const week = getYtdWeekInfo(saleDate, selectedYear);
    if (!week) return;

    const provider = normalizeProvider(
      row.provider ?? row.providerKey ?? detectValue(rawData, PROVIDER_CANDIDATES),
      row.originalSheet,
    );
    if (!provider) return;

    const repName = text(row.representative ?? row.repName ?? row.rawRepName ?? detectValue(rawData, REP_CANDIDATES)) || "Unknown rep";
    const location = text(row.location ?? row.locationName ?? detectValue(rawData, LOCATION_CANDIDATES));
    const saleDateId = toDateId(saleDate);

    if (!firstDateFound || saleDateId < firstDateFound) firstDateFound = saleDateId;
    if (!lastDateFound || saleDateId > lastDateFound) lastDateFound = saleDateId;

    normalized.push({
      provider,
      source: text(row.source) || "App Data",
      repName,
      location,
      saleDate: formatDate(saleDate),
      weekNumber: week.weekNumber,
      weekLabel: week.weekLabel,
      dateRange: week.dateRange,
      originalSheet: text(row.originalSheet) || provider,
      originalRowNumber: row.originalRowNumber ?? index + 1,
    });
  });

  const attRows = normalized.filter((row) => row.provider === "ATT");
  const tfiberRows = normalized.filter((row) => row.provider === "T-Fiber");
  const maxWeekFromRows = normalized.reduce((max, row) => Math.max(max, row.weekNumber), 0);
  const todayWeek = getYtdWeekInfo(new Date(), selectedYear)?.weekNumber ?? 0;
  const yearEndWeek = getYtdWeekInfo(new Date(selectedYear, 11, 31), selectedYear)?.weekNumber ?? 1;
  const totalWeeks = selectedYear === new Date().getFullYear()
    ? Math.max(maxWeekFromRows, todayWeek, 1)
    : Math.max(maxWeekFromRows, yearEndWeek, 1);

  return { attRows, tfiberRows, skippedRows, firstDateFound, lastDateFound, totalWeeks };
}

export function buildWeeklySummary(attRows: NormalizedYtdPivotRow[], tfiberRows: NormalizedYtdPivotRow[], selectedYear: number, totalWeeks: number) {
  const rows = Array.from({ length: totalWeeks }, (_, index) => {
    const weekNumber = index + 1;
    const weekInfo = getYtdWeekInfo(new Date(selectedYear, 0, 1 + index * 7), selectedYear);
    const attSales = attRows.filter((row) => row.weekNumber === weekNumber).length;
    const tfiberSales = tfiberRows.filter((row) => row.weekNumber === weekNumber).length;
    return {
      Week: `Week ${weekNumber}`,
      "Date Range": weekInfo?.dateRange ?? "",
      "ATT Sales": attSales,
      "T-Fiber Sales": tfiberSales,
      "Total Sales": attSales + tfiberSales,
    };
  });

  rows.push({
    Week: "Total",
    "Date Range": "",
    "ATT Sales": attRows.length,
    "T-Fiber Sales": tfiberRows.length,
    "Total Sales": attRows.length + tfiberRows.length,
  });

  return rows;
}

export function buildRepPivot(rows: NormalizedYtdPivotRow[], selectedYear: number, totalWeeks: number) {
  if (!rows.length) {
    return [{ "Rep Name": "No rows", Location: "", Total: 0 }];
  }

  const grouped = new Map<string, { repName: string; location: string; counts: Map<number, number> }>();
  for (const row of rows) {
    const key = `${row.repName}\u0000${row.location}`;
    const current = grouped.get(key) ?? { repName: row.repName, location: row.location, counts: new Map<number, number>() };
    current.counts.set(row.weekNumber, (current.counts.get(row.weekNumber) ?? 0) + 1);
    grouped.set(key, current);
  }

  const pivotRows = [...grouped.values()]
    .sort((a, b) => a.repName.localeCompare(b.repName) || a.location.localeCompare(b.location))
    .map((row) => {
      const pivot: Record<string, unknown> = {
        "Rep Name": row.repName,
        Location: row.location,
      };
      let total = 0;
      for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
        const value = row.counts.get(weekNumber) ?? 0;
        pivot[`Week ${weekNumber}`] = value;
        total += value;
      }
      pivot.Total = total;
      return pivot;
    });

  const totals: Record<string, unknown> = { "Rep Name": "Total", Location: "" };
  let grandTotal = 0;
  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const weekTotal = rows.filter((row) => row.weekNumber === weekNumber).length;
    totals[`Week ${weekNumber}`] = weekTotal;
    grandTotal += weekTotal;
  }
  totals.Total = grandTotal;
  pivotRows.push(totals);
  return pivotRows;
}

function buildNormalizedSheetRows(rows: NormalizedYtdPivotRow[]) {
  if (!rows.length) {
    return [{
      Source: "No rows",
      "Rep Name": "",
      Location: "",
      "Sale Date": "",
      "Week Number": "",
      "Week Label": "",
      "Date Range": "",
      "Original Sheet": "",
      "Original Row Number": "",
    }];
  }

  return rows.map((row) => ({
    Source: row.source,
    "Rep Name": row.repName,
    Location: row.location,
    "Sale Date": row.saleDate,
    "Week Number": row.weekNumber,
    "Week Label": row.weekLabel,
    "Date Range": row.dateRange,
    "Original Sheet": row.originalSheet,
    "Original Row Number": row.originalRowNumber,
  }));
}

function autoSizeColumns(rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : ["Message"];
  return headers.map((header) => {
    const maxCellLength = Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? "").length),
    );
    return { wch: Math.min(Math.max(maxCellLength + 2, 12), 40) };
  });
}

function buildWorksheet(rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = autoSizeColumns(rows);
  (worksheet as Record<string, unknown>)["!freeze"] = { xSplit: 0, ySplit: 1 };
  return worksheet;
}

export function writeWorkbook(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, buildWorksheet(sheet.rows), sheet.name.slice(0, 31) || "Sheet");
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildRunNotesRows(options: {
  generatedAt: Date;
  selectedYear: number;
  attRows: NormalizedYtdPivotRow[];
  tfiberRows: NormalizedYtdPivotRow[];
  skippedRows: number;
  firstDateFound: string;
  lastDateFound: string;
}) {
  return [
    { Note: "Generated at", Value: options.generatedAt.toISOString() },
    { Note: "Selected year", Value: options.selectedYear },
    { Note: "Week logic", Value: "Jan 1 based 7-day blocks" },
    { Note: "ATT total sales", Value: options.attRows.length },
    { Note: "T-Fiber total sales", Value: options.tfiberRows.length },
    { Note: "Combined total sales", Value: options.attRows.length + options.tfiberRows.length },
    { Note: "Date range found", Value: options.firstDateFound && options.lastDateFound ? `${options.firstDateFound} to ${options.lastDateFound}` : "No valid sales found" },
    { Note: "Skipped rows due to missing/invalid date", Value: options.skippedRows },
  ];
}

export function buildYtdWeeklySalesPivotWorkbook(options: {
  rows: YtdPivotInputRow[];
  selectedYear: number;
  fileNamePrefix?: string;
}) {
  const generatedAt = new Date();
  const normalized = normalizeSalesRows(options.rows, options.selectedYear);
  const sheets = [
    { name: "Weekly Summary", rows: buildWeeklySummary(normalized.attRows, normalized.tfiberRows, options.selectedYear, normalized.totalWeeks) },
    { name: "ATT Weekly Pivot", rows: buildRepPivot(normalized.attRows, options.selectedYear, normalized.totalWeeks) },
    { name: "T-Fiber Weekly Pivot", rows: buildRepPivot(normalized.tfiberRows, options.selectedYear, normalized.totalWeeks) },
    { name: "Normalized ATT", rows: buildNormalizedSheetRows(normalized.attRows) },
    { name: "Normalized T-Fiber", rows: buildNormalizedSheetRows(normalized.tfiberRows) },
    {
      name: "Run Notes",
      rows: buildRunNotesRows({
        generatedAt,
        selectedYear: options.selectedYear,
        attRows: normalized.attRows,
        tfiberRows: normalized.tfiberRows,
        skippedRows: normalized.skippedRows,
        firstDateFound: normalized.firstDateFound,
        lastDateFound: normalized.lastDateFound,
      }),
    },
  ];

  const fileName = `YTD_Weekly_Sales_Pivot_${text(options.fileNamePrefix) || "Dashboard"}_${toDateId(generatedAt)}.xlsx`;

  return {
    buffer: writeWorkbook(sheets),
    fileName,
  };
}
