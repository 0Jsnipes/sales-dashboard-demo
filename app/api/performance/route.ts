import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";

type Order = Record<string, unknown> & { id: string; providerKey: string };
type QueryDoc = { id: string; data(): Record<string, unknown> };
type QuerySnapshotLike = { docs: QueryDoc[] };
const classify = (status: unknown) => { const value = String(status || "").toLowerCase(); return value.includes("cancel") ? "cancelled" : value.includes("active") || value.includes("install") ? "active" : value.includes("schedul") || value.includes("pending") ? "pending" : "other"; };
const toDate = (value: string) => new Date(`${value}T12:00:00`);
const shiftRange = (start: string, end: string, days: number) => { const first = toDate(start); const last = toDate(end); first.setDate(first.getDate() + days); last.setDate(last.getDate() + days); return { start: toDateId(first), end: toDateId(last) }; };
const saleKey = (order: Order) => `${String(order.orderId || order.id || "").trim()}::${String(order.orderDateId || "").trim()}`;
const dedupeOrders = (orders: Order[]) => {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = saleKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const common = parseCommonFilters(url.searchParams);
    const rangeMode = url.searchParams.get("range");
    const explicit = parseDateRangeParams(url.searchParams);
    const baseStart = explicit.from ?? url.searchParams.get("start");
    const baseEnd = explicit.to ?? url.searchParams.get("end");
    const today = toDateId(new Date());
    const computed = rangeMode === "mtd"
      ? (() => { const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1); return { start: toDateId(start), end: today }; })()
      : rangeMode === "last30"
        ? (() => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29); return { start: toDateId(start), end: toDateId(end) }; })()
        : baseStart && baseEnd
          ? { start: baseStart, end: baseEnd }
          : { start: today, end: today };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(computed.start) || !/^\d{4}-\d{2}-\d{2}$/.test(computed.end) || computed.start > computed.end) return NextResponse.json({ error: "VALID_DATE_RANGE_REQUIRED" }, { status: 400 });
    const db = getAdminDb(); const mode = url.searchParams.get("mode") === "installs" ? "installs" : "sales"; const dateField = mode === "installs" ? "installationDateId" : "orderDateId"; const includeOrders = url.searchParams.get("includeOrders") === "true";
    const readRange = async (range: { start: string; end: string }) => {
      const get = (provider: string) => db.collection("salesOrders").doc(provider).collection("orders").where(dateField, ">=", range.start).where(dateField, "<=", range.end).get();
      const empty: QuerySnapshotLike = { docs: [] };
      const [att, tfiber, manual] = await Promise.all([get("att"), get("tfiber"), mode === "sales" ? get("manual") : Promise.resolve(empty)]);
      return dedupeOrders([
        ...att.docs.map((document) => ({ id: document.id, providerKey: "att", ...(document.data() as Record<string, unknown>) })),
        ...tfiber.docs.map((document) => ({ id: document.id, providerKey: "tfiber", ...(document.data() as Record<string, unknown>) })),
        ...manual.docs.map((document) => ({ id: document.id, providerKey: "manual", ...(document.data() as Record<string, unknown>) })),
      ] as Order[]);
    };
    const dayCount = Math.max(1, Math.floor((toDate(computed.end).getTime() - toDate(computed.start).getTime()) / 86400000) + 1);
    const [current, previous, priorMonth, priorYear, repsSnapshot] = await Promise.all([readRange(computed), readRange(shiftRange(computed.start, computed.end, -dayCount)), readRange(shiftRange(computed.start, computed.end, -30)), readRange(shiftRange(computed.start, computed.end, -365)), db.collection("reps").where("status", "==", "active").get()]);
    const reps = new Map(repsSnapshot.docs.map((d) => [d.id, d.data()])); const providerName = (order: Order) => String(order.provider) === "att" ? "ATT" : String(order.provider) === "tfiber" ? "T-Fiber" : String(order.provider) === "frontier" ? "Frontier" : "Manual";
    const filterOrders = (orders: Order[]) => orders.filter((order) => { const rep = order.matchedRepUid ? reps.get(String(order.matchedRepUid)) : undefined; const provider = providerName(order); return (!common.provider || common.provider === "both" || provider === common.provider) && (!common.manager || common.manager === "all" || String(rep?.managerName || order.rawManagerName || "") === common.manager) && (!common.location || common.location === "all" || String(rep?.locationName || "") === common.location) && (!common.repId || String(rep?.repUid || "") === common.repId) && (!common.rep || common.rep === "all" || String(rep?.displayName || order.rawRepName || "") === common.rep) && (!common.search || [order.orderId, order.rawRepName, order.rawSalesId, order.rawManagerName, provider, order.accountStatus].join(" ").toLowerCase().includes(common.search.toLowerCase())); });
    const metricsFor = (orders: Order[]) => { const metrics = { totalSales: 0, orderCount: orders.length, attSales: 0, tfiberSales: 0, frontierSales: 0, cancellations: 0, active: 0, pending: 0, activeReps: new Set(orders.map((o) => o.matchedRepUid).filter(Boolean)).size }; for (const order of orders) { const count = Number(order.saleCount || 1); metrics.totalSales += count; const provider = providerName(order); if (provider === "ATT") metrics.attSales += count; if (provider === "T-Fiber") metrics.tfiberSales += count; if (provider === "Frontier") metrics.frontierSales += count; const status = classify(order.accountStatus); if (status === "cancelled") metrics.cancellations += count; if (status === "active") metrics.active += count; if (status === "pending") metrics.pending += count; } return metrics; };
    const filtered = filterOrders(current); const metrics = metricsFor(filtered); const period = (orders: Order[], range: { start: string; end: string }) => { const value = metricsFor(filterOrders(orders)).totalSales; return { sales: value, change: value ? Math.round((metrics.totalSales - value) / value * 100) : null, start: range.start, end: range.end }; };
    const currentStart = computed.start; const currentEnd = computed.end;
    const pastDueOrders = filtered.filter((order) => { const installDate = String(order.installationDateId || ""); const status = classify(order.accountStatus); return /^\d{4}-\d{2}-\d{2}$/.test(installDate) && installDate < today && status !== "active" && status !== "cancelled"; }); const installEligible = filtered.filter((order) => /^\d{4}-\d{2}-\d{2}$/.test(String(order.installationDateId || ""))).length;
    const repRows = [...reps.values()].filter((rep) => (!common.manager || common.manager === "all" || rep.managerName === common.manager) && (!common.location || common.location === "all" || rep.locationName === common.location) && (!common.repId || rep.repUid === common.repId)).map((rep) => { const repOrders = filtered.filter((order) => order.matchedRepUid === rep.repUid); const sales = repOrders.reduce((sum, order) => sum + Number(order.saleCount || 1), 0); return { repUid: rep.repUid, displayName: rep.displayName, managerName: rep.managerName || "", locationName: rep.locationName || "", sales, goal: Number(rep.weeklySalesGoal || 0), pending: repOrders.filter((o) => classify(o.accountStatus) === "pending").length, active: repOrders.filter((o) => classify(o.accountStatus) === "active").length, cancelled: repOrders.filter((o) => classify(o.accountStatus) === "cancelled").length }; }).sort((a, b) => b.sales - a.sales || a.displayName.localeCompare(b.displayName));
    const orders = includeOrders ? filtered.map((order) => { const rep = order.matchedRepUid ? reps.get(String(order.matchedRepUid)) : undefined; const raw = order.rawData as Record<string, unknown> | undefined; return { id: order.id, providerKey: order.providerKey, orderDateId: String(mode === "installs" ? order.installationDateId : order.orderDateId || ""), orderId: String(order.orderId || order.orderUid || order.id), provider: providerName(order), repName: String(rep?.displayName || order.rawRepName || "Not on roster"), status: String(order.accountStatus || ""), customer: String(raw?.["Customer Name"] || raw?.["Street Address"] || "") }; }).sort((a, b) => b.orderDateId.localeCompare(a.orderDateId)).slice(0, common.limit ?? 500) : [];
    const roster = [...reps.values()].map((rep) => ({ repUid: String(rep.repUid), displayName: String(rep.displayName || "Unnamed representative") })).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ mode, metrics, installTracker: { pastDue: pastDueOrders.length, eligible: installEligible, pastDuePercent: installEligible ? Math.round(pastDueOrders.length / installEligible * 100) : 0 }, comparisons: { week: period(previous, shiftRange(currentStart, currentEnd, -dayCount)), month: period(priorMonth, shiftRange(currentStart, currentEnd, -30)), year: period(priorYear, shiftRange(currentStart, currentEnd, -365)) }, roster, reps: repRows, orders, meta: { filtersApplied: Object.entries(common).filter(([, value]) => Boolean(value)), count: filtered.length }, filters: { managers: [...new Set([...reps.values()].map((rep) => String(rep.managerName || "")).filter(Boolean))].sort(), locations: [...new Set([...reps.values()].map((rep) => String(rep.locationName || "")).filter(Boolean))].sort() } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
