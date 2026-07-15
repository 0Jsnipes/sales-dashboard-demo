import { NextResponse } from "next/server";
import { errorResponse } from "@/src/lib/api/error-response";
import { canViewKnockHours, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { parseEasternDispositionTime } from "@/src/lib/knocks/date";
import { aggregateKnockHours, resolveKnockHoursRange, type KnockHoursActivity, type KnockHoursPeriod } from "@/src/lib/performance/knock-hours";
import type { Rep } from "@/src/types/rep";

export const runtime = "nodejs";

const PERIODS = new Set<KnockHoursPeriod>(["daily", "weekly", "monthly", "custom"]);

type CachedRow = { repUid?: string | null; rawData?: Record<string, unknown> };

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canViewKnockHours(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const url = new URL(request.url);
    const periodValue = url.searchParams.get("period") as KnockHoursPeriod | null;
    const period = periodValue && PERIODS.has(periodValue) ? periodValue : "weekly";
    const anchor = url.searchParams.get("anchor") ?? "";
    const end = url.searchParams.get("end") ?? "";
    const lcp = String(url.searchParams.get("lcp") ?? "all").trim().toLowerCase();
    const range = resolveKnockHoursRange(period, anchor, end);
    if (!range) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });

    const db = getAdminDb();
    const salesQuery = (provider: "att" | "tfiber" | "manual") => db.collection("salesOrders").doc(provider).collection("orders")
      .where("orderDateId", ">=", range.start)
      .where("orderDateId", "<=", range.end)
      .get();
    const [chunksSnapshot, repsSnapshot, attSales, tfiberSales, manualSales] = await Promise.all([
      db.collection("knockExportChunks").where("activityDateKey", ">=", range.start).where("activityDateKey", "<=", range.end).get(),
      db.collection("reps").get(),
      salesQuery("att"),
      salesQuery("tfiber"),
      salesQuery("manual"),
    ]);
    const activities: KnockHoursActivity[] = [];
    for (const document of chunksSnapshot.docs) {
      const data = document.data() as { source?: string; activityDateKey?: string; rows?: CachedRow[] };
      if (data.source !== "tfiber" || !data.activityDateKey) continue;
      for (const row of data.rows ?? []) {
        if (!row.repUid) continue;
        if (lcp !== "all" && String(row.rawData?.LCP ?? "").trim().toLowerCase() !== lcp) continue;
        const occurredAt = parseEasternDispositionTime(row.rawData?.["Disposition Time (Eastern)"]);
        if (!occurredAt) continue;
        activities.push({ repUid: row.repUid, dateId: data.activityDateKey, occurredAt });
      }
    }

    const reps = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const salesByRep = new Map<string, number>();
    for (const document of [...attSales.docs, ...tfiberSales.docs, ...manualSales.docs]) {
      const data = document.data();
      const repUid = String(data.matchedRepUid ?? "").trim();
      if (!repUid) continue;
      salesByRep.set(repUid, (salesByRep.get(repUid) ?? 0) + (Number(data.saleCount ?? 1) || 1));
    }
    const rows = aggregateKnockHours(activities).map((row) => {
      const rep = reps.get(row.repUid);
      return {
        ...row,
        sales: salesByRep.get(row.repUid) ?? 0,
        displayName: rep?.displayName ?? row.repUid,
        managerName: rep?.managerName ?? "",
        teamId: rep?.teamId ?? null,
        locationName: rep?.locationName ?? "",
        vendorType: rep?.vendorType ?? "unassigned",
      };
    });
    return NextResponse.json({ period, range, rows });
  } catch (error) {
    return errorResponse("performance/knock-hours", error);
  }
}
