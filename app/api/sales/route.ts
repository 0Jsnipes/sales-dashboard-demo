import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { applyOutcomeFilter, applyTextSearchFilter, parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";
import { startOfWeek } from "@/src/lib/date/week";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import { errorResponse } from "@/src/lib/api/error-response";
import { groupAssignmentsByRep, normalizeAssignmentDoc, resolveRepLocation, type RepLocationAssignment } from "@/src/lib/reps/location-assignments";

export const runtime = "nodejs";

type SalesOrder = {
  orderUid: string;
  orderDateId: string;
  provider: string;
  orderId: string;
  rawRepName: string;
  rawSalesId: string;
  rawManagerName: string;
  matchedRepUid: string | null;
  teamId?: string | null;
  accountStatus: string;
  installationDateId: string;
  estimatedInstallationDateId: string;
  cancellationDateId: string;
  saleCount: number;
  rawData: Record<string, unknown>;
};

type SalesGroup = {
  key: string;
  repUid: string | null;
  displayName: string;
  rawSalesId: string;
  programName: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  weeklySalesGoal: number;
  weeklyKnocksGoal: number;
  managerName: string;
  teamId: string | null;
  locationName: string;
  days: number[];
  total: number;
  accountStatuses: Record<string, number>;
  orders?: SalesOrder[];
};

const dateId = (date: Date) => toDateId(date);

function currentWeek(weekStart?: string | null) {
  const requested = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? new Date(`${weekStart}T12:00:00`) : null;
  const today = requested && !Number.isNaN(requested.valueOf()) ? requested : new Date();
  const day = today.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday, sunday };
}

// `monthParam` (YYYY-MM) lets MTD navigate to any month, not just the current
// one. The current month still caps at today (true "month to date"); any
// other month shows its full range since "to date" only means something for
// the month that's actually in progress.
function currentMonth(monthParam?: string) {
  const today = new Date();
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, monthNumber] = monthParam.split("-").map(Number);
    const start = new Date(year, monthNumber - 1, 1);
    const isCurrentMonth = year === today.getFullYear() && monthNumber === today.getMonth() + 1;
    const end = isCurrentMonth ? today : new Date(year, monthNumber, 0);
    return { start, end };
  }
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
}

function buildRange(searchParams: URLSearchParams, rangeMode: string | null) {
  const dateRange = parseDateRangeParams(searchParams);
  if (rangeMode === "mtd") {
    const { start, end } = currentMonth(dateRange.month);
    return { start: dateId(start), end: dateId(end), monday: start };
  }
  if (dateRange.from && dateRange.to) return { start: dateRange.from, end: dateRange.to };
  const { monday, sunday } = currentWeek(dateRange.weekStart ?? searchParams.get("weekStart"));
  if (rangeMode === "wtd") {
    const current = currentWeek();
    if (dateId(current.monday) === dateId(monday)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const end = yesterday < monday ? monday : yesterday;
      return { start: dateRange.weekStart ?? dateId(monday), end: dateId(end), monday, sunday };
    }
  }
  return { start: dateRange.weekStart ?? dateId(monday), end: dateId(sunday), monday, sunday };
}

function normalizeProvider(value: unknown) {
  const source = String(value || "").toLowerCase();
  if (source === "companya" || source === "company a") return "companya";
  if (source === "companyb" || source === "company b") return "companyb";
  if (source === "manual") return "manual";
  if (source === "companyc") return "companyc";
  return source;
}

function orderDedupeKey(order: SalesOrder) {
  return `${String(order.orderId || order.orderUid || "").trim()}::${String(order.orderDateId || "").trim()}`;
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const range = buildRange(url.searchParams, url.searchParams.get("range"));
    const includeOrders = url.searchParams.get("includeOrders") === "true";
    const db = getAdminDb();
    const [companyBSnapshot, companyASnapshot, manualSnapshot, repsSnapshot, assignmentsSnapshot] = await Promise.all([
      db.collection("salesOrders").doc("companyb").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("companya").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("manual").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("reps").get(),
      db.collection("repLocationAssignments").get(),
    ]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    // The Sales page groups by rep for the whole viewed range, so location is
    // resolved once per rep against the range's own week (not per order) — the
    // same simplification the previous implementation made, just rebased onto
    // the app's canonical weekStart id instead of a second ISO-week system.
    const selectedWeekStart = range.monday ? toDateId(range.monday) : toDateId(startOfWeek(new Date(`${range.start}T12:00:00`)));
    const dayCount = Math.max(1, Math.floor((new Date(`${range.end}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86_400_000) + 1);
    const assignmentsByRep = groupAssignmentsByRep(
      assignmentsSnapshot.docs
        .map((document) => normalizeAssignmentDoc(document.data()))
        .filter((item): item is RepLocationAssignment => item !== null),
    );
    const resolveLocation = (rep: Rep | undefined) => resolveRepLocation(rep, selectedWeekStart, assignmentsByRep).locationName;

    const allOrders = [...companyBSnapshot.docs, ...companyASnapshot.docs, ...manualSnapshot.docs].map((document) => document.data() as SalesOrder);
    const filteredOrders = applyOutcomeFilter(
      applyTextSearchFilter(allOrders, filters.search, (order) => [
        order.orderId,
        order.rawRepName,
        order.rawSalesId,
        order.rawManagerName,
        order.provider,
        order.accountStatus,
        order.rawData ? JSON.stringify(order.rawData) : "",
      ].join(" ")),
      filters.outcome,
    ).filter((order) => {
      const rep = order.matchedRepUid ? roster.get(order.matchedRepUid) : undefined;
      const provider = normalizeProvider(order.provider);
      if (filters.provider && filters.provider !== "all" && normalizeProvider(filters.provider) !== provider) return false;
      if (filters.manager && filters.manager !== "all" && String(rep?.managerName || order.rawManagerName || "") !== filters.manager) return false;
      if (filters.team && filters.team !== "all" && String(order.teamId || rep?.teamId || "") !== filters.team) return false;
      if (filters.location && filters.location !== "all" && String(resolveLocation(rep) || "") !== filters.location) return false;
      if (filters.repId && order.matchedRepUid !== filters.repId) return false;
      if (filters.rep && filters.rep !== "all" && String(rep?.displayName || order.rawRepName || "") !== filters.rep) return false;
      if (filters.program && filters.program !== "all" && String(rep?.programIds?.join(",") || order.provider || "") !== filters.program) return false;
      if (filters.vendor && filters.vendor !== "all" && String(rep?.vendorType || "unassigned") !== filters.vendor) return false;
      if (filters.status && filters.status !== "all" && String(order.accountStatus || "") !== filters.status) return false;
      return true;
    });
    const uniqueOrders = (() => {
      const seen = new Set<string>();
      return filteredOrders.filter((order) => {
        const key = orderDedupeKey(order);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    const grouped = new Map<string, SalesGroup>();
    for (const order of uniqueOrders) {
      const [year, month, day] = String(order.orderDateId).split("-").map(Number);
      const anchor = range.monday ?? new Date(`${range.start}T12:00:00`);
      const dayIndex = Math.max(0, Math.min(dayCount - 1, Math.round((Date.UTC(year, month - 1, day) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86_400_000)));
      const rep = order.matchedRepUid ? roster.get(order.matchedRepUid) : undefined;
      const isCompanyA = normalizeProvider(order.provider) === "companya";
      const rawName = isCompanyA ? formatImportedName(order.rawRepName || "Unassigned representative") : String(order.rawRepName || "Unassigned representative").trim();
      const key = rep ? `rep:${rep.repUid}` : `unmatched:${rawName.toLowerCase()}:${String(order.rawSalesId || "")}`;
      const group: SalesGroup = grouped.get(key) ?? {
        key,
        repUid: rep?.repUid ?? null,
        displayName: rep?.displayName ?? rawName,
        rawSalesId: String(order.rawSalesId || ""),
        programName: isCompanyA ? "Company A" : "Company B",
        vendorType: rep?.vendorType ?? "unassigned",
        weeklySalesGoal: Number(rep?.weeklySalesGoal ?? 0),
        weeklyKnocksGoal: Number(rep?.weeklyKnocksGoal ?? 0),
        managerName: rep?.managerName ?? (isCompanyA ? "" : String(order.rawManagerName || "")),
        teamId: String(order.teamId || rep?.teamId || "") || null,
        locationName: resolveLocation(rep),
        days: Array.from({ length: dayCount }, () => 0),
        total: 0,
        accountStatuses: {},
      };
      const count = Number(order.saleCount || 1);
      group.days[dayIndex] += count;
      group.total += count;
      const accountStatus = String(order.accountStatus || "Unknown");
      group.accountStatuses[accountStatus] = (group.accountStatuses[accountStatus] || 0) + count;
      if (includeOrders) {
        group.orders ??= [];
        group.orders.push({
          orderUid: String(order.orderUid || order.orderId || ""),
          orderDateId: String(order.orderDateId || ""),
          provider: String(order.provider || ""),
          orderId: sanitizeOrderId(order.orderId || order.orderUid || ""),
          rawRepName: String(order.rawRepName || ""),
          rawSalesId: String(order.rawSalesId || ""),
          rawManagerName: String(order.rawManagerName || ""),
          matchedRepUid: order.matchedRepUid ? String(order.matchedRepUid) : null,
          accountStatus: String(order.accountStatus || ""),
          installationDateId: String(order.installationDateId || ""),
          estimatedInstallationDateId: String(order.estimatedInstallationDateId || ""),
          cancellationDateId: String(order.cancellationDateId || ""),
          saleCount: count,
          rawData: order.rawData && typeof order.rawData === "object" ? order.rawData : {},
        });
      }
      grouped.set(key, group);
    }

    const reps = [...grouped.values()]
      .map((group) => (group.orders ? { ...group, orders: group.orders.sort((a, b) => a.orderDateId.localeCompare(b.orderDateId)) } : group))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const meta = {
      filtersApplied: Object.entries(filters).filter(([, value]) => Boolean(value)),
      count: reps.length,
    };

    return NextResponse.json({ week: { start: range.start, end: range.end }, reps, meta });
  } catch (error) {
    return errorResponse("sales", error);
  }
}
