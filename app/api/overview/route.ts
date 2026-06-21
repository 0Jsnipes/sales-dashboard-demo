import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { parseCommonFilters, parseDateRangeParams } from "@/src/lib/api/report-filters";

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const salesTotal = (orders: Record<string, unknown>[]) => orders.reduce((sum, order) => sum + Number(order.saleCount || 1), 0);
const dateId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export async function GET(request: Request) {
  try {
    await requireActor(request);
    const db = getAdminDb();
    const url = new URL(request.url);
    const common = parseCommonFilters(url.searchParams);
    const range = parseDateRangeParams(url.searchParams);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekday = today.getDay();
    const monday = range.from ? new Date(`${range.from}T12:00:00`) : addDays(today, weekday === 0 ? -6 : 1 - weekday);
    const lastDay = range.to ? new Date(`${range.to}T12:00:00`) : today;
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
      return [...att.docs, ...tfiber.docs, ...manual.docs].map((document) => document.data());
    };
    const [currentOrders, comparisonOrders, previousOrders, repsSnapshot, uploadRuns] = await Promise.all([
      getOrders(monday, lastDay),
      getOrders(comparisonCurrentStart, comparisonCurrentEnd),
      getOrders(comparisonPreviousStart, comparisonPreviousEnd),
      db.collection("reps").where("status", "==", "active").get(),
      db.collection("uploadRuns").orderBy("uploadedAt", "desc").limit(30).get(),
    ]);
    const repMap = new Map(repsSnapshot.docs.map((document) => [document.id, document.data()]));
    const filteredCurrentOrders = currentOrders.filter((order) => {
      const rep = order.matchedRepUid ? repMap.get(String(order.matchedRepUid)) : undefined;
      return (!common.manager || common.manager === "all" || String(rep?.managerName || order.rawManagerName || "") === common.manager)
        && (!common.location || common.location === "all" || String(rep?.locationName || "") === common.location)
        && (!common.repId || String(rep?.repUid || "") === common.repId)
        && (!common.rep || common.rep === "all" || String(rep?.displayName || order.rawRepName || "") === common.rep);
    });
    const repTotals = new Map<string, number>();
    for (const order of filteredCurrentOrders) if (order.matchedRepUid) repTotals.set(String(order.matchedRepUid), (repTotals.get(String(order.matchedRepUid)) || 0) + Number(order.saleCount || 1));
    const topReps = [...repTotals.entries()].map(([repUid, sales]) => ({ repUid, displayName: String(repMap.get(repUid)?.displayName || "Unassigned"), sales })).sort((a, b) => b.sales - a.sales).slice(0, 10);
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
      const provider = String(order.provider);
      const key = provider === "att" ? "ATT" : provider === "tfiber" ? "T-Fiber" : provider === "frontier" ? "Frontier" : "Manual";
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
    const totalSalesGoal = [...repMap.values()].reduce((sum, rep) => sum + Number((rep as { weeklySalesGoal?: number }).weeklySalesGoal || 0), 0);
    const goalPacing = [...repMap.entries()].map(([repUid, rep]) => { const goal = Number((rep as { weeklySalesGoal?: number }).weeklySalesGoal || 0); const sales = repTotals.get(repUid) || 0; const expected = goal * elapsedDays / 7; return { repUid, displayName: String((rep as { displayName?: string }).displayName || ""), sales, goal, expected: Math.ceil(expected), remaining: Math.max(0, goal - sales), neededPerDay: Math.ceil(Math.max(0, goal - sales) / Math.max(1, 7 - elapsedDays)), behind: goal > 0 && sales < expected }; }).filter((rep) => rep.behind).sort((a, b) => (b.expected - b.sales) - (a.expected - a.sales)).slice(0, 5);
    const alerts: Array<{ type: "pace" | "roster" | "upload"; title: string; detail: string }> = [];
    if (elapsedDays > 1) for (const rep of goalPacing) alerts.push({ type: "pace", title: `${rep.displayName} is behind pace`, detail: `${rep.sales} sales against a ${rep.goal}-sale weekly goal.` });
    const unmatched = filteredCurrentOrders.filter((order) => order.matchStatus === "unmatched");
    if (unmatched.length) alerts.push({ type: "roster", title: `${unmatched.length} sale${unmatched.length === 1 ? "" : "s"} need roster review`, detail: "An imported representative is not matched to the active roster." });
    const uploadInfo = (type: string) => { const row = uploadRuns.docs.map((document) => document.data()).find((item) => item.type === type); const uploadedAt = row?.uploadedAt?.toDate?.(); return row ? { uploadedAt: uploadedAt?.toISOString() ?? null, rows: Number(row.rowsValid ?? row.summary?.saleCount ?? 0), fileName: String(row.fileName ?? "") } : null; };
    const freshness = { att: uploadInfo("attSales"), tfiber: uploadInfo("tfiberSales") };
    const todayKey = dateId(today);
    const uploadedToday = [freshness.att, freshness.tfiber].some((item) => item?.uploadedAt && dateId(new Date(item.uploadedAt)) === todayKey);
    if (!uploadedToday) alerts.push({ type: "upload", title: "No sales report uploaded today", detail: "Upload an ATT or T-Fiber report to keep today’s reporting current." });
    const classifyStatusValue = (status: unknown) => { const value = String(status || "").toLowerCase(); return value.includes("cancel") ? "Cancelled" : value.includes("active") || value.includes("install") ? "Installed / Active" : value.includes("schedul") ? "Scheduled" : value.includes("pending") ? "Pending" : "Other"; };
    const statusFunnel: Record<string, Record<string, number>> = { ATT: {}, "T-Fiber": {} };
    for (const order of filteredCurrentOrders) {
      const provider = String(order.provider) === "att" ? "ATT" : String(order.provider) === "tfiber" ? "T-Fiber" : null;
      if (!provider) continue;
      const status = classifyStatusValue(order.accountStatus);
      statusFunnel[provider][status] = (statusFunnel[provider][status] || 0) + Number(order.saleCount || 1);
    }
    const teams = new Map<string, { manager: string; location: string; sales: number; goal: number }>();
    for (const [repUid, rep] of repMap) {
      const manager = String((rep as { managerName?: string }).managerName || "No manager");
      const location = String((rep as { locationName?: string }).locationName || "Not assigned");
      const key = manager + "\u0000" + location;
      const current = teams.get(key) ?? { manager, location, sales: 0, goal: 0 };
      current.goal += Number((rep as { weeklySalesGoal?: number }).weeklySalesGoal || 0);
      current.sales += repTotals.get(repUid) || 0;
      teams.set(key, current);
    }
    const teamSnapshot = [...teams.values()].sort((a, b) => b.sales - a.sales);
    const efficiency = [...repMap.entries()].map(([repUid, rep]) => { const sales = repTotals.get(repUid) || 0; const knocks = knocksByRep.get(repUid) || 0; return { repUid, displayName: String((rep as { displayName?: string }).displayName || ""), sales, knocks, conversion: knocks ? Number((sales / knocks * 100).toFixed(1)) : 0 }; }).filter((rep) => rep.sales || rep.knocks).sort((a, b) => b.conversion - a.conversion).slice(0, 10);
    return NextResponse.json({ week: { start: dateId(monday), end: dateId(addDays(monday, 6)) }, totalSales: salesTotal(filteredCurrentOrders), totalSalesGoal, totalKnocks, activeReps: repsSnapshot.size, byDay, byDayTeams: byDayTeams.map((teams) => [...teams.entries()].map(([manager, sales]) => ({ manager, sales })).sort((a, b) => b.sales - a.sales)), byProvider, topReps, comparison: { current: salesTotal(comparisonOrders), previous: salesTotal(previousOrders), currentStart: dateId(comparisonCurrentStart), currentEnd: dateId(comparisonCurrentEnd), previousStart: dateId(comparisonPreviousStart), previousEnd: dateId(comparisonPreviousEnd) }, alerts, goalPacing, freshness, statusFunnel, teamSnapshot, efficiency, meta: { filtersApplied: Object.entries(common).filter(([, value]) => Boolean(value)) } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 }); }
}
