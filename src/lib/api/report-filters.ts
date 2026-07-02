import { endOfMonth } from "date-fns";
import { normalizeSaleOutcome, type SalesOrderRecord } from "@/src/lib/sales/outcomes";

export type CommonFilters = {
  from?: string;
  to?: string;
  weekStart?: string;
  month?: string;
  manager?: string;
  location?: string;
  lcp?: string;
  rep?: string;
  repId?: string;
  provider?: string;
  program?: string;
  vendor?: string;
  outcome?: string;
  status?: string;
  source?: string;
  search?: string;
  limit?: number;
};

export function isDateId(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function toDateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateRangeParams(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const weekStart = searchParams.get("weekStart");
  const month = searchParams.get("month");
  if (from && !isDateId(from)) throw new Error("INVALID_FROM_DATE");
  if (to && !isDateId(to)) throw new Error("INVALID_TO_DATE");
  if (weekStart && !isDateId(weekStart)) throw new Error("INVALID_WEEK_START");
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_MONTH");
  if (from && to && from > to) throw new Error("VALID_DATE_RANGE_REQUIRED");
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    return { from: toDateId(first), to: toDateId(endOfMonth(first)), weekStart: undefined, month };
  }
  return { from: from ?? undefined, to: to ?? undefined, weekStart: weekStart ?? undefined, month: undefined };
}

export function parseCommonFilters(searchParams: URLSearchParams): CommonFilters {
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 5000)) throw new Error("INVALID_LIMIT");
  return {
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
    weekStart: searchParams.get("weekStart") || undefined,
    month: searchParams.get("month") || undefined,
    manager: searchParams.get("manager") || undefined,
    location: searchParams.get("location") || undefined,
    lcp: searchParams.get("lcp") || undefined,
    rep: searchParams.get("rep") || undefined,
    repId: searchParams.get("repId") || undefined,
    provider: searchParams.get("provider") || undefined,
    program: searchParams.get("program") || undefined,
    vendor: searchParams.get("vendor") || undefined,
    outcome: searchParams.get("outcome") || undefined,
    status: searchParams.get("status") || undefined,
    source: searchParams.get("source") || undefined,
    search: searchParams.get("search") || undefined,
    limit,
  };
}

export function applyTextSearchFilter<T>(records: T[], search: string | undefined, getText: (record: T) => string) {
  const term = search?.trim().toLowerCase();
  if (!term) return records;
  return records.filter((record) => getText(record).toLowerCase().includes(term));
}

export function getRecordSaleDate(record: SalesOrderRecord) {
  return record.orderDateId || record.installationDateId || record.estimatedInstallationDateId || record.cancellationDateId || "";
}

export function applyOutcomeFilter<T extends SalesOrderRecord>(records: T[], outcome: string | undefined) {
  if (!outcome || outcome === "all") return records;
  return records.filter((record) => normalizeSaleOutcome(record) === outcome);
}
