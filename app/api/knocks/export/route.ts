import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { parseCommonFilters, toDateId } from "@/src/lib/api/report-filters";
import { buildRepSearchIndex, normalizeEmail, normalizeName, normalizeSalesId } from "@/src/lib/matching/normalize";
import { buildWorksheetData } from "@/src/lib/reports/sales-export";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeProvider(value: unknown) {
  const source = text(value).toLowerCase();
  if (source === "att" || source === "at&t") return "att";
  if (source === "tfiber" || source === "t-fiber" || source === "t-mobile fiber" || source === "tmobile fiber") return "tfiber";
  return source;
}

function resolveRep(row: Record<string, unknown>, roster: Map<string, Rep>) {
  const repUid = text(row.repUid);
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

function currentMonth() {
  const today = new Date();
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
}

function buildRange(searchParams: URLSearchParams, rangeMode: string | null) {
  const from = searchParams.get("from") || searchParams.get("start");
  const to = searchParams.get("to") || searchParams.get("end");
  const weekStart = searchParams.get("weekStart");
  if (from && to) return { start: from, end: to };
  if (rangeMode === "mtd") {
    const { start, end } = currentMonth();
    return { start: toDateId(start), end: toDateId(end) };
  }
  const { monday, sunday } = currentWeek(weekStart);
  return { start: weekStart ?? toDateId(monday), end: toDateId(sunday) };
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const range = buildRange(url.searchParams, url.searchParams.get("range"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end) || range.start > range.end) {
      return NextResponse.json({ error: "Choose a valid export date range." }, { status: 400 });
    }

    const db = getAdminDb();
    const repsSnapshot = await db.collection("reps").get();
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const teamNames = new Map((await db.collection("teams").get()).docs.map((document) => [document.id, String(document.data().name || "Archived team")]));
    const selectedProvider = normalizeProvider(filters.provider);
    const selectedLcp = text(filters.lcp).toLowerCase();
    const rows: Record<string, unknown>[] = [];

    const start = new Date(`${range.start}T12:00:00`);
    const end = new Date(`${range.end}T12:00:00`);
    const dailyDateIds: string[] = [];
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dailyDateIds.push(toDateId(cursor));
    const dailySnapshots = await Promise.all(dailyDateIds.map((dailyDateId) => db.collection("knockDaily").doc(dailyDateId).collection("reps").get()));

    for (const [dayIndex, daily] of dailySnapshots.entries()) {
      const dateId = dailyDateIds[dayIndex]!;
      for (const document of daily.docs) {
        const data = document.data() as Record<string, unknown>;
        const lcps = Array.isArray(data.lcps) ? data.lcps.map((value) => String(value).trim()).filter(Boolean) : [];
        if (selectedLcp && selectedLcp !== "all" && !lcps.some((value) => value.toLowerCase() === selectedLcp)) continue;

        const attKnocks = Number(data.attKnocks ?? 0);
        const tfiberKnocks = Number(data.tfiberKnocks ?? 0);
        const totalKnocks = Number(data.knocks ?? data.count ?? attKnocks + tfiberKnocks);
        const provider = attKnocks && tfiberKnocks ? "Mixed" : attKnocks ? "ATT" : tfiberKnocks ? "T-Fiber" : "Unknown";
        if (selectedProvider === "att" && !attKnocks) continue;
        if (selectedProvider === "tfiber" && !tfiberKnocks) continue;
        if (!totalKnocks) continue;

        const rep = resolveRep({ ...data, repUid: document.id }, roster);
        const repName = rep?.displayName || text(data.displayName || data.rawRepName) || "Unmatched rep";
        const managerName = rep?.managerName || text(data.managerName) || "";
        const locationName = rep?.locationName || text(data.locationName) || "";
        const vendorType = text(rep?.vendorType || "unassigned");
        const teamId = text(data.teamId || rep?.teamId);
        const teamName = teamNames.get(teamId) || (teamId ? "Archived team" : "No team");

        if (filters.manager && filters.manager !== "all" && managerName !== filters.manager) continue;
        if (filters.team && filters.team !== "all" && teamId !== filters.team) continue;
        if (filters.location && filters.location !== "all" && locationName !== filters.location) continue;
        if (filters.repId && rep?.repUid !== filters.repId) continue;
        if (filters.rep && filters.rep !== "all" && repName !== filters.rep) continue;
        if (filters.vendor && filters.vendor !== "all" && vendorType !== filters.vendor) continue;

        const term = text(filters.search).toLowerCase();
        if (term) {
          const haystack = [
            repName,
            managerName,
            locationName,
            text(data.rawSalesId),
            text(data.customer || data["Customer Name"]),
            text(data["Customer / Address"] || data.Address || data["Service Address"]),
            provider,
            lcps.join(" "),
          ].join(" ").toLowerCase();
          if (!haystack.includes(term)) continue;
        }

        rows.push({
          Date: dateId,
          Rep: repName,
          Manager: managerName,
          Team: teamName,
          Location: locationName,
          Provider: provider,
          "Vendor Type": vendorType,
          "ATT Knocks": attKnocks,
          "T-Fiber Knocks": tfiberKnocks,
          "Total Knocks": totalKnocks,
          LCPs: lcps.join(", "),
          "Order ID": text(data.orderId),
          Status: text(data.accountStatus || "Recorded"),
          Customer: text(data.customer || data["Customer Name"]),
          Address: text(data["Customer / Address"] || data.Address || data["Service Address"]),
        });
      }
    }

    rows.sort((left, right) => text(left.Date).localeCompare(text(right.Date)) || text(left.Rep).localeCompare(text(right.Rep)));
    const worksheetData = buildWorksheetData(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(worksheetData.rows, { header: worksheetData.headers }), "Knocks");
    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="knocks-export-${range.start}-to-${range.end}.xlsx"`,
      },
    });
  } catch (error) {
    return errorResponse("knocks/export", error, "EXPORT_FAILED");
  }
}
