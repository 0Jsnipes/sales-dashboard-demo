import { isBefore, parseISO, startOfDay } from "date-fns";

export type SaleOutcome = "installed" | "pending" | "past_due" | "canceled" | "churned" | "unknown";

export type SalesOrderRecord = {
  orderUid: string;
  orderDateId: string;
  provider: string;
  accountStatus?: string;
  installationDateId?: string | null;
  estimatedInstallationDateId?: string | null;
  cancellationDateId?: string | null;
  rawData?: Record<string, unknown>;
  rawRepName?: string;
  rawSalesId?: string;
  rawManagerName?: string;
  matchedRepUid?: string | null;
  saleCount?: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function dateIdFromValue(value: unknown) {
  const source = text(value);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function readFirstText(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) return "";
  for (const key of keys) {
    const value = text(raw[key]);
    if (value) return value;
  }
  return "";
}

export function normalizeSaleOutcome(order: SalesOrderRecord): SaleOutcome {
  const raw = order.rawData ?? {};
  const status = [
    order.accountStatus,
    readFirstText(raw, ["Account Status", "Status", "Order Status", "Install Status", "Current Status"]),
  ].map((value) => text(value).toLowerCase()).find(Boolean) ?? "";

  if (status.includes("install") || status.includes("active") || status.includes("complete") || status.includes("completed")) return "installed";
  if (status.includes("cancel")) return "canceled";
  if (status.includes("churn")) return "churned";
  if (status.includes("past due") || status.includes("pastdue") || status.includes("late")) return "past_due";
  if (status.includes("pend") || status.includes("await") || status.includes("scheduled") || status.includes("hold")) return "pending";

  const installDate = order.installationDateId || dateIdFromValue(readFirstText(raw, ["Installation Date", "Install Date", "Installed Date"]));
  if (installDate) return "installed";
  return "unknown";
}

export function isPastDue(order: SalesOrderRecord) {
  const outcome = normalizeSaleOutcome(order);
  if (outcome === "installed" || outcome === "canceled" || outcome === "churned") return false;
  const estimated = order.estimatedInstallationDateId
    || dateIdFromValue(readFirstText(order.rawData, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"]));
  if (!estimated) return outcome === "past_due";
  try {
    return isBefore(parseISO(`${estimated}T12:00:00`), startOfDay(new Date()));
  } catch {
    return false;
  }
}

export function saleOutcomeLabel(outcome: SaleOutcome) {
  switch (outcome) {
    case "installed":
      return "Installed";
    case "pending":
      return "Pending";
    case "past_due":
      return "Past Due";
    case "canceled":
      return "Canceled";
    case "churned":
      return "Churned";
    default:
      return "Unknown";
  }
}
