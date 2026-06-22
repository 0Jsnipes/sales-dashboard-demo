import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";

type KnockOrder = {
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

type KnockGroup = {
  key: string;
  repUid: string | null;
  displayName: string;
  rawSalesId: string;
  programName: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  weeklySalesGoal: number;
  weeklyKnocksGoal: number;
  managerName: string;
  locationName: string;
  days: number[];
  total: number;
  accountStatuses: Record<string, number>;
  orders?: KnockOrder[];
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

function currentMonth() {
  const today = new Date();
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
}

function buildRange(searchParams: URLSearchParams, rangeMode: string | null) {
  const dateRange = parseDateRangeParams(searchParams);
  if (dateRange.from && dateRange.to) return { start: dateRange.from, end: dateRange.to };
  if (rangeMode === "mtd") {
    const { start, end } = currentMonth();
    return { start: dateId(start), end: dateId(end), monday: start };
  }
  const { monday, sunday } = currentWeek(dateRange.weekStart ?? searchParams.get("weekStart"));
  return { start: dateRange.weekStart ?? dateId(monday), end: dateId(sunday), monday, sunday };
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const range = buildRange(url.searchParams, url.searchParams.get("range"));
    const includeOrders = url.searchParams.get("includeOrders") === "true";
    const db = getAdminDb();
    const [repsSnapshot] = await Promise.all([
      db.collection("reps").get(),
    ]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const dayCount = Math.max(1, Math.floor((new Date(`${range.end}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86_400_000) + 1);

    const grouped = new Map<string, KnockGroup>();
    for (let offset = 0; offset < dayCount; offset += 1) {
      const cursor = new Date(`${range.start}T12:00:00`);
      cursor.setDate(cursor.getDate() + offset);
      const daily = await db.collection("knockDaily").doc(dateId(cursor)).collection("reps").get();
      for (const document of daily.docs) {
        const data = document.data() as Record<string, unknown>;
        const count = Number(data.knocks ?? data.count ?? 0);
        if (!count) continue;
        const repUid = String(data.repUid || document.id || "");
        const rep = roster.get(repUid);
        const rawName = String(data.displayName || data.rawRepName || rep?.displayName || repUid || "Unassigned rep").trim();
        const key = rep ? `rep:${rep.repUid}` : `unmatched:${rawName.toLowerCase()}:${String(data.rawSalesId || "")}`;
        const group: KnockGroup = grouped.get(key) ?? {
          key,
          repUid: rep?.repUid ?? null,
          displayName: rep?.displayName ?? rawName,
          rawSalesId: String(data.rawSalesId || ""),
          programName: "Knocks",
          vendorType: rep?.vendorType ?? "unassigned",
          weeklySalesGoal: Number(rep?.weeklySalesGoal ?? data.weeklySalesGoal ?? 0),
          weeklyKnocksGoal: Number(rep?.weeklyKnocksGoal ?? data.weeklyKnocksGoal ?? 0),
          managerName: rep?.managerName ?? String(data.managerName || ""),
          locationName: rep?.locationName ?? String(data.locationName || ""),
          days: Array.from({ length: dayCount }, () => 0),
          total: 0,
          accountStatuses: {},
        };
        const [year, month, day] = dateId(cursor).split("-").map(Number);
        const anchor = range.monday ?? new Date(`${range.start}T12:00:00`);
        const dayIndex = Math.max(0, Math.min(dayCount - 1, Math.round((Date.UTC(year, month - 1, day) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86_400_000)));
        group.days[dayIndex] += count;
        group.total += count;
        const accountStatus = String(data.accountStatus || "Recorded");
        group.accountStatuses[accountStatus] = (group.accountStatuses[accountStatus] || 0) + count;
        if (includeOrders) {
          group.orders ??= [];
          group.orders.push({
            orderUid: String(data.orderUid || document.id || `${dateId(cursor)}-${repUid}`),
            orderDateId: dateId(cursor),
            provider: "knocks",
            orderId: String(data.orderId || document.id || `${dateId(cursor)}-${repUid}`),
            rawRepName: rawName,
            rawSalesId: String(data.rawSalesId || ""),
            rawManagerName: String(data.managerName || rep?.managerName || ""),
            matchedRepUid: rep?.repUid ?? null,
            accountStatus,
            installationDateId: "",
            estimatedInstallationDateId: "",
            cancellationDateId: "",
            saleCount: count,
            rawData: data,
          });
        }
        grouped.set(key, group);
      }
    }

    const reps = [...grouped.values()]
      .map((group) => (group.orders ? { ...group, orders: group.orders.sort((a, b) => a.orderDateId.localeCompare(b.orderDateId)) } : group))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const filtered = reps.filter((rep) => {
      if (filters.manager && filters.manager !== "all" && String(rep.managerName || "") !== filters.manager) return false;
      if (filters.location && filters.location !== "all" && String(rep.locationName || "") !== filters.location) return false;
      if (filters.repId && rep.repUid !== filters.repId) return false;
      if (filters.rep && filters.rep !== "all" && String(rep.displayName || "") !== filters.rep) return false;
      const term = filters.search?.trim().toLowerCase();
      if (!term) return true;
      return [
        rep.displayName,
        rep.managerName,
        rep.locationName,
        rep.rawSalesId,
        rep.programName,
      ].join(" ").toLowerCase().includes(term);
    });

    return NextResponse.json({ week: { start: range.start, end: range.end }, reps: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
