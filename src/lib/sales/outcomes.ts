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

export type SaleOutcomeOptions = {
  /**
   * Date used when deciding whether an estimated install is past due.
   * For T-Fiber reports, pass the report-as-of date so the dashboard does not
   * mark orders past due before the source export has had a chance to update.
   */
  asOfDate?: Date | string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedText(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
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

function providerKey(value: unknown) {
  const source = normalizedText(value).replace(/[^a-z]/g, "");
  if (source === "tfiber" || source.includes("tfiber")) return "tfiber";
  if (source === "att" || source.includes("att")) return "att";
  if (source === "frontier" || source.includes("frontier")) return "frontier";
  return source || "manual";
}

function isTFiberOrder(order: SalesOrderRecord) {
  return providerKey(order.provider) === "tfiber";
}

function actualInstallDateId(order: SalesOrderRecord) {
  const raw = order.rawData ?? {};
  const explicit = dateIdFromValue(readFirstText(raw, ["Activation Date", "Installation Date", "Install Date", "Installed Date", "Actual Installation Date", "Actual Install Date"]));
  if (explicit) return explicit;

  // T-Fiber's exported "Est. Installation Date" is not proof of an install.
  // Only Activation Date / a true actual install date should count as installed.
  if (isTFiberOrder(order)) return "";

  return dateIdFromValue(order.installationDateId);
}

function accountStatusText(order: SalesOrderRecord) {
  const raw = order.rawData ?? {};
  return [
    order.accountStatus,
    readFirstText(raw, ["Account Status", "Status", "Order Status", "Install Status", "Installation Status", "Current Status"]),
  ].map((value) => normalizedText(value)).find(Boolean) ?? "";
}

function isPreorderStatus(order: SalesOrderRecord, status = accountStatusText(order)) {
  const raw = order.rawData ?? {};
  if (/pre[\s-]?order/.test(status)) return true;

  const likelyFields = ["Account Status", "Status", "Order Status", "Install Status", "Installation Status", "Current Status", "Order Type", "Sale Type", "Sales Type", "Type", "Category", "Stage", "Phase", "Preorder", "Pre-Order", "Pre Order"];
  if (likelyFields.some((key) => /pre[\s-]?order/.test(normalizedText(raw[key])))) return true;

  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = normalizedText(value);
    if (normalizedKey.includes("preorder")) {
      if (normalizedValue && !["0", "false", "no", "n", "off"].includes(normalizedValue)) return true;
    }
    if (!/(status|type|stage|phase|category|order)/.test(normalizedKey)) continue;
    if (/pre[\s-]?order/.test(normalizedValue)) return true;
  }

  return false;
}

function normalizeTFiberSaleOutcome(order: SalesOrderRecord, status = accountStatusText(order)): SaleOutcome {
  if (status.includes("cancel")) return "canceled";
  if (status.includes("churn")) return "churned";
  if (isPreorderStatus(order, status)) return "preorder";

  // T-Fiber status buckets should mirror the Excel export exactly.
  if (status === "active") return "installed";
  if (status === "pending installation") return "pending";

  const actualInstall = actualInstallDateId(order);
  if (actualInstall) return "installed";
  return "unknown";
}

function asOfStartOfDay(options?: SaleOutcomeOptions) {
  const source = options?.asOfDate;
  if (source instanceof Date) return startOfDay(source);
  if (typeof source === "string" && source.trim()) {
    const parsed = parseISO(source.length === 10 ? `${source}T12:00:00` : source);
    if (!Number.isNaN(parsed.valueOf())) return startOfDay(parsed);
  }
  return startOfDay(new Date());
}

export function readFirstText(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) return "";
  for (const key of keys) {
    const value = text(raw[key]);
    if (value) return value;
  }
  return "";
}

export function normalizeSaleOutcome(order: SalesOrderRecord, _options?: SaleOutcomeOptions): SaleOutcome {
  const status = accountStatusText(order);

  if (isTFiberOrder(order)) return normalizeTFiberSaleOutcome(order, status);

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

export function isPastDue(order: SalesOrderRecord, options?: SaleOutcomeOptions) {
  const status = accountStatusText(order);

  if (isTFiberOrder(order)) {
    // For T-Fiber, only Pending Installation orders can be past due.
    // Active, canceled, churned, and preorders are never past due.
    if (normalizeTFiberSaleOutcome(order, status) !== "pending") return false;
  } else if (status.includes("cancel") || status.includes("churn") || isPreorderStatus(order, status)) {
    return false;
  }

  const estimated = order.estimatedInstallationDateId
    || dateIdFromValue(readFirstText(order.rawData, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"]));

  if (!estimated) return status.includes("past due") || status.includes("pastdue") || status.includes("late");

  const actualInstall = actualInstallDateId(order);
  if (actualInstall) return false;

  try {
    return isBefore(parseISO(`${estimated}T12:00:00`), asOfStartOfDay(options));
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
