import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import * as XLSX from "xlsx";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { reactivateInactiveRepsForMatchedSales } from "@/src/lib/reps/lifecycle";
import type { Rep } from "@/src/types/rep";
import { parseCommonFilters, parseDateRangeParams, toDateId } from "@/src/lib/api/report-filters";
import { detectKnockSource } from "@/src/lib/knocks/source-detection";
import { parseAttSalesRabbitKnockRows, parseTFiberKnockRows } from "@/src/lib/knocks/parse";
import { getAdminApp } from "@/src/lib/firebase/admin";
import { normalizeRepName } from "@/src/lib/knocks/matching";
import { buildRepSearchIndex, normalizeEmail, normalizeSalesId, normalizeName } from "@/src/lib/matching/normalize";
import { expectedKnockImportFileLabel, validateKnockImportFileName } from "@/src/lib/imports/file-conventions";
import type { KnockSource } from "@/src/lib/knocks/types";

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

function normalizeProvider(value: unknown) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "att" || source === "at&t") return "att";
  if (source === "tfiber" || source === "t-fiber" || source === "t-mobile fiber" || source === "tmobile fiber") return "tfiber";
  return source;
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
    const selectedProvider = normalizeProvider(filters.provider);
    const selectedLcp = String(filters.lcp || "").trim().toLowerCase();
    for (let offset = 0; offset < dayCount; offset += 1) {
      const cursor = new Date(`${range.start}T12:00:00`);
      cursor.setDate(cursor.getDate() + offset);
      const daily = await db.collection("knockDaily").doc(dateId(cursor)).collection("reps").get();
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

    return NextResponse.json({ week: { start: range.start, end: range.end }, reps: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
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
    const uploadId = randomUUID();
    const storagePath = `imports/knocks/${uploadId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await getStorage(getAdminApp()).bucket().file(storagePath).save(buffer, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", metadata: { metadata: { uploadId, uploadedBy: actor.token.uid } } });
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return NextResponse.json({ error: "The workbook does not contain a worksheet." }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true }).filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));
    const source = (sourceOverride === "auto" || !sourceOverride ? detectKnockSource(Object.keys(rows[0] ?? {})) : sourceOverride) as KnockSource | null;
    if (!source) return NextResponse.json({ error: "Unable to detect knock source from workbook headers." }, { status: 400 });
    if (!validateKnockImportFileName(source, file.name)) return NextResponse.json({ error: `Knock files for ${source === "att_salesrabbit" ? "ATT" : "T-Fiber"} must follow the ${expectedKnockImportFileLabel(source)} naming format.` }, { status: 400 });
    const repsSnapshot = await getAdminDb().collection("reps").get();
    const reps = repsSnapshot.docs.map((document) => document.data() as Rep);
    const parsed = source === "att_salesrabbit" ? parseAttSalesRabbitKnockRows(rows, reps) : parseTFiberKnockRows(rows, reps);
    const db = getAdminDb();
    const knockDaily = db.collection("knockDaily");
    const repMap = new Map(reps.map((rep) => [rep.repUid, rep]));
    const inactiveRepUids = new Set(reps.filter((rep) => rep.status === "inactive").map((rep) => rep.repUid));
    const dayTotals = new Map<string, Map<string, { knocks: number; attKnocks: number; tfiberKnocks: number; source: string; rawRepName: string; rawSalesId: string; managerName: string; locationName: string; lcps: Set<string> }>>();
    for (const row of parsed.rows) {
      const day = row.activityDateKey;
      const repUid = row.repId ?? `unmatched:${normalizeRepName(row.repName)}`;
      const rep = row.repId ? repMap.get(row.repId) : undefined;
      const byRep = dayTotals.get(day) ?? new Map();
      const current = byRep.get(repUid) ?? { knocks: 0, attKnocks: 0, tfiberKnocks: 0, source, rawRepName: row.repName, rawSalesId: row.sourceRepExternalId ?? "", managerName: rep?.managerName ?? "", locationName: rep?.locationName ?? "", lcps: new Set<string>() };
      const count = Number(row.quantity || 1);
      current.knocks += count;
      if (row.provider === "ATT") current.attKnocks += count;
      if (row.provider === "T-Fiber") current.tfiberKnocks += count;
      if (row.provider === "T-Fiber" && row.lcp) current.lcps.add(String(row.lcp).trim());
      if (!rep && row.repName && row.repName.length < current.rawRepName.length) current.rawRepName = row.repName;
      byRep.set(repUid, current);
      dayTotals.set(day, byRep);
    }
    const existingKnockCountsByRepDay = new Map<string, number>();
    for (const day of dayTotals.keys()) {
      const snapshot = await knockDaily.doc(day).collection("reps").get();
      for (const document of snapshot.docs) {
        const repUid = String(document.id || "").trim();
        if (!repUid || !inactiveRepUids.has(repUid)) continue;
        const data = document.data();
        existingKnockCountsByRepDay.set(`${repUid}::${day}`, Number(data.knocks ?? data.count ?? 0));
      }
    }
    const newlyActiveKnockRepUids = new Set<string>();
    for (const [day, repsForDay] of dayTotals.entries()) {
      const existingSnapshot = await knockDaily.doc(day).collection("reps").get();
      const existingByRepUid = new Map(existingSnapshot.docs.map((document) => [document.id, document]));
      const repUidsForDay = new Set<string>([...existingByRepUid.keys(), ...repsForDay.keys()]);
      const batch = db.batch();
      for (const repUid of repUidsForDay) {
        const data = repsForDay.get(repUid) ?? { knocks: 0, attKnocks: 0, tfiberKnocks: 0, source, rawRepName: "", rawSalesId: "", managerName: "", locationName: "", lcps: new Set<string>() };
        const existing = existingByRepUid.get(repUid)?.data() as Record<string, unknown> | undefined;
        const nextAttKnocks = source === "att_salesrabbit" ? Number(data.attKnocks || 0) : Number(existing?.attKnocks ?? 0);
        const nextTFiberKnocks = source === "tfiber" ? Number(data.tfiberKnocks || 0) : Number(existing?.tfiberKnocks ?? 0);
        const nextKnocks = nextAttKnocks + nextTFiberKnocks;
        if (inactiveRepUids.has(repUid) && nextKnocks > 0) {
          const repDayKey = `${repUid}::${day}`;
          const existingCount = existingKnockCountsByRepDay.get(repDayKey) ?? 0;
          if (existingCount <= 0 && Number(data.knocks || 0) > 0) {
            newlyActiveKnockRepUids.add(repUid);
            existingKnockCountsByRepDay.set(repDayKey, nextKnocks);
          }
        }
        const ref = knockDaily.doc(day).collection("reps").doc(repUid);
        const rep = repMap.get(repUid);
        const nextLcps = source === "tfiber"
          ? Array.from(data.lcps)
          : Array.isArray(existing?.lcps)
            ? existing.lcps.map((value) => String(value).trim()).filter(Boolean)
            : [];
        const payload: Record<string, unknown> = {
          repUid,
          displayName: rep?.displayName ?? String(existing?.displayName || data.rawRepName || repUid),
          rawRepName: data.rawRepName || String(existing?.rawRepName || ""),
          rawSalesId: data.rawSalesId || String(existing?.rawSalesId || ""),
          source,
          sourceUploadId: uploadId,
          managerName: rep?.managerName ?? data.managerName ?? String(existing?.managerName || ""),
          locationName: rep?.locationName ?? data.locationName ?? String(existing?.locationName || ""),
          attKnocks: nextAttKnocks,
          tfiberKnocks: nextTFiberKnocks,
          knocks: nextKnocks,
          count: nextKnocks,
          lcps: nextLcps,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!existing) payload.createdAt = FieldValue.serverTimestamp();
        batch.set(ref, payload, { merge: true });
      }
      await batch.commit();
    }
    const repsReactivated = await reactivateInactiveRepsForMatchedSales(newlyActiveKnockRepUids, db, "system:matched-knock-import");
    await db.collection("uploadRuns").doc(uploadId).set({
      uploadId,
      type: "knockImport",
      fileName: file.name,
      storagePath,
      uploadedBy: actor.token.uid,
      uploadedAt: FieldValue.serverTimestamp(),
      rowsRead: parsed.summary.totalRowsSeen,
      rowsValid: parsed.summary.validRows,
      rowsSkipped: parsed.summary.skippedRows,
      rowsMatched: parsed.summary.matchedRows,
      rowsUnmatched: parsed.summary.unmatchedRows,
      status: "complete",
      summary: { source, knockCount: parsed.summary.totalKnocks, repsReactivated },
    }, { merge: true });
    return NextResponse.json({ ok: true, uploadId, storagePath, summary: { ...parsed.summary, repsReactivated } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
