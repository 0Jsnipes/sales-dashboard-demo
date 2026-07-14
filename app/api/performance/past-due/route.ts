import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { normalizePerformanceOutcome } from "@/src/lib/performance/performance-utils";
import { readFirstText, resolveTFiberPastDueAsOfDate, sanitizeOrderId, type SalesOrderRecord } from "@/src/lib/sales/outcomes";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
type Order = Record<string, unknown> & {
  id: string;
  matchedRepUid?: string | null;
  rawData?: Record<string, unknown>;
  orderId?: string;
  orderUid?: string;
  orderDateId?: string;
  installationDateId?: string;
  estimatedInstallationDateId?: string;
  rawRepName?: string;
  rawManagerName?: string;
  provider?: string;
  accountStatus?: string;
};
const saleKey = (order: Record<string, unknown>) => `${String(order.orderId || order.orderUid || order.id || "").trim()}::${String(order.orderDateId || "").trim()}`;

function providerKey(value: unknown) {
  const source = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (source === "att" || source.includes("att")) return "att";
  if (source === "tfiber" || source.includes("tfiber")) return "tfiber";
  if (source === "frontier" || source.includes("frontier")) return "frontier";
  return "manual";
}

function providerName(value: unknown) {
  const source = providerKey(value);
  if (source === "att") return "ATT";
  if (source === "tfiber") return "T-Fiber";
  if (source === "frontier") return "Frontier";
  return "Manual";
}

function dedupeOrders<T extends Record<string, unknown>>(orders: T[]) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = saleKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimatedInstallDateId(order: Order) {
  return String(order.estimatedInstallationDateId || readFirstText(order.rawData, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"]) || order.installationDateId || "");
}

function statusMatches(statusFilter: string | null, outcome: string) {
  if (!statusFilter || statusFilter === "pastDue") return outcome === "past_due";
  if (statusFilter === "active") return outcome === "installed";
  if (statusFilter === "pending") return outcome === "pending" || outcome === "past_due";
  if (statusFilter === "preorder") return outcome === "preorder";
  if (statusFilter === "canceled" || statusFilter === "cancelled") return outcome === "canceled";
  if (statusFilter === "churned") return outcome === "churned";
  return outcome === statusFilter;
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const statusFilter = url.searchParams.get("status");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "") || start! > end!) {
      return NextResponse.json({ error: "VALID_DATE_RANGE_REQUIRED" }, { status: 400 });
    }

    const db = getAdminDb();
    const manager = url.searchParams.get("manager") || "all";
    const location = url.searchParams.get("location") || "all";
    const repFilter = url.searchParams.get("rep") || "all";
    const providerFilter = url.searchParams.get("provider") || "both";
    const ordersFor = (provider: string) => db.collection("salesOrders").doc(provider).collection("orders").where("orderDateId", ">=", start!).where("orderDateId", "<=", end!).get();
    const [att, tfiber, manual, repsSnapshot] = await Promise.all([ordersFor("att"), ordersFor("tfiber"), ordersFor("manual"), db.collection("reps").where("status", "==", "active").get()]);
    const reps = new Map(repsSnapshot.docs.map((document) => [document.id, document.data()]));
    const rows = dedupeOrders([
      ...att.docs.map((document) => ({ id: document.id, providerKey: "att", ...(document.data() as Record<string, unknown>) })),
      ...tfiber.docs.map((document) => ({ id: document.id, providerKey: "tfiber", ...(document.data() as Record<string, unknown>) })),
      ...manual.docs.map((document) => ({ id: document.id, providerKey: "manual", ...(document.data() as Record<string, unknown>) })),
    ]) as Order[];
    const tfiberPastDueAsOfDate = resolveTFiberPastDueAsOfDate(rows);
    const filtered = rows
      .map((order) => {
        const rep = order.matchedRepUid ? reps.get(String(order.matchedRepUid)) : undefined;
        const raw = order.rawData as Record<string, unknown> | undefined;
        const rawProviderKey = providerKey(order.provider || order.providerKey);
        const record: SalesOrderRecord = {
          orderUid: String(order.orderUid || order.orderId || order.id),
          orderDateId: String(order.orderDateId || ""),
          provider: rawProviderKey,
          accountStatus: String(order.accountStatus || ""),
          installationDateId: String(order.installationDateId || "") || undefined,
          estimatedInstallationDateId: String(order.estimatedInstallationDateId || "") || undefined,
          cancellationDateId: String(order.cancellationDateId || "") || undefined,
          rawData: raw,
          rawRepName: String(order.rawRepName || ""),
          rawManagerName: String(order.rawManagerName || ""),
          matchedRepUid: order.matchedRepUid ?? null,
          saleCount: Number(order.saleCount || 1),
        };
        const outcome = normalizePerformanceOutcome(record, rawProviderKey === "tfiber" ? { asOfDate: tfiberPastDueAsOfDate } : undefined);
        return {
          orderId: sanitizeOrderId(order.orderId || order.orderUid || order.id),
          orderDateId: String(order.orderDateId || ""),
          installDateId: estimatedInstallDateId(order),
          customer: String(raw?.["Customer Name"] || raw?.["Street Address"] || ""),
          representative: String(rep?.displayName || order.rawRepName || "Not on roster"),
          manager: String(rep?.managerName || order.rawManagerName || ""),
          location: String(rep?.locationName || ""),
          provider: providerName(rawProviderKey),
          accountStatus: String(order.accountStatus || ""),
          outcome,
        };
      })
      .filter((row) => statusMatches(statusFilter, row.outcome)
        && (providerFilter === "both" || row.provider === providerFilter)
        && (location === "all" || row.location === location)
        && (manager === "all" || row.manager === manager)
        && (repFilter === "all" || row.representative === repFilter))
      .sort((a, b) => a.installDateId.localeCompare(b.installDateId));

    if (url.searchParams.get("format") === "csv") {
      const headers = ["Order Date", "Install Date", "Order Number", "Customer / Address", "Representative", "Manager", "Location", "Provider", "Account Status"];
      const csv = [headers.map(csvCell).join(","), ...filtered.map((row) => [row.orderDateId, row.installDateId, row.orderId, row.customer, row.representative, row.manager, row.location, row.provider, row.accountStatus].map(csvCell).join(","))].join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${statusFilter || "pastDue"}-install-orders-${start}-to-${end}.csv"` } });
    }

    return NextResponse.json({ rows: filtered.slice(0, 1000), total: filtered.length });
  } catch (error) {
    return errorResponse("performance/past-due", error, "EXPORT_FAILED");
  }
}
