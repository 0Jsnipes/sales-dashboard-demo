import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { buildSourceExportRows, buildSourceWorksheetData } from "@/src/lib/reports/sales-export";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const isoWeek = (dateIdValue: string) => { const [year, month, day] = dateIdValue.split("-").map(Number); const value = new Date(Date.UTC(year, month - 1, day)); value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1)); const week = Math.ceil((((value.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7); return value.getUTCFullYear() + "-W" + String(week).padStart(2, "0"); };

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url); const start = url.searchParams.get("start"); const end = url.searchParams.get("end"); const allTime = url.searchParams.get("allTime") === "true";
    if (!allTime && (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "") || start! > end!)) return NextResponse.json({ error: "Choose a valid export date range." }, { status: 400 });
    const db = getAdminDb();
    const orders = (provider: "tfiber" | "att") => { const collection = db.collection("salesOrders").doc(provider).collection("orders"); return allTime ? collection.get() : collection.where("orderDateId", ">=", start!).where("orderDateId", "<=", end!).get(); };
    const [tfiber, att, repsSnapshot, assignmentsSnapshot] = await Promise.all([orders("tfiber"), orders("att"), db.collection("reps").get(), db.collection("repLocationAssignments").get()]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep])); const assignments = assignmentsSnapshot.docs.map((document) => document.data());
    const filters = { manager: url.searchParams.get("manager") || "all", rep: url.searchParams.get("rep") || "all", location: url.searchParams.get("location") || "all", vendorType: url.searchParams.get("vendorType") || "all", provider: url.searchParams.get("provider") || "all" };
    const locationFor = (rep: Rep | undefined, orderDateId: string) => {
      if (!rep) return ""; const selectedWeek = isoWeek(orderDateId); const repAssignments = assignments.filter((item) => item.repUid === rep.repUid); const single = repAssignments.find((item) => item.mode === "single" && item.weekISO === selectedWeek);
      if (single) return String(single.locationName); const forward = repAssignments.filter((item) => item.mode === "forward" && String(item.weekISO) <= selectedWeek).sort((a, b) => String(a.weekISO).localeCompare(String(b.weekISO))).pop(); return forward ? String(forward.locationName) : rep.locationName;
    };
    const exported = [...tfiber.docs, ...att.docs].map((document) => {
      const order = document.data();
      const isATT = String(order.provider).toLowerCase() === "att";
      const rep = order.matchedRepUid ? roster.get(String(order.matchedRepUid)) : undefined;
      const rawRepName = isATT ? formatImportedName(order.rawRepName) : String(order.rawRepName || "");
      const displayName = rep?.displayName ?? rawRepName;
      const locationName = locationFor(rep, String(order.orderDateId));
      return {
        orderDate: String(order.orderDateId || ""),
        provider: isATT ? "ATT" : "T-Fiber",
        orderId: sanitizeOrderId(order.orderId || order.orderUid || document.id),
        accountStatus: String(order.accountStatus || ""),
        representative: displayName,
        manager: rep?.managerName ?? (isATT ? "" : String(order.rawManagerName || "")),
        location: locationName,
        vendorType: rep?.vendorType ?? "unassigned",
        rawData: order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {},
      };
    }).filter((row) => (filters.manager === "all" || row.manager === filters.manager) && (filters.rep === "all" || row.representative === filters.rep) && (filters.location === "all" || row.location === filters.location) && (filters.vendorType === "all" || row.vendorType === filters.vendorType) && (filters.provider === "all" || row.provider.toLowerCase() === filters.provider.toLowerCase())).sort((left, right) => left.orderDate.localeCompare(right.orderDate) || left.representative.localeCompare(right.representative));
    const sourceRows = (provider: "ATT" | "T-Fiber") => buildSourceExportRows(exported.filter((row) => row.provider === provider).map((row) => ({ provider, rawData: row.rawData })));
    const worksheet = (rows: Record<string, unknown>[]) => {
      const data = buildSourceWorksheetData(rows);
      return XLSX.utils.json_to_sheet(data.rows, { header: data.headers });
    };
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet(sourceRows("ATT")), "ATT"); XLSX.utils.book_append_sheet(workbook, worksheet(sourceRows("T-Fiber")), "T-Fiber");
    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(file, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sales-export-${allTime ? "all-time" : `${start}-to-${end}`}.xlsx"` } });
  } catch (error) { const message = error instanceof Error ? error.message : "EXPORT_FAILED"; return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 }); }
}
