import { differenceInCalendarDays, parseISO } from "date-fns";
import type { SaleOutcome, SaleOutcomeOptions, SalesOrderRecord } from "@/src/lib/sales/outcomes";
import { isPastDue, isPastDueOlderThan, normalizeSaleOutcome, saleOutcomeLabel } from "@/src/lib/sales/outcomes";
import { formatDate } from "@/src/lib/formatters/date";

export type PerformanceOrder = SalesOrderRecord & {
  orderUid: string;
  id: string;
  providerKey?: string;
  orderId: string;
  provider: string;
  vendorType?: "organic" | "subVendor" | "unassigned";
  repName: string;
  repUid?: string | null;
  managerName?: string;
  locationName?: string;
  customer: string;
  status: string;
  outcome?: SaleOutcome;
  pastDue?: boolean;
  saleCount?: number;
  saleDate?: string;
  estimatedInstallDate?: string;
  daysSinceSale?: number | null;
};

export function outcomeLabel(order: SalesOrderRecord, options?: SaleOutcomeOptions) {
  return saleOutcomeLabel(normalizePerformanceOutcome(order, options));
}

export function outcomeBadgeVariant(outcome: SaleOutcome) {
  switch (outcome) {
    case "installed": return "success" as const;
    case "pending": return "outline" as const;
    case "past_due": return "warning" as const;
    case "preorder": return "info" as const;
    case "canceled": return "danger" as const;
    case "churned": return "secondary" as const;
    default: return "outline" as const;
  }
}

export function calculateInstallRate(total: number, installed: number) {
  return total ? Math.round((installed / total) * 100) : 0;
}

export function calculateCancellationRate(total: number, canceled: number) {
  return total ? Math.round((canceled / total) * 100) : 0;
}

export function normalizePerformanceOutcome(order: SalesOrderRecord, options?: SaleOutcomeOptions) {
  if (isPastDueOlderThan(order, 31, options)) return "canceled" as const;
  if (isPastDue(order, options)) return "past_due" as const;
  return normalizeSaleOutcome(order, options);
}

export function unitsFor(order: PerformanceOrder) {
  return Number(order.saleCount ?? 1) || 1;
}

export function etaDateId(order: PerformanceOrder) {
  return String(order.estimatedInstallationDateId ?? "").trim();
}

export function daysPastDue(order: PerformanceOrder) {
  const eta = etaDateId(order);
  if (!order.pastDue || !eta) return null;
  try {
    return Math.max(0, differenceInCalendarDays(new Date(), parseISO(`${eta}T12:00:00`)));
  } catch {
    return null;
  }
}

export function etaValue(order: PerformanceOrder) {
  const eta = etaDateId(order);
  if (!eta) return "";
  const label = formatDate(eta);
  const pastDue = daysPastDue(order);
  if (!order.pastDue || pastDue == null || pastDue <= 0) return label;
  return `${label} (${pastDue} ${pastDue === 1 ? "day" : "days"})`;
}

export { isPastDue, isPastDueOlderThan, normalizeSaleOutcome };
