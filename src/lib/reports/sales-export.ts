import { enableWorksheetFilters } from "@/src/lib/exports/worksheet";

type SourceExportProvider = "Company A" | "Company B";

type SourceExportOrder = {
  provider: SourceExportProvider;
  rawData: Record<string, unknown>;
};

type ExportProvider = "Company A" | "Company B" | "Manual" | "Unknown";

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

export const EXCEL_DATE_FORMAT = "m/d/yyyy";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeProviderLabel(value: unknown): ExportProvider {
  const source = text(value).toLowerCase();
  if (source === "companya" || source === "company a") return "Company A";
  if (source === "companyb" || source === "company b") return "Company B";
  if (source === "manual") return "Manual";
  return "Unknown";
}

function dateFromParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function exportDate(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return value;
    return dateFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate()) ?? value;
  }

  const source = text(value);
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? value;
  const usDate = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (usDate) return dateFromParts(Number(usDate[3]), Number(usDate[1]), Number(usDate[2])) ?? value;
  return value;
}

function sanitizeOrderId(value: unknown) {
  return text(value).replace(/^[="'\s]+|[="'\s]+$/g, "");
}

function normalizedRawRow(rawData: Record<string, unknown> | undefined) {
  const raw = rawData && typeof rawData === "object" ? rawData : {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      if (DATE_KEY_PATTERN.test(key)) return [key, exportDate(value)];
      if (ORDER_KEY_PATTERN.test(key)) return [key, sanitizeOrderId(value)];
      return [key, value];
    }),
  );
}

function companyAStatusSummary(raw: Record<string, unknown>, fallback: unknown) {
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

function normalizeCellValue(value: unknown) {
  return exportDate(value) ?? "";
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
  const status = provider === "Company A" ? companyAStatusSummary(raw, order.accountStatus || order.status) : text(order.accountStatus || order.status);
  const installDate = raw["Internet Install Date"] ?? raw["Video Install Date"] ?? raw["Voice Install Date"] ?? raw["Wireless Install Date"] ?? raw["Activation Date"] ?? raw["Install Date"] ?? raw["Installation Date"] ?? exportDate(order.installationDateId);
  const estimatedInstallDate = raw["Est. Installation Date"] ?? raw["Estimated Installation Date"] ?? exportDate(order.estimatedInstallationDateId);

  const baseRow = provider === "Company A"
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

export async function downloadWorkbook(filename: string, sheets: Array<{ name: string; rows: Record<string, unknown>[] }>) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = buildWorksheetData(sheet.rows);
    const worksheet = enableWorksheetFilters(XLSX.utils.json_to_sheet(data.rows, { header: data.headers, dateNF: EXCEL_DATE_FORMAT }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || "Sheet1");
  }
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportOrdersWorkbook(orders: Parameters<typeof buildSalesExportRows>[0], prefix: string) {
  const grouped = new Map<string, typeof orders>();
  for (const order of orders) {
    const provider = order.provider === "Company A" || order.provider === "Company B" ? order.provider : "Other";
    const current = grouped.get(provider) ?? [];
    current.push(order);
    grouped.set(provider, current);
  }
  return downloadWorkbook(
    `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    [...grouped.entries()].map(([name, providerOrders]) => ({ name, rows: buildSalesExportRows(providerOrders) })),
  );
}
