import { endOfMonth, format, isAfter, isBefore, startOfMonth } from "date-fns";
import { isPastDue, normalizeSaleOutcome, type SaleOutcome, type SalesOrderRecord, saleOutcomeLabel } from "./outcomes";

export type SalesMode = "wtd" | "mtd";

export type SalesRepOrder = SalesOrderRecord & {
  customerName: string;
  orderNumber: string;
  productName: string;
  installDateLabel: string;
  estimatedInstallDateLabel: string;
  outcome: SaleOutcome;
  pastDue: boolean;
  daysSinceSale: number | null;
};

export type SalesRepGroup = {
  key: string;
  repUid: string | null;
  rawSalesId?: string;
  displayName: string;
  managerName: string;
  locationName: string;
  programName: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  weeklySalesGoal: number;
  weeklyKnocksGoal: number;
  matchStatus: "matched" | "unmatched";
  total: number;
  installed: number;
  pending: number;
  pastDue: number;
  canceled: number;
  churned: number;
  unknown: number;
  orders: SalesRepOrder[];
  days: number[];
  week: { start: string; end: string };
};

export type SalesDataset = {
  week: { start: string; end: string };
  reps: SalesRepGroup[];
  note?: string;
};

export type RawSalesOrder = SalesOrderRecord & {
  rawData?: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parseDateId(value: string) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function dateIdFrom(value: unknown) {
  const source = text(value);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function daysBetween(start: string, end: string) {
  const a = parseDateId(start);
  const b = parseDateId(end);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.valueOf() - a.valueOf()) / 86400000));
}

function clean(value: unknown) {
  return text(value) || "—";
}

export function extractSalesOrder(order: RawSalesOrder): SalesRepOrder {
  const raw = order.rawData ?? {};
  const customerName = clean([
    raw["Customer Name"],
    raw["Customer / Address"],
    raw["Customer"],
    raw["Account Name"],
    raw["Name"],
  ].find((value) => text(value)));
  const orderNumber = clean([
    raw["Order Number"],
    raw["Order ID"],
    raw["Account Number"],
    raw["Account #"],
    raw["Order #"],
    order.orderUid,
  ].find((value) => text(value)));
  const productName = clean([
    raw["Product"],
    raw["Package"],
    raw["Program"],
    raw["Plan"],
    raw["Service"],
    raw["Services"],
  ].find((value) => text(value)));
  const installDate = clean([
    raw["Installation Date"],
    raw["Install Date"],
    raw["Installed Date"],
    order.installationDateId,
    dateIdFrom(raw["Installation Date"]),
    dateIdFrom(raw["Install Date"]),
  ].find((value) => text(value)));
  const estimatedInstallDate = clean([
    raw["Est. Installation Date"],
    raw["Estimated Installation Date"],
    raw["ETA Installation Date"],
    raw["Install ETA"],
    order.estimatedInstallationDateId,
    dateIdFrom(raw["Est. Installation Date"]),
  ].find((value) => text(value)));
  const outcome = normalizeSaleOutcome(order);
  const saleDate = order.orderDateId;
  return {
    ...order,
    customerName,
    orderNumber,
    productName,
    installDateLabel: installDate,
    estimatedInstallDateLabel: estimatedInstallDate,
    outcome,
    pastDue: isPastDue(order),
    daysSinceSale: saleDate ? daysBetween(saleDate, format(new Date(), "yyyy-MM-dd")) : null,
  };
}

export function calculateRepSummary(records: RawSalesOrder[], mode: SalesMode, base?: Omit<SalesRepGroup, "orders" | "total" | "installed" | "pending" | "pastDue" | "canceled" | "churned" | "unknown" | "days"> & Partial<Pick<SalesRepGroup, "days" | "week">>) {
  const orders = records.map(extractSalesOrder);
  const totals = orders.reduce(
    (acc, order) => {
      acc.total += 1;
      acc[order.outcome === "past_due" ? "pending" : order.outcome] += 1;
      if (order.pastDue) acc.pastDue += 1;
      return acc;
    },
    { total: 0, installed: 0, pending: 0, pastDue: 0, canceled: 0, churned: 0, unknown: 0 } as Record<"total" | "installed" | "pending" | "pastDue" | "canceled" | "churned" | "unknown", number>,
  );
  return {
    ...(base ?? {}),
    total: totals.total,
    installed: totals.installed,
    pending: totals.pending,
    pastDue: totals.pastDue,
    canceled: totals.canceled,
    churned: totals.churned,
    unknown: totals.unknown,
    orders,
    days: base?.days ?? [],
    week: base?.week ?? { start: "", end: "" },
  };
}

export function groupSalesByRep(records: RawSalesOrder[], week: { start: string; end: string }, repsMeta: Array<{
  key: string;
  repUid: string | null;
  displayName: string;
  managerName: string;
  locationName: string;
  programName: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  weeklySalesGoal: number;
  weeklyKnocksGoal: number;
  matchStatus: "matched" | "unmatched";
  dayIndex: (dateId: string) => number;
}>) {
  const map = new Map<string, RawSalesOrder[]>();
  const metaMap = new Map(repsMeta.map((item) => [item.key, item]));
  for (const record of records) {
    const key = record.matchedRepUid ? `rep:${record.matchedRepUid}` : `unmatched:${text(record.rawRepName).toLowerCase()}:${text(record.rawSalesId)}`;
    const list = map.get(key) ?? [];
    list.push(record);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, orders]) => {
    const meta = metaMap.get(key);
    const days = Array.from({ length: 7 }, () => 0);
    for (const order of orders) {
      const index = meta?.dayIndex(order.orderDateId) ?? 0;
      days[Math.max(0, Math.min(6, index))] += 1;
    }
    const summary = calculateRepSummary(orders, "wtd", {
      key,
      repUid: meta?.repUid ?? null,
      displayName: meta?.displayName ?? clean(orders[0]?.rawRepName),
      rawSalesId: orders[0]?.rawSalesId ?? "",
      managerName: meta?.managerName ?? clean(orders[0]?.rawManagerName),
      locationName: meta?.locationName ?? "—",
      programName: meta?.programName ?? clean(orders[0]?.provider),
      vendorType: meta?.vendorType ?? "unassigned",
      weeklySalesGoal: meta?.weeklySalesGoal ?? 0,
      weeklyKnocksGoal: meta?.weeklyKnocksGoal ?? 0,
      matchStatus: meta?.matchStatus ?? (orders[0]?.matchedRepUid ? "matched" : "unmatched"),
      days,
      week,
    });
    return summary;
  }).sort((a, b) => String(a.displayName ?? "").localeCompare(String(b.displayName ?? "")));
}

export function monthLabelFor(date = new Date()) {
  return `${format(date, "MMMM yyyy")} MTD`;
}

export function monthBounds(date = new Date()) {
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export function inDateRange(dateId: string, start: Date, end: Date) {
  const value = parseDateId(dateId);
  if (!value) return false;
  return !isBefore(value, start) && !isAfter(value, end);
}

export { saleOutcomeLabel };
