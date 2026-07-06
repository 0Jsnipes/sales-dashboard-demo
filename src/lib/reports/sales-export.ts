type SourceExportProvider = "ATT" | "T-Fiber";

type SourceExportOrder = {
  provider: SourceExportProvider;
  rawData: Record<string, unknown>;
};

type ExportProvider = "ATT" | "T-Fiber" | "Manual" | "Unknown";

type ExportOrder = {
  orderUid?: string;
  orderDateId?: string;
  provider?: string;
  providerKey?: string;
  orderId?: string;
  rawRepName?: string;
  rawSalesId?: string;
  rawManagerName?: string;
  matchedRepUid?: string | null;
  accountStatus?: string;
  installationDateId?: string | null;
  estimatedInstallationDateId?: string | null;
  cancellationDateId?: string | null;
  saleCount?: number;
  rawData?: Record<string, unknown>;
  repName?: string;
  managerName?: string;
  locationName?: string;
  vendorType?: string;
  customer?: string;
  outcome?: string;
  status?: string;
  pastDue?: boolean;
};

const ORDER_KEY_PATTERN = /order.*(?:id|#|number)|(?:^|[\s_])(sti\s*)?order(?:$|[\s_#])|alt order id/i;
const DATE_KEY_PATTERN = /date/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeProviderLabel(value: unknown): ExportProvider {
  const source = text(value).toLowerCase();
  if (source === "att" || source === "at&t") return "ATT";
  if (source === "tfiber" || source === "t-fiber" || source === "t-mobile fiber" || source === "tmobile fiber") return "T-Fiber";
  if (source === "manual") return "Manual";
  return "Unknown";
}

function exportDate(value: unknown) {
  const source = text(value);
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${Number(iso[2])}-${Number(iso[3])}-${iso[1]}`;
  const slash = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${Number(slash[1])}-${Number(slash[2])}-${slash[3]}`;
  return value;
}

function sanitizeOrderId(value: unknown) {
  return text(value).replace(/^[="'\s]+|[="'\s]+$/g, "");
}

function normalizedRawRow(rawData: Record<string, unknown> | undefined) {
  const raw = rawData && typeof rawData === "object" ? rawData : {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      if (ORDER_KEY_PATTERN.test(key)) return [key, sanitizeOrderId(value)];
      if (DATE_KEY_PATTERN.test(key)) return [key, exportDate(value)];
      return [key, value];
    }),
  );
}

function attStatusSummary(raw: Record<string, unknown>, fallback: unknown) {
  const statuses = [["Video", raw["Video Status"]], ["Internet", raw["Internet Status"]], ["Voice", raw["Voice Status"]], ["Wireless", raw["Wireless Status"]]]
    .filter(([, status]) => text(status))
    .map(([service, status]) => `${service}: ${text(status)}`)
    .join(" | ");
  return statuses || text(fallback);
}

function vendorTypeLabel(value: unknown) {
  const source = text(value).toLowerCase();
  if (source === "organic") return "Organic";
  if (source === "subvendor") return "Subvendors";
  if (source === "unassigned") return "Unassigned";
  return text(value);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
}

function formatIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function normalizeCellValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
  }
  if (typeof value === "string" && isIsoDate(value)) {
    return formatIsoDate(value);
  }
  return value ?? "";
}

export function buildSourceExportRows(orders: SourceExportOrder[]) {
  return orders.map((order) => Object.fromEntries(
    Object.entries(order.rawData ?? {}).map(([key, value]) => [key, normalizeCellValue(value)]),
  ));
}

export function buildSourceWorksheetData(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return {
      headers: ["Message"],
      rows: [{ Message: "No matching source rows for the selected range and filters." }],
    };
  }

  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }

  return { headers, rows };
}

export function buildSalesExportRow(order: ExportOrder) {
  const provider = normalizeProviderLabel(order.providerKey ?? order.provider);
  const raw = normalizedRawRow(order.rawData);
  const orderId = sanitizeOrderId(order.orderId || order.orderUid || raw["Order ID"] || raw["Order Number"] || raw["Order #"] || raw["Alt Order ID"] || "");
  const representative = text(order.repName || order.rawRepName);
  const manager = text(order.managerName || order.rawManagerName);
  const location = text(order.locationName);
  const customer = text(order.customer || raw["Customer Name"] || raw["Customer / Address"]);
  const status = provider === "ATT" ? attStatusSummary(raw, order.accountStatus || order.status) : text(order.accountStatus || order.status);
  const installDate = raw["Internet Install Date"] ?? raw["Video Install Date"] ?? raw["Voice Install Date"] ?? raw["Wireless Install Date"] ?? raw["Activation Date"] ?? raw["Install Date"] ?? raw["Installation Date"] ?? exportDate(order.installationDateId);
  const estimatedInstallDate = raw["Est. Installation Date"] ?? raw["Estimated Installation Date"] ?? exportDate(order.estimatedInstallationDateId);

  const baseRow = provider === "ATT"
    ? {
        "Order Date": raw["Order Date"] ?? exportDate(order.orderDateId),
        "Customer / Address": raw["Customer / Address"] ?? raw["Customer Name"] ?? customer,
        "Order Number": sanitizeOrderId(raw["Order Number"] ?? raw["Order ID"] ?? orderId),
        "Rep Name": raw["Rep Name"] ?? representative,
        "Account Status": raw["Account Status"] ?? status,
        "Install Date": raw["Install Date"] ?? installDate,
      }
    : {
        "Order Date": raw["Order Date"] ?? exportDate(order.orderDateId),
        "Alt Order ID": sanitizeOrderId(raw["Alt Order ID"] ?? orderId),
        "Order #": sanitizeOrderId(raw["Order #"] ?? raw["Order Number"] ?? orderId),
        dealername: raw.dealername ?? representative,
        "Rep ID": raw["Rep ID"] ?? text(order.rawSalesId),
      };

  return {
    ...baseRow,
    ...raw,
    "Normalized Order ID": orderId,
    "Matched Rep": representative,
    "Matched Rep UID": text(order.matchedRepUid),
    Manager: manager,
    Location: location,
    "Vendor Type": vendorTypeLabel(order.vendorType),
    Provider: provider,
    Customer: customer,
    Outcome: text(order.outcome),
    Status: status,
    "Sale Count": Number(order.saleCount || 1) || 1,
    "Sale Date": exportDate(order.orderDateId),
    "Install Date (Normalized)": exportDate(order.installationDateId),
    "Estimated Install Date": exportDate(estimatedInstallDate),
    "Cancellation Date": exportDate(order.cancellationDateId),
    "Past Due": order.pastDue ? "Yes" : "No",
  };
}

export function buildSalesExportRows(orders: ExportOrder[]) {
  return orders.map(buildSalesExportRow);
}

export function buildWorksheetData(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return { headers: ["Message"], rows: [{ Message: "No matching source rows for the selected range and filters." }] };
  return { headers: [...new Set(rows.flatMap((row) => Object.keys(row)))], rows };
}
