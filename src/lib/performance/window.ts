import { addDays, startOfMonth, subDays } from "date-fns";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";
import { startOfWeek as mondayOfWeek } from "@/src/lib/date/week";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { buildRepSearchIndex, normalizeEmail, normalizeName, normalizeSalesId } from "@/src/lib/matching/normalize";
import { normalizePerformanceOutcome } from "@/src/lib/performance/performance-utils";
import {
  groupAssignmentsByRep,
  normalizeAssignmentDoc,
  resolveRepLocation,
  type RepLocationAssignment,
} from "@/src/lib/reps/location-assignments";
import { readFirstText, resolveCompanyBPastDueAsOfDate, sanitizeOrderId } from "@/src/lib/sales/outcomes";
import type { SaleOutcome, SalesOrderRecord } from "@/src/lib/sales/outcomes";
import type { Rep } from "@/src/types/rep";

type OrderDoc = Record<string, unknown> & {
  id: string;
  providerKey: string;
};

export type PerformanceOrder = SalesOrderRecord & {
  id: string;
  providerKey: string;
  repUid: string | null;
  repName: string;
  managerName: string;
  locationName: string;
  customer: string;
  orderId: string;
  provider: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  status: string;
  outcome: SaleOutcome;
  pastDue: boolean;
  saleCount: number;
};

export type RepSummary = {
  repUid: string | null;
  displayName: string;
  managerName: string;
  locationName: string;
  vendorType: string;
  sales: number;
  knocks: number;
  companyAKnocks: number;
  companyBKnocks: number;
  installed: number;
  pending: number;
  pastDue: number;
  preorder: number;
  canceled: number;
  churned: number;
  unknown: number;
  total: number;
  goal: number;
  conversion: number;
  matchStatus: "matched" | "unmatched";
};

export type TeamSummary = {
  name: string;
  sales: number;
  knocks: number;
  reps: number;
  conversion: number;
};

export type TrendPoint = {
  dateId: string;
  sales: number;
  knocks: number;
};

export type PerformanceResponse = {
  range: { start: string; end: string; mode: string };
  totals: {
    sales: number;
    knocks: number;
    companyAKnocks: number;
    companyBKnocks: number;
    conversion: number;
    installed: number;
    pending: number;
    pastDue: number;
    preorder: number;
    canceled: number;
    churned: number;
    unknown: number;
    activeReps: number;
    orderCount: number;
  };
  trend: TrendPoint[];
  reps: RepSummary[];
  teams: {
    managers: TeamSummary[];
    locations: TeamSummary[];
  };
  orders: PerformanceOrder[];
  filters: {
    managers: string[];
    locations: string[];
    providers: string[];
    reps: { repUid: string; displayName: string }[];
  };
};

export type PerformanceWindow = {
  range: { start: string; end: string; mode: string };
  totals: PerformanceResponse["totals"];
  trend: TrendPoint[];
  reps: RepSummary[];
  teams: PerformanceResponse["teams"];
  orders: PerformanceOrder[];
  filters: PerformanceResponse["filters"];
};

function providerLabel(value: unknown) {
  const source = String(value || "").toLowerCase();
  if (source === "companya" || source === "company a") return "Company A";
  if (source === "companyb" || source === "company b") return "Company B";
  if (source === "companyc") return "Company C";
  return "Manual";
}

function weekStartFromDateId(dateId: string) {
  return toDateId(mondayOfWeek(new Date(`${dateId}T12:00:00`)));
}

function orderDedupeKey(order: OrderDoc) {
  return `${String(order.orderId || order.orderUid || order.id || "").trim()}::${String(order.orderDateId || "").trim()}`;
}

function dedupeOrders<T extends OrderDoc>(orders: T[]) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = orderDedupeKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function customerName(raw: Record<string, unknown> | undefined) {
  if (!raw) return "—";
  return text(raw["Customer Name"] || raw["Customer / Address"] || raw["Customer"] || raw["Account Name"] || raw["Name"]) || "—";
}

export function resolvePerformanceRange(url: URL) {
  const mode = url.searchParams.get("range") || "lastWeek";
  const today = new Date();
  const todayId = toDateId(today);

  if (mode === "custom") {
    const explicit = parseDateRangeParams(url.searchParams);
    if (!explicit.from || !explicit.to) throw new Error("VALID_DATE_RANGE_REQUIRED");
    return { start: explicit.from, end: explicit.to, mode };
  }

  if (mode === "mtd") {
    const start = startOfMonth(today);
    return { start: toDateId(start), end: todayId, mode };
  }

  if (mode === "last30") {
    return { start: toDateId(subDays(today, 29)), end: todayId, mode };
  }

  if (mode === "wtd") {
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
    const yesterday = subDays(today, 1);
    const end = yesterday < monday ? monday : yesterday;
    return { start: toDateId(monday), end: toDateId(end), mode };
  }

  const currentWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentDay = currentWeek.getDay();
  currentWeek.setDate(currentWeek.getDate() + (currentDay === 0 ? -6 : 1 - currentDay));
  const lastWeekStart = addDays(currentWeek, -7);
  const lastWeekEnd = addDays(currentWeek, -1);
  return { start: toDateId(lastWeekStart), end: toDateId(lastWeekEnd), mode: "lastWeek" };
}

function rangeDates(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    dates.push(toDateId(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function resolveRepFromOrder(order: OrderDoc, roster: Map<string, Rep>) {
  const rawRepUid = String(order.matchedRepUid || "").trim();
  if (rawRepUid && roster.has(rawRepUid)) return roster.get(rawRepUid) ?? null;

  const raw = order.rawData as Record<string, unknown> | undefined;
  const email = normalizeEmail(String(raw?.Email || raw?.["Rep Email"] || order.rawEmail || ""));
  const salesId = normalizeSalesId(String(order.rawSalesId || raw?.["Rep ID"] || raw?.["Source Rep ID"] || ""));
  const rawName = normalizeName(String(order.rawRepName || raw?.Representative || order.displayName || ""));

  for (const rep of roster.values()) {
    const index = buildRepSearchIndex(rep);
    if (email && index.emails.includes(email)) return rep;
    if (salesId && index.salesIds.includes(salesId)) return rep;
    if (rawName && index.names.includes(rawName)) return rep;
  }

  return null;
}

function resolveKnockRep(row: Record<string, unknown>, roster: Map<string, Rep>) {
  const repUid = String(row.repUid || "");
  if (repUid && roster.has(repUid)) return roster.get(repUid) ?? null;
  const email = normalizeEmail(String(row.rawEmail || row.repEmail || ""));
  const salesId = normalizeSalesId(String(row.rawSalesId || row.sourceRepExternalId || ""));
  const rawName = normalizeName(String(row.rawRepName || row.displayName || ""));
  for (const rep of roster.values()) {
    const index = buildRepSearchIndex(rep);
    if (email && index.emails.includes(email)) return rep;
    if (salesId && index.salesIds.includes(salesId)) return rep;
    if (rawName && index.names.includes(rawName)) return rep;
  }
  return null;
}

function dateIdFromUnknown(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function resolveKnockBreakdown(row: Record<string, unknown>) {
  const companyAKnocks = Number(row.companyAKnocks ?? 0);
  const companyBKnocks = Number(row.companyBKnocks ?? 0);
  const combined = Number(row.knocks ?? row.count ?? (companyAKnocks + companyBKnocks));
  if (companyAKnocks || companyBKnocks) {
    return { knocks: companyAKnocks + companyBKnocks, companyAKnocks, companyBKnocks };
  }

  const source = String(row.source ?? "").toLowerCase();
  if (source.includes("companya")) return { knocks: combined, companyAKnocks: combined, companyBKnocks: 0 };
  if (source.includes("companyb") || source.includes("company b")) return { knocks: combined, companyAKnocks: 0, companyBKnocks: combined };
  return { knocks: combined, companyAKnocks: 0, companyBKnocks: 0 };
}

function resolveEstimatedInstallDateId(order: OrderDoc) {
  const raw = order.rawData as Record<string, unknown> | undefined;
  return dateIdFromUnknown(
    order.estimatedInstallationDateId
      || readFirstText(raw, ["Est. Installation Date", "Estimated Installation Date", "ETA Installation Date", "Install ETA"])
      || (order.providerKey === "companyb" ? order.installationDateId : ""),
  ) || undefined;
}

function resolveLocation(rep: Rep | null | undefined, orderDateId: string, assignmentsByRep: Map<string, RepLocationAssignment[]>) {
  return resolveRepLocation(rep, weekStartFromDateId(orderDateId), assignmentsByRep).locationName;
}

function initRepStat(rep: Rep): RepSummary {
  return {
    repUid: rep.repUid,
    displayName: rep.displayName || "Unnamed representative",
    managerName: rep.managerName || "No manager",
    locationName: rep.locationName || "Not assigned",
    vendorType: rep.vendorType || "unassigned",
    sales: 0,
    knocks: 0,
    companyAKnocks: 0,
    companyBKnocks: 0,
    installed: 0,
    pending: 0,
    pastDue: 0,
    preorder: 0,
    canceled: 0,
    churned: 0,
    unknown: 0,
    total: 0,
    goal: Number(rep.weeklySalesGoal || 0),
    conversion: 0,
    matchStatus: "matched",
  };
}

function initUnmatchedRepStat(name: string, managerName = "No manager", locationName = "Not assigned"): RepSummary {
  return {
    repUid: null,
    displayName: name || "Unmatched / Not on roster",
    managerName,
    locationName,
    vendorType: "unassigned",
    sales: 0,
    knocks: 0,
    companyAKnocks: 0,
    companyBKnocks: 0,
    installed: 0,
    pending: 0,
    pastDue: 0,
    preorder: 0,
    canceled: 0,
    churned: 0,
    unknown: 0,
    total: 0,
    goal: 0,
    conversion: 0,
    matchStatus: "unmatched",
  };
}

function bumpTeam(map: Map<string, TeamSummary & { repIds: Set<string> }>, name: string, repUid: string, sales: number, knocks: number) {
  const key = name || "Unassigned";
  const current = map.get(key) ?? { name: key, sales: 0, knocks: 0, reps: 0, conversion: 0, repIds: new Set<string>() };
  current.sales += sales;
  current.knocks += knocks;
  if (repUid) current.repIds.add(repUid);
  current.reps = current.repIds.size;
  current.conversion = current.knocks ? Math.round((current.sales / current.knocks) * 100) : 0;
  map.set(key, current);
}

export async function buildPerformanceWindow(range: { start: string; end: string; mode: string }): Promise<PerformanceWindow> {
  const db = getAdminDb();
  const [salesSnapshots, repsSnapshot, assignmentsSnapshot] = await Promise.all([
    Promise.all([
      db.collection("salesOrders").doc("companya").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("companyb").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("manual").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
    ]),
    db.collection("reps").get(),
    db.collection("repLocationAssignments").get(),
  ]);

  const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
  const assignmentsByRep = groupAssignmentsByRep(
    assignmentsSnapshot.docs
      .map((document) => normalizeAssignmentDoc(document.data()))
      .filter((item): item is RepLocationAssignment => item !== null),
  );

  const salesOrders = dedupeOrders(
    salesSnapshots.flatMap((snapshot, index) => snapshot.docs.map((document) => ({
      id: document.id,
      providerKey: ["companya", "companyb", "manual"][index]!,
      ...(document.data() as Record<string, unknown>),
    } as OrderDoc))),
  );
  const companyBPastDueAsOfDate = resolveCompanyBPastDueAsOfDate(salesOrders);

  const dailyDocs = await Promise.all(rangeDates(range.start, range.end).map(async (dateId) => {
    const snapshot = await db.collection("knockDaily").doc(dateId).collection("reps").get();
    return { dateId, snapshot };
  }));

  const trendByDay = new Map<string, TrendPoint>();
  const repStats = new Map<string, RepSummary>();
  const managerMap = new Map<string, TeamSummary & { repIds: Set<string> }>();
  const locationMap = new Map<string, TeamSummary & { repIds: Set<string> }>();
  const providerSet = new Set<string>();
  let totalSales = 0;
  let totalKnocks = 0;
  let totalCompanyAKnocks = 0;
  let totalCompanyBKnocks = 0;
  let installed = 0;
  let pending = 0;
  let pastDue = 0;
  let preorder = 0;
  let canceled = 0;
  let churned = 0;
  let unknown = 0;

  for (const rep of roster.values()) {
    if (rep.status === "active") repStats.set(rep.repUid, initRepStat(rep));
  }

  for (const order of salesOrders) {
    const saleCount = Number(order.saleCount || 1);
    const rep = resolveRepFromOrder(order, roster);
    const repUid = rep?.repUid ?? null;
    const estimatedInstallationDateId = resolveEstimatedInstallDateId(order);
    const rawRepName = String(order.rawRepName || order.displayName || order.orderId || "Unmatched / Not on roster");
    const displayName = rep?.displayName || (String(order.provider || order.providerKey) === "companya" ? formatImportedName(rawRepName) : rawRepName) || "Unmatched / Not on roster";
    const managerName = rep?.managerName || String(order.rawManagerName || "") || "No manager";
    const locationName = resolveLocation(rep, String(order.orderDateId || ""), assignmentsByRep) || rep?.locationName || "Not assigned";
    const provider = providerLabel(order.provider || order.providerKey);
    const record: SalesOrderRecord = {
      orderUid: String(order.orderUid || order.orderId || order.id),
      orderDateId: String(order.orderDateId || ""),
      provider: provider.toLowerCase(),
      accountStatus: String(order.accountStatus || ""),
      installationDateId: String(order.installationDateId || "") || undefined,
      estimatedInstallationDateId,
      cancellationDateId: String(order.cancellationDateId || "") || undefined,
      rawData: order.rawData && typeof order.rawData === "object" ? (order.rawData as Record<string, unknown>) : undefined,
      rawRepName: String(order.rawRepName || ""),
      rawSalesId: String(order.rawSalesId || ""),
      rawManagerName: String(order.rawManagerName || ""),
      matchedRepUid: repUid,
      saleCount,
    };
    const outcome = normalizePerformanceOutcome(record, provider === "Company B" ? { asOfDate: companyBPastDueAsOfDate } : undefined);

    totalSales += saleCount;
    if (outcome === "installed") installed += saleCount;
    else if (outcome === "pending") pending += saleCount;
    else if (outcome === "past_due") pastDue += saleCount;
    else if (outcome === "preorder") preorder += saleCount;
    else if (outcome === "canceled") canceled += saleCount;
    else if (outcome === "churned") churned += saleCount;
    else unknown += saleCount;
    providerSet.add(provider);

    const trend = trendByDay.get(String(order.orderDateId || "")) ?? { dateId: String(order.orderDateId || ""), sales: 0, knocks: 0 };
    trend.sales += saleCount;
    trendByDay.set(String(order.orderDateId || ""), trend);

    const statKey = repUid ? repUid : `unmatched:${normalizeName(displayName)}`;
    const stat = repUid ? repStats.get(repUid) ?? initUnmatchedRepStat(displayName, managerName, locationName) : repStats.get(statKey) ?? initUnmatchedRepStat(displayName, managerName, locationName);
    stat.repUid = repUid;
    stat.displayName = displayName;
    stat.managerName = managerName;
    stat.locationName = locationName;
    stat.sales += saleCount;
    stat.total += saleCount;
    stat.goal = rep?.weeklySalesGoal ? Number(rep.weeklySalesGoal || 0) : stat.goal;
    if (outcome === "installed") stat.installed += saleCount;
    else if (outcome === "pending") stat.pending += saleCount;
    else if (outcome === "past_due") stat.pastDue += saleCount;
    else if (outcome === "preorder") stat.preorder += saleCount;
    else if (outcome === "canceled") stat.canceled += saleCount;
    else if (outcome === "churned") stat.churned += saleCount;
    else stat.unknown += saleCount;
    stat.conversion = stat.knocks ? Math.round((stat.sales / stat.knocks) * 100) : 0;
    repStats.set(repUid ? repUid : statKey, stat);

    bumpTeam(managerMap, managerName, repUid ?? statKey, saleCount, 0);
    bumpTeam(locationMap, locationName, repUid ?? statKey, saleCount, 0);
  }

  for (const { dateId, snapshot } of dailyDocs) {
    for (const document of snapshot.docs) {
      const data = document.data() as Record<string, unknown>;
      const breakdown = resolveKnockBreakdown(data);
      const knocks = breakdown.knocks;
      if (!knocks) continue;
      const rep = resolveKnockRep({ ...data, repUid: document.id }, roster);
      const repUid = rep?.repUid ?? null;
      const displayName = rep?.displayName || String(data.displayName || data.rawRepName || "Unmatched / Not on roster");
      const managerName = rep?.managerName || String(data.managerName || "") || "No manager";
      const locationName = rep ? resolveLocation(rep, dateId, assignmentsByRep) || rep.locationName || "Not assigned" : String(data.locationName || "") || "Not assigned";

      totalKnocks += knocks;
      totalCompanyAKnocks += breakdown.companyAKnocks;
      totalCompanyBKnocks += breakdown.companyBKnocks;
      const trend = trendByDay.get(dateId) ?? { dateId, sales: 0, knocks: 0 };
      trend.knocks += knocks;
      trendByDay.set(dateId, trend);

      const statKey = repUid ? repUid : `unmatched:${normalizeName(displayName)}`;
      const stat = repUid ? repStats.get(repUid) ?? initUnmatchedRepStat(displayName, managerName, locationName) : repStats.get(statKey) ?? initUnmatchedRepStat(displayName, managerName, locationName);
      stat.repUid = repUid;
      stat.displayName = displayName;
      stat.managerName = managerName;
      stat.locationName = locationName;
      stat.knocks += knocks;
      stat.companyAKnocks += breakdown.companyAKnocks;
      stat.companyBKnocks += breakdown.companyBKnocks;
      stat.total += knocks;
      stat.conversion = stat.knocks ? Math.round((stat.sales / stat.knocks) * 100) : 0;
      repStats.set(repUid ? repUid : statKey, stat);

      bumpTeam(managerMap, managerName, repUid ?? statKey, 0, knocks);
      bumpTeam(locationMap, locationName, repUid ?? statKey, 0, knocks);
    }
  }

  const reps = [...repStats.values()]
    .map((rep) => ({
      ...rep,
      conversion: rep.knocks ? Math.round((rep.sales / rep.knocks) * 100) : 0,
    }))
    .sort((a, b) => b.sales - a.sales || b.knocks - a.knocks || a.displayName.localeCompare(b.displayName));

  const managers = [...managerMap.values()]
    .map(({ repIds, ...row }) => ({ ...row, reps: repIds.size, conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0 }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));

  const locations = [...locationMap.values()]
    .map(({ repIds, ...row }) => ({ ...row, reps: repIds.size, conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0 }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));

  const orders = salesOrders
    .map((order) => {
      const rep = resolveRepFromOrder(order, roster);
      const repUid = rep?.repUid ?? null;
      const estimatedInstallationDateId = resolveEstimatedInstallDateId(order);
      const displayName = rep?.displayName || (String(order.provider || order.providerKey) === "companya" ? formatImportedName(String(order.rawRepName || "")) : String(order.rawRepName || "Unmatched / Not on roster"));
      const managerName = rep?.managerName || String(order.rawManagerName || "") || "No manager";
      const locationName = resolveLocation(rep, String(order.orderDateId || ""), assignmentsByRep) || rep?.locationName || "Not assigned";
      const provider = providerLabel(order.provider || order.providerKey);
      const record: SalesOrderRecord = {
        orderUid: String(order.orderUid || order.orderId || order.id),
        orderDateId: String(order.orderDateId || ""),
        provider: provider.toLowerCase(),
        accountStatus: String(order.accountStatus || ""),
        installationDateId: String(order.installationDateId || "") || undefined,
        estimatedInstallationDateId,
        cancellationDateId: String(order.cancellationDateId || "") || undefined,
        rawData: order.rawData && typeof order.rawData === "object" ? (order.rawData as Record<string, unknown>) : undefined,
        rawRepName: String(order.rawRepName || ""),
        rawSalesId: String(order.rawSalesId || ""),
        rawManagerName: String(order.rawManagerName || ""),
        matchedRepUid: repUid,
        saleCount: Number(order.saleCount || 1),
      };
      const outcome = normalizePerformanceOutcome(record, provider === "Company B" ? { asOfDate: companyBPastDueAsOfDate } : undefined);
      return {
        ...record,
        id: `${order.providerKey}:${order.id}`,
        providerKey: order.providerKey,
        orderId: sanitizeOrderId(order.orderId || order.orderUid || order.id),
        provider,
        vendorType: rep?.vendorType || "unassigned",
        repUid,
        repName: displayName,
        managerName,
        locationName,
        customer: customerName(order.rawData as Record<string, unknown> | undefined),
        status: (() => {
          const value = String(order.accountStatus || "").trim();
          return value && value.toLowerCase() !== "unknown" ? value : "";
        })(),
        outcome,
        pastDue: outcome === "past_due",
        saleCount: Number(order.saleCount || 1),
      } satisfies PerformanceOrder;
    })
    .sort((a, b) => b.orderDateId.localeCompare(a.orderDateId) || a.repName.localeCompare(b.repName));

  const totals = {
    sales: totalSales,
    knocks: totalKnocks,
    companyAKnocks: totalCompanyAKnocks,
    companyBKnocks: totalCompanyBKnocks,
    conversion: totalKnocks ? Math.round((totalSales / totalKnocks) * 100) : 0,
    installed,
    pending,
    pastDue,
    preorder,
    canceled,
    churned,
    unknown,
    activeReps: reps.filter((rep) => rep.repUid && (rep.sales > 0 || rep.knocks > 0)).length,
    orderCount: orders.length,
  };

  const filters = {
    managers: [...new Set([...reps.map((rep) => rep.managerName).filter(Boolean), ...managers.map((team) => team.name).filter(Boolean)])].sort(),
    locations: [...new Set([...reps.map((rep) => rep.locationName).filter(Boolean), ...locations.map((team) => team.name).filter(Boolean)])].sort(),
    providers: [...providerSet].sort(),
    reps: reps.map((rep) => ({ repUid: rep.repUid ? String(rep.repUid) : rep.displayName, displayName: rep.displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };

  const trend = [...trendByDay.values()].sort((a, b) => a.dateId.localeCompare(b.dateId));

  return {
    range,
    totals,
    trend,
    reps,
    teams: {
      managers,
      locations,
    },
    orders,
    filters,
  };
}
