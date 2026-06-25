import { isBefore, parseISO, startOfDay } from "date-fns";

export type SaleOutcome = "installed" | "pending" | "past_due" | "preorder" | "canceled" | "churned" | "unknown";

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

export function sanitizeOrderId(value: unknown) {
  return text(value).replace(/[^A-Za-z0-9]/g, "");
}

function dateIdFromValue(value: unknown) {
  const source = text(value);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function actualInstallDateId(order: SalesOrderRecord) {
  const raw = order.rawData ?? {};
  const explicit = dateIdFromValue(readFirstText(raw, ["Installation Date", "Install Date", "Installed Date", "Actual Installation Date", "Actual Install Date"]));
  if (explicit) return explicit;
  if (String(order.provider || "").toLowerCase().includes("t-fiber") || String(order.provider || "").toLowerCase() === "tfiber") return "";
  return dateIdFromValue(order.installationDateId);
}

function accountStatusText(order: SalesOrderRecord) {
  const raw = order.rawData ?? {};
  return [
    order.accountStatus,
    readFirstText(raw, ["Account Status", "Status", "Order Status", "Install Status", "Installation Status", "Current Status"]),
  ].map((value) => text(value).toLowerCase()).find(Boolean) ?? "";
}

function isPreorderStatus(order: SalesOrderRecord, status = accountStatusText(order)) {
  const raw = order.rawData ?? {};
  if (/pre[\s-]?order/.test(status)) return true;

  const likelyFields = ["Account Status", "Status", "Order Status", "Install Status", "Installation Status", "Current Status", "Order Type", "Sale Type", "Sales Type", "Type", "Category", "Stage", "Phase", "Preorder", "Pre-Order", "Pre Order"];
  if (likelyFields.some((key) => /pre[\s-]?order/.test(text(raw[key]).toLowerCase()))) return true;

  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = text(value).toLowerCase();
    if (normalizedKey.includes("preorder")) {
      if (normalizedValue && !["0", "false", "no", "n", "off"].includes(normalizedValue)) return true;
    }
    if (!/(status|type|stage|phase|category|order)/.test(normalizedKey)) continue;
    if (/pre[\s-]?order/.test(normalizedValue)) return true;
  }

  return false;
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
  const status = accountStatusText(order);

  if (status.includes("cancel")) return "canceled";
  if (status.includes("churn")) return "churned";
  if (isPreorderStatus(order, status)) return "preorder";
  if (status.includes("past due") || status.includes("pastdue") || status.includes("late")) return "past_due";
  if (status.includes("pend") || status.includes("await") || status.includes("scheduled") || status.includes("hold")) return "pending";
  if (status.includes("install") || status.includes("active") || status.includes("complete") || status.includes("completed")) return "installed";

  const installDate = actualInstallDateId(order);
  if (installDate) return "installed";
  return "unknown";
}

export function isPastDue(order: SalesOrderRecord) {
  const status = accountStatusText(order);
  if (status.includes("cancel") || status.includes("churn") || isPreorderStatus(order, status)) return false;

  const estimated = order.estimatedInstallationDateId
    || dateIdFromValue(readFirstText(order.rawData, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"]));
  if (!estimated) return status.includes("past due") || status.includes("pastdue") || status.includes("late");
  const actualInstall = actualInstallDateId(order);
  if (actualInstall) return false;
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
    case "preorder":
      return "Preorder";
    case "canceled":
      return "Canceled";
    case "churned":
      return "Churned";
    default:
      return "Unknown";
  }
}
