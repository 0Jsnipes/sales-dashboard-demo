import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { applyOutcomeFilter, applyTextSearchFilter, parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";

type SalesOrder = {
  orderUid: string;
  orderDateId: string;
  provider: string;
  orderId: string;
  rawRepName: string;
  rawSalesId: string;
  rawManagerName: string;
  matchedRepUid: string | null;
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
  managerName: string;
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

function buildRange(searchParams: URLSearchParams) {
  const dateRange = parseDateRangeParams(searchParams);
  if (dateRange.from && dateRange.to) return { start: dateRange.from, end: dateRange.to };
  const { monday, sunday } = currentWeek(dateRange.weekStart ?? searchParams.get("weekStart"));
  return { start: dateRange.weekStart ?? dateId(monday), end: dateId(sunday), monday, sunday };
}

function normalizeProvider(value: unknown) {
  const source = String(value || "").toLowerCase();
  if (source === "att") return "att";
  if (source === "tfiber" || source === "t-fiber") return "tfiber";
  if (source === "manual") return "manual";
  if (source === "frontier") return "frontier";
  return source;
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const range = buildRange(url.searchParams);
    const includeOrders = url.searchParams.get("includeOrders") === "true";
    const db = getAdminDb();
    const [tfiberSnapshot, attSnapshot, manualSnapshot, repsSnapshot, assignmentsSnapshot] = await Promise.all([
      db.collection("salesOrders").doc("tfiber").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("att").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("salesOrders").doc("manual").collection("orders").where("orderDateId", ">=", range.start).where("orderDateId", "<=", range.end).get(),
      db.collection("reps").get(),
      db.collection("repLocationAssignments").get(),
    ]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const selectedWeek = range.monday ? dateId(range.monday) : range.start;
    const resolveLocation = (rep: Rep | undefined) => {
      if (!rep) return "";
      const assignments = assignmentsSnapshot.docs.map((document) => document.data()).filter((item) => item.repUid === rep.repUid);
      const single = assignments.find((item) => item.mode === "single" && item.weekISO === selectedWeek);
      if (single) return String(single.locationName);
      const forward = assignments.filter((item) => item.mode === "forward" && String(item.weekISO) <= selectedWeek).sort((a, b) => String(a.weekISO).localeCompare(String(b.weekISO))).pop();
      return forward ? String(forward.locationName) : rep.locationName;
    };

    const allOrders = [...tfiberSnapshot.docs, ...attSnapshot.docs, ...manualSnapshot.docs].map((document) => document.data() as SalesOrder);
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
      if (filters.location && filters.location !== "all" && String(resolveLocation(rep) || "") !== filters.location) return false;
      if (filters.repId && order.matchedRepUid !== filters.repId) return false;
      if (filters.rep && filters.rep !== "all" && String(rep?.displayName || order.rawRepName || "") !== filters.rep) return false;
      if (filters.program && filters.program !== "all" && String(rep?.programIds?.join(",") || order.provider || "") !== filters.program) return false;
      if (filters.vendor && filters.vendor !== "all" && String(rep?.vendorType || "unassigned") !== filters.vendor) return false;
      if (filters.status && filters.status !== "all" && String(order.accountStatus || "") !== filters.status) return false;
      return true;
    });

    const grouped = new Map<string, SalesGroup>();
    for (const order of filteredOrders) {
      const [year, month, day] = String(order.orderDateId).split("-").map(Number);
      const anchor = range.monday ?? new Date(`${range.start}T12:00:00`);
      const dayIndex = Math.max(0, Math.min(6, Math.round((Date.UTC(year, month - 1, day) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86_400_000)));
      const rep = order.matchedRepUid ? roster.get(order.matchedRepUid) : undefined;
      const isATT = normalizeProvider(order.provider) === "att";
      const rawName = isATT ? formatImportedName(order.rawRepName || "Unassigned representative") : String(order.rawRepName || "Unassigned representative").trim();
      const key = rep ? `rep:${rep.repUid}` : `unmatched:${rawName.toLowerCase()}:${String(order.rawSalesId || "")}`;
      const group: SalesGroup = grouped.get(key) ?? {
        key,
        repUid: rep?.repUid ?? null,
        displayName: rep?.displayName ?? rawName,
        rawSalesId: String(order.rawSalesId || ""),
        programName: isATT ? "ATT" : "T-Fiber",
        vendorType: rep?.vendorType ?? "unassigned",
        weeklySalesGoal: Number(rep?.weeklySalesGoal ?? 0),
        managerName: rep?.managerName ?? (isATT ? "" : String(order.rawManagerName || "")),
        locationName: resolveLocation(rep),
        days: [0, 0, 0, 0, 0, 0, 0],
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
          orderId: String(order.orderId || order.orderUid || ""),
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
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
