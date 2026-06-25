import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";

const classify = (status: unknown) => {
  const value = String(status || "").toLowerCase();
  return value.includes("cancel") ? "cancelled" : value.includes("active") || value.includes("install") ? "active" : value.includes("preorder") ? "preorder" : value.includes("schedul") || value.includes("pending") ? "pending" : "other";
};
const toDateId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
type Order = Record<string, unknown> & {
  id: string;
  matchedRepUid?: string | null;
  rawData?: Record<string, unknown>;
  orderId?: string;
  orderUid?: string;
  orderDateId?: string;
  installationDateId?: string;
  rawRepName?: string;
  rawManagerName?: string;
  provider?: string;
  accountStatus?: string;
};
const saleKey = (order: Record<string, unknown>) => `${String(order.orderId || order.orderUid || order.id || "").trim()}::${String(order.orderDateId || "").trim()}`;

function dedupeOrders<T extends Record<string, unknown>>(orders: T[]) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = saleKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const today = toDateId(new Date());
    const providerName = (order: Record<string, unknown>) => String(order.provider) === "att" ? "ATT" : String(order.provider) === "tfiber" ? "T-Fiber" : String(order.provider) === "frontier" ? "Frontier" : "Manual";
    const rows = dedupeOrders([...att.docs, ...tfiber.docs, ...manual.docs].map((document) => ({ id: document.id, ...(document.data() as Record<string, unknown>) }))) as Order[];
    const filtered = rows
      .map((order) => {
        const rep = order.matchedRepUid ? reps.get(String(order.matchedRepUid)) : undefined;
        const raw = order.rawData as Record<string, unknown> | undefined;
        return {
          orderId: sanitizeOrderId(order.orderId || order.orderUid || order.id),
          orderDateId: String(order.orderDateId || ""),
          installDateId: String(order.installationDateId || ""),
          customer: String(raw?.["Customer Name"] || raw?.["Street Address"] || ""),
          representative: String(rep?.displayName || order.rawRepName || "Not on roster"),
          manager: String(rep?.managerName || order.rawManagerName || ""),
          location: String(rep?.locationName || ""),
          provider: providerName(order),
          accountStatus: String(order.accountStatus || ""),
          classification: classify(order.accountStatus),
        };
      })
      .filter((row) => {
        const overdue = /^\d{4}-\d{2}-\d{2}$/.test(row.installDateId) && row.installDateId < today && row.classification !== "active" && row.classification !== "cancelled" && row.classification !== "preorder";
        return (statusFilter === "pastDue" ? overdue : row.classification === statusFilter)
          && (providerFilter === "both" || row.provider === providerFilter)
          && (location === "all" || row.location === location)
          && (manager === "all" || row.manager === manager)
          && (repFilter === "all" || row.representative === repFilter);
      })
      .sort((a, b) => a.installDateId.localeCompare(b.installDateId));

    if (url.searchParams.get("format") === "csv") {
      const headers = ["Order Date", "Install Date", "Order Number", "Customer / Address", "Representative", "Manager", "Location", "Provider", "Account Status"];
      const csv = [headers.map(csvCell).join(","), ...filtered.map((row) => [row.orderDateId, row.installDateId, row.orderId, row.customer, row.representative, row.manager, row.location, row.provider, row.accountStatus].map(csvCell).join(","))].join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${statusFilter}-install-orders-${start}-to-${end}.csv"` } });
    }

    return NextResponse.json({ rows: filtered.slice(0, 1000), total: filtered.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_FAILED";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
