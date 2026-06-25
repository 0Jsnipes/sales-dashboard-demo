import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import * as XLSX from "xlsx";

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
    const filters = { manager: url.searchParams.get("manager") || "all", rep: url.searchParams.get("rep") || "all", location: url.searchParams.get("location") || "all", vendorType: url.searchParams.get("vendorType") || "all" };
    const locationFor = (rep: Rep | undefined, orderDateId: string) => {
      if (!rep) return ""; const selectedWeek = isoWeek(orderDateId); const repAssignments = assignments.filter((item) => item.repUid === rep.repUid); const single = repAssignments.find((item) => item.mode === "single" && item.weekISO === selectedWeek);
      if (single) return String(single.locationName); const forward = repAssignments.filter((item) => item.mode === "forward" && String(item.weekISO) <= selectedWeek).sort((a, b) => String(a.weekISO).localeCompare(String(b.weekISO))).pop(); return forward ? String(forward.locationName) : rep.locationName;
    };
    const exported = [...tfiber.docs, ...att.docs].map((document) => {
      const order = document.data(); const isATT = String(order.provider).toLowerCase() === "att"; const rep = order.matchedRepUid ? roster.get(String(order.matchedRepUid)) : undefined; const rawRepName = isATT ? formatImportedName(order.rawRepName) : String(order.rawRepName || ""); const displayName = rep?.displayName ?? rawRepName; const locationName = locationFor(rep, String(order.orderDateId));
      return { orderDate: String(order.orderDateId || ""), provider: isATT ? "ATT" : "T-Fiber", orderId: sanitizeOrderId(order.orderId || order.orderUid || document.id), accountStatus: String(order.accountStatus || ""), representative: displayName, manager: rep?.managerName ?? (isATT ? "" : String(order.rawManagerName || "")), location: locationName, vendorType: rep?.vendorType ?? "unassigned", rawData: order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {} };
    }).filter((row) => (filters.manager === "all" || row.manager === filters.manager) && (filters.rep === "all" || row.representative === filters.rep) && (filters.location === "all" || row.location === filters.location) && (filters.vendorType === "all" || row.vendorType === filters.vendorType)).sort((left, right) => left.orderDate.localeCompare(right.orderDate) || left.representative.localeCompare(right.representative));
    const text = (value: unknown) => String(value ?? "").trim();
    const exportDate = (value: unknown) => {
      const source = text(value); const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/); if (iso) return `${Number(iso[2])}-${Number(iso[3])}-${iso[1]}`;
      const slash = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return slash ? `${Number(slash[1])}-${Number(slash[2])}-${slash[3]}` : value;
    };
    const sourceRows = (provider: "ATT" | "T-Fiber") => { const seen = new Set<string>(); return exported.filter((row) => { const key = `${row.orderId}::${row.orderDate}`; return row.provider === provider && !seen.has(key) && Boolean(seen.add(key)); }).map((row) => {
      const raw = Object.fromEntries(Object.entries(row.rawData).map(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        return [key, /order.*(?:id|#|number)/i.test(normalizedKey) ? sanitizeOrderId(value) : exportDate(value)];
      }));
      if (provider === "ATT") {
        const statuses = [["Video", raw["Video Status"]], ["Internet", raw["Internet Status"]], ["Voice", raw["Voice Status"]]].filter(([, status]) => text(status)).map(([service, status]) => `${service}: ${text(status)}`).join(" | ");
        const installDate = raw["Internet Install Date"] ?? raw["Video Install Date"] ?? raw["Voice Install Date"] ?? "";
        return { "Order Date": raw["Order Date"] ?? row.orderDate, "Customer / Address": raw["Customer Name"] ?? "", "Order Number": sanitizeOrderId(raw["Order ID"] ?? row.orderId), "Rep Name": row.representative, "Account Status": statuses || row.accountStatus, "Install Date": installDate, ...raw };
      }
      return raw;
    }); };
    const worksheet = (rows: Record<string, unknown>[]) => { if (rows.length === 0) return XLSX.utils.aoa_to_sheet([["No matching source rows for the selected range and filters."]]); const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]; return XLSX.utils.json_to_sheet(rows, { header: headers }); };
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet(sourceRows("ATT")), "ATT"); XLSX.utils.book_append_sheet(workbook, worksheet(sourceRows("T-Fiber")), "T-Fiber");
    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(file, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sales-export-${allTime ? "all-time" : `${start}-to-${end}`}.xlsx"` } });
  } catch (error) { const message = error instanceof Error ? error.message : "EXPORT_FAILED"; return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 }); }
}
