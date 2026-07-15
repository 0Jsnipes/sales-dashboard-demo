import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canImportSales, canViewKnockHours, requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";
import { buildRepSearchIndex, normalizeEmail, normalizeSalesId, normalizeName } from "@/src/lib/matching/normalize";
import { importKnockWorkbook } from "@/src/lib/knocks/import";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

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
  teamId: string | null;
  locationName: string;
  days: number[];
  total: number;
  accountStatuses: Record<string, number>;
  lcps: string[];
  orders?: KnockOrder[];
};

const dateId = (date: Date) => toDateId(date);

function resolveRep(row: Record<string, unknown>, roster: Map<string, Rep>) {
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
  return { start: dateRange.weekStart ?? dateId(monday), end: dateId(sunday), monday, sunday };
}

function normalizeProvider(value: unknown) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "att" || source === "at&t") return "att";
  if (source === "tfiber" || source === "t-fiber" || source === "t-mobile fiber" || source === "tmobile fiber") return "tfiber";
  return source;
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
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

    const dailyCursors = Array.from({ length: dayCount }, (_, offset) => {
      const cursor = new Date(`${range.start}T12:00:00`);
      cursor.setDate(cursor.getDate() + offset);
      return cursor;
    });
    const dailySnapshots = await Promise.all(dailyCursors.map((cursor) => db.collection("knockDaily").doc(dateId(cursor)).collection("reps").get()));

    const grouped = new Map<string, KnockGroup>();
    const selectedProvider = normalizeProvider(filters.provider);
    const selectedLcp = String(filters.lcp || "").trim().toLowerCase();
    for (const [dayOffset, daily] of dailySnapshots.entries()) {
      const cursor = dailyCursors[dayOffset]!;
      for (const document of daily.docs) {
        const data = document.data() as Record<string, unknown>;
        const count = selectedProvider === "att"
          ? Number(data.attKnocks ?? 0)
          : selectedProvider === "tfiber"
            ? Number(data.tfiberKnocks ?? 0)
            : Number(data.knocks ?? data.count ?? 0);
        if (!count) continue;
        const lcps = Array.isArray(data.lcps) ? data.lcps.map((value) => String(value).trim()).filter(Boolean) : [];
        if (selectedLcp && selectedLcp !== "all" && !lcps.some((value) => value.toLowerCase() === selectedLcp)) continue;
        const rep = resolveRep({ ...data, repUid: document.id }, roster);
        const repUid = rep?.repUid ?? String(data.repUid || document.id || "");
        const rawName = String(data.displayName || data.rawRepName || rep?.displayName || repUid || "Unassigned rep").trim();
        const key = rep ? `rep:${rep.repUid}` : `unmatched:${normalizeName(rawName)}`;
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
          teamId: String(data.teamId || rep?.teamId || "") || null,
          locationName: rep?.locationName ?? String(data.locationName || ""),
          days: Array.from({ length: dayCount }, () => 0),
          total: 0,
          accountStatuses: {},
          lcps: [],
        };
        const [year, month, day] = dateId(cursor).split("-").map(Number);
        const anchor = range.monday ?? new Date(`${range.start}T12:00:00`);
        const dayIndex = Math.max(0, Math.min(dayCount - 1, Math.round((Date.UTC(year, month - 1, day) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86_400_000)));
        group.days[dayIndex] += count;
        group.total += count;
        group.lcps = Array.from(new Set([...group.lcps, ...lcps])).sort((a, b) => a.localeCompare(b));
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
      if (filters.team && filters.team !== "all" && String(rep.teamId || "") !== filters.team) return false;
      if (filters.location && filters.location !== "all" && String(rep.locationName || "") !== filters.location) return false;
      if (filters.repId && rep.repUid !== filters.repId) return false;
      if (filters.rep && filters.rep !== "all" && String(rep.displayName || "") !== filters.rep) return false;
      if (filters.vendor && filters.vendor !== "all" && String(rep.vendorType || "unassigned") !== filters.vendor) return false;
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

    return NextResponse.json({ week: { start: range.start, end: range.end }, reps: filtered, canViewKnockHours: canViewKnockHours(actor) });
  } catch (error) {
    return errorResponse("knocks", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    const sourceOverride = String(form.get("source") ?? "auto").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File exceeds the 20 MB upload limit." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importKnockWorkbook(buffer, {
      actorUid: actor.token.uid,
      fileName: file.name,
      sourceOverride,
      contentType: file.type,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse("knocks", error);
  }
}
