import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { parseCommonFilters, parseDateRangeParams } from "@/src/lib/api/report-filters";
import { normalizePerformanceOutcome } from "@/src/lib/performance/performance-utils";
import { readFirstText, type SaleOutcome, type SalesOrderRecord } from "@/src/lib/sales/outcomes";

export const runtime = "nodejs";

type OrderDoc = Record<string, unknown> & {
  id: string;
  providerKey: string;
  provider?: string;
  orderId?: string;
  orderUid?: string;
  orderDateId?: string;
  saleCount?: number;
  matchedRepUid?: string | null;
  rawData?: Record<string, unknown>;
  rawRepName?: string;
  rawManagerName?: string;
  accountStatus?: string;
  installationDateId?: string | null;
  estimatedInstallationDateId?: string | null;
  cancellationDateId?: string | null;
};

type RepDoc = Record<string, unknown> & {
  repUid?: string;
  displayName?: string;
  managerName?: string;
  locationName?: string;
  status?: string;
  weeklySalesGoal?: number;
};

type StatusTotals = {
  total: number;
  installed: number;
  pending: number;
  pastDue: number;
  preorder: number;
  canceled: number;
  churned: number;
  unknown: number;
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dateId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const orderDedupeKey = (order: Record<string, unknown>) => `${String(order.orderId || order.orderUid || order.id || "").trim()}::${String(order.orderDateId || "").trim()}`;

function providerKey(value: unknown) {
  const source = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (source === "att" || source.includes("att")) return "att";
  if (source === "tfiber" || source.includes("tfiber")) return "tfiber";
  if (source === "frontier" || source.includes("frontier")) return "frontier";
  return "manual";
}

function providerLabel(value: unknown) {
  const source = providerKey(value);
  if (source === "att") return "ATT";
  if (source === "tfiber") return "T-Fiber";
  if (source === "frontier") return "Frontier";
  return "Manual";
}

function emptyStatusTotals(): StatusTotals {
  return { total: 0, installed: 0, pending: 0, pastDue: 0, preorder: 0, canceled: 0, churned: 0, unknown: 0 };
}

function addOutcome(totals: StatusTotals, outcome: SaleOutcome, count: number) {
  totals.total += count;
  if (outcome === "installed") totals.installed += count;
  else if (outcome === "pending") totals.pending += count;
  else if (outcome === "past_due") {
    // Past due is a subset of pending for T-Fiber reporting, not a replacement bucket.
    totals.pending += count;
    totals.pastDue += count;
  } else if (outcome === "preorder") totals.preorder += count;
  else if (outcome === "canceled") totals.canceled += count;
  else if (outcome === "churned") totals.churned += count;
  else totals.unknown += count;
}

function salesTotal(orders: Record<string, unknown>[]) {
  return orders.reduce((sum, order) => sum + Number(order.saleCount || 1), 0);
}

function dedupeOrders<T extends Record<string, unknown>>(orders: T[]) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = orderDedupeKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateIdFromUnknown(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return "";
  return dateId(parsed);
}

function resolveEstimatedInstallDateId(order: OrderDoc) {
  const raw = order.rawData && typeof order.rawData === "object" ? order.rawData : undefined;
  return dateIdFromUnknown(
    order.estimatedInstallationDateId
      || readFirstText(raw, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"])
      || (providerKey(order.provider || order.providerKey) === "tfiber" ? order.installationDateId : ""),
  ) || undefined;
}

function toSalesOrderRecord(order: OrderDoc): SalesOrderRecord {
  const rawProviderKey = providerKey(order.provider || order.providerKey);
  return {
    orderUid: String(order.orderUid || order.orderId || order.id),
    orderDateId: String(order.orderDateId || ""),
    provider: rawProviderKey,
    accountStatus: String(order.accountStatus || ""),
    installationDateId: String(order.installationDateId || "") || undefined,
    estimatedInstallationDateId: resolveEstimatedInstallDateId(order),
    cancellationDateId: String(order.cancellationDateId || "") || undefined,
    rawData: order.rawData && typeof order.rawData === "object" ? order.rawData : undefined,
    rawRepName: String(order.rawRepName || ""),
    rawManagerName: String(order.rawManagerName || ""),
    matchedRepUid: order.matchedRepUid ? String(order.matchedRepUid) : null,
    saleCount: Number(order.saleCount || 1),
  };
}

function resolveTFiberPastDueAsOfDate(orders: OrderDoc[]) {
  const latest = orders
    .filter((order) => providerKey(order.provider || order.providerKey) === "tfiber")
    .map((order) => String(order.orderDateId || ""))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()
    .pop();

  // The T-Fiber export is a snapshot. Use latest order date + 1 day so an old upload
  // does not mark extra rows past due just because today's real date advanced.
  return latest ? addDays(new Date(`${latest}T12:00:00`), 1) : new Date();
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const db = getAdminDb();
    const url = new URL(request.url);
    const common = parseCommonFilters(url.searchParams);
    const range = parseDateRangeParams(url.searchParams);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekday = today.getDay();
    const monday = range.from ? new Date(`${range.from}T12:00:00`) : addDays(today, weekday === 0 ? -6 : 1 - weekday);
    const lastDay = range.to ? new Date(`${range.to}T12:00:00`) : today;
    const statusStart = range.from ? monday : new Date(today.getFullYear(), today.getMonth(), 1);
    const statusEnd = range.to ? lastDay : today;
    const elapsedDays = Math.max(1, weekday === 0 ? 7 : weekday);
    const comparisonCurrentStart = weekday === 1 ? addDays(monday, -7) : monday;
    const comparisonCurrentEnd = weekday === 1 ? addDays(monday, -1) : lastDay;
    const comparisonPreviousStart = addDays(comparisonCurrentStart, -7);
    const comparisonPreviousEnd = addDays(comparisonCurrentEnd, -7);

    const getOrders = async (start: Date, end: Date) => {
      const startId = dateId(start);
      const endId = dateId(end);
      const get = (provider: string) => db.collection("salesOrders").doc(provider).collection("orders").where("orderDateId", ">=", startId).where("orderDateId", "<=", endId).get();
      const [att, tfiber, manual] = await Promise.all([get("att"), get("tfiber"), get("manual")]);
      return dedupeOrders(
        [
          ...att.docs.map((document) => ({ id: document.id, providerKey: "att", ...document.data(), provider: String(document.data().provider || "att") })),
          ...tfiber.docs.map((document) => ({ id: document.id, providerKey: "tfiber", ...document.data(), provider: String(document.data().provider || "tfiber") })),
          ...manual.docs.map((document) => ({ id: document.id, providerKey: "manual", ...document.data(), provider: String(document.data().provider || "manual") })),
        ] as OrderDoc[],
      );
    };

    const [currentOrders, statusOrders, comparisonOrders, previousOrders, repsSnapshot, uploadRuns] = await Promise.all([
      getOrders(monday, lastDay),
      getOrders(statusStart, statusEnd),
      getOrders(comparisonCurrentStart, comparisonCurrentEnd),
      getOrders(comparisonPreviousStart, comparisonPreviousEnd),
      db.collection("reps").get(),
      db.collection("uploadRuns").orderBy("uploadedAt", "desc").limit(30).get(),
    ]);

    const tfiberPastDueAsOfDate = resolveTFiberPastDueAsOfDate(statusOrders);
    const repMap = new Map<string, RepDoc>(repsSnapshot.docs.map((document) => [document.id, document.data() as RepDoc]));
    const activeRepMap = new Map([...repMap.entries()].filter(([, rep]) => String(rep.status || "active") === "active"));
    const applyOrderFilters = (orders: OrderDoc[]) => dedupeOrders(orders.filter((order) => {
      const rep = order.matchedRepUid ? repMap.get(String(order.matchedRepUid)) : undefined;
      const rawProviderKey = providerKey(order.provider || order.providerKey);
      return (!common.provider || common.provider === "all" || rawProviderKey === providerKey(common.provider))
        && (!common.manager || common.manager === "all" || String(rep?.managerName || order.rawManagerName || "") === common.manager)
        && (!common.location || common.location === "all" || String(rep?.locationName || "") === common.location)
        && (!common.repId || String(rep?.repUid || "") === common.repId)
        && (!common.rep || common.rep === "all" || String(rep?.displayName || order.rawRepName || "") === common.rep);
    }));
    const filteredCurrentOrders = applyOrderFilters(currentOrders);
    const filteredStatusOrders = applyOrderFilters(statusOrders);

    const repTotals = new Map<string, number>();
    for (const order of filteredCurrentOrders) {
      if (order.matchedRepUid) repTotals.set(String(order.matchedRepUid), (repTotals.get(String(order.matchedRepUid)) || 0) + Number(order.saleCount || 1));
    }
    const topReps = [...repTotals.entries()]
      .map(([repUid, sales]) => ({ repUid, displayName: String(repMap.get(repUid)?.displayName || "Unassigned"), sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    const byDay = Array.from({ length: 7 }, () => 0);
    const byDayTeams = Array.from({ length: 7 }, () => new Map<string, number>());
    const byProvider: Record<string, number> = { ATT: 0, "T-Fiber": 0, Frontier: 0, Manual: 0 };
    for (const order of filteredCurrentOrders) {
      const day = Math.round((Date.parse(String(order.orderDateId) + "T00:00:00Z") - Date.parse(dateId(monday) + "T00:00:00Z")) / 86400000);
      const count = Number(order.saleCount || 1);
      if (day >= 0 && day < 7) {
        byDay[day] += count;
        const manager = order.matchedRepUid ? String(repMap.get(String(order.matchedRepUid))?.managerName || "No manager") : "Not on roster";
        byDayTeams[day].set(manager, (byDayTeams[day].get(manager) || 0) + count);
      }
      const key = providerLabel(order.provider || order.providerKey);
      byProvider[key] = (byProvider[key] || 0) + count;
    }

    let totalKnocks = 0;
    const knocksByRep = new Map<string, number>();
    for (let cursor = new Date(monday); cursor <= lastDay; cursor = addDays(cursor, 1)) {
      const daily = await db.collection("knockDaily").doc(dateId(cursor)).collection("reps").get();
      for (const document of daily.docs) {
        const knocks = Number(document.data().knocks ?? document.data().count ?? 0);
        totalKnocks += knocks;
        knocksByRep.set(document.id, (knocksByRep.get(document.id) || 0) + knocks);
      }
    }

    const totalSalesGoal = [...activeRepMap.values()].reduce((sum, rep) => sum + Number(rep.weeklySalesGoal || 0), 0);
    const goalPacing = [...activeRepMap.entries()]
      .map(([repUid, rep]) => {
        const goal = Number(rep.weeklySalesGoal || 0);
        const sales = repTotals.get(repUid) || 0;
        const expected = goal * elapsedDays / 7;
        return {
          repUid,
          displayName: String(rep.displayName || ""),
          sales,
          goal,
          expected: Math.ceil(expected),
          remaining: Math.max(0, goal - sales),
          neededPerDay: Math.ceil(Math.max(0, goal - sales) / Math.max(1, 7 - elapsedDays)),
          behind: goal > 0 && sales < expected,
        };
      })
      .filter((rep) => rep.behind)
      .sort((a, b) => (b.expected - b.sales) - (a.expected - a.sales))
      .slice(0, 5);

    const alerts: Array<{ type: "pace" | "roster" | "upload"; title: string; detail: string }> = [];
    if (elapsedDays > 1) {
      for (const rep of goalPacing) alerts.push({ type: "pace", title: `${rep.displayName} is behind pace`, detail: `${rep.sales} sales against a ${rep.goal}-sale weekly goal.` });
    }
    const unmatched = filteredCurrentOrders.filter((order) => order.matchStatus === "unmatched");
    if (unmatched.length) alerts.push({ type: "roster", title: `${unmatched.length} sale${unmatched.length === 1 ? "" : "s"} need roster review`, detail: "An imported representative is not matched to the active roster." });

    const uploadInfo = (type: string) => {
      const row = uploadRuns.docs.map((document) => document.data()).find((item) => item.type === type);
      const uploadedAt = row?.uploadedAt?.toDate?.();
      return row ? { uploadedAt: uploadedAt?.toISOString() ?? null, rows: Number(row.rowsValid ?? row.summary?.saleCount ?? 0), fileName: String(row.fileName ?? "") } : null;
    };
    const freshness = { att: uploadInfo("attSales"), tfiber: uploadInfo("tfiberSales") };
    const todayKey = dateId(today);
    const uploadedToday = [freshness.att, freshness.tfiber].some((item) => item?.uploadedAt && dateId(new Date(item.uploadedAt)) === todayKey);
    if (!uploadedToday) alerts.push({ type: "upload", title: "No sales report uploaded today", detail: "Upload an ATT or T-Fiber report to keep today’s reporting current." });

    const orderStatusTotals = emptyStatusTotals();
    const statusFunnel: Record<string, StatusTotals> = {
      ATT: emptyStatusTotals(),
      "T-Fiber": emptyStatusTotals(),
      Frontier: emptyStatusTotals(),
      Manual: emptyStatusTotals(),
    };
    for (const order of filteredStatusOrders) {
      const rawProviderKey = providerKey(order.provider || order.providerKey);
      const record = toSalesOrderRecord(order);
      const outcome = normalizePerformanceOutcome(record, rawProviderKey === "tfiber" ? { asOfDate: tfiberPastDueAsOfDate } : undefined);
      const count = Number(order.saleCount || 1);
      const label = providerLabel(rawProviderKey);
      addOutcome(orderStatusTotals, outcome, count);
      addOutcome(statusFunnel[label] ?? statusFunnel.Manual, outcome, count);
    }

    const teams = new Map<string, { manager: string; location: string; sales: number; goal: number }>();
    for (const [repUid, rep] of activeRepMap) {
      const manager = String(rep.managerName || "No manager");
      const location = String(rep.locationName || "Not assigned");
      const key = manager + "\u0000" + location;
      const current = teams.get(key) ?? { manager, location, sales: 0, goal: 0 };
      current.goal += Number(rep.weeklySalesGoal || 0);
      current.sales += repTotals.get(repUid) || 0;
      teams.set(key, current);
    }
    const teamSnapshot = [...teams.values()].sort((a, b) => b.sales - a.sales);
    const efficiency = [...activeRepMap.entries()]
      .map(([repUid, rep]) => {
        const sales = repTotals.get(repUid) || 0;
        const knocks = knocksByRep.get(repUid) || 0;
        return { repUid, displayName: String(rep.displayName || ""), sales, knocks, conversion: knocks ? Number((sales / knocks * 100).toFixed(1)) : 0 };
      })
      .filter((rep) => rep.sales || rep.knocks)
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 10);

    return NextResponse.json({
      week: { start: dateId(monday), end: dateId(addDays(monday, 6)) },
      orderStatusRange: { start: dateId(statusStart), end: dateId(statusEnd) },
      totalSales: salesTotal(filteredCurrentOrders),
      totalSalesGoal,
      totalKnocks,
      activeReps: activeRepMap.size,
      byDay,
      byDayTeams: byDayTeams.map((teams) => [...teams.entries()].map(([manager, sales]) => ({ manager, sales })).sort((a, b) => b.sales - a.sales)),
      byProvider,
      topReps,
      comparison: {
        current: salesTotal(comparisonOrders),
        previous: salesTotal(previousOrders),
        currentStart: dateId(comparisonCurrentStart),
        currentEnd: dateId(comparisonCurrentEnd),
        previousStart: dateId(comparisonPreviousStart),
        previousEnd: dateId(comparisonPreviousEnd),
      },
      alerts,
      goalPacing,
      freshness,
      statusFunnel,
      orderStatusTotals,
      teamSnapshot,
      efficiency,
      meta: {
        filtersApplied: Object.entries(common).filter(([, value]) => Boolean(value)),
        tfiberPastDueAsOfDate: dateId(tfiberPastDueAsOfDate),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 });
  }
}
