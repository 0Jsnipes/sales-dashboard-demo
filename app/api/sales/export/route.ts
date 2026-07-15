import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { buildSalesExportRows, buildWorksheetData, EXCEL_DATE_FORMAT } from "@/src/lib/reports/sales-export";
import { groupAssignmentsByRep, normalizeAssignmentDoc, resolveRepLocation, type RepLocationAssignment } from "@/src/lib/reps/location-assignments";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import * as XLSX from "xlsx";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const weekStartFromDateId = (dateIdValue: string) => toDateId(startOfWeek(new Date(`${dateIdValue}T12:00:00`)));
const EXPORT_ONLY_COLUMNS = new Set([
  "Normalized Order ID",
  "Matched Rep",
  "Matched Rep UID",
  "Manager",
  "Location",
  "Vendor Type",
  "Provider",
  "Customer",
  "Outcome",
  "Status",
  "Sale Count",
  "Sale Date",
  "Install Date (Normalized)",
  "Estimated Install Date",
  "Cancellation Date",
  "Past Due",
]);

function pruneExportColumns(rows: Record<string, unknown>[]) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([key]) => !EXPORT_ONLY_COLUMNS.has(key)),
  ));
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url); const start = url.searchParams.get("start"); const end = url.searchParams.get("end"); const allTime = url.searchParams.get("allTime") === "true"; const ytd = url.searchParams.get("ytd") === "true";
    if (!allTime && (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "") || start! > end!)) return NextResponse.json({ error: "Choose a valid export date range." }, { status: 400 });
    const db = getAdminDb();
    const orders = (provider: "tfiber" | "att") => { const collection = db.collection("salesOrders").doc(provider).collection("orders"); return allTime ? collection.get() : collection.where("orderDateId", ">=", start!).where("orderDateId", "<=", end!).get(); };
    const [tfiber, att, repsSnapshot, assignmentsSnapshot] = await Promise.all([orders("tfiber"), orders("att"), db.collection("reps").get(), db.collection("repLocationAssignments").get()]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const assignmentsByRep = groupAssignmentsByRep(
      assignmentsSnapshot.docs
        .map((document) => normalizeAssignmentDoc(document.data()))
        .filter((item): item is RepLocationAssignment => item !== null),
    );
    const filters = { manager: url.searchParams.get("manager") || "all", team: url.searchParams.get("team") || "all", rep: url.searchParams.get("rep") || "all", location: url.searchParams.get("location") || "all", vendorType: url.searchParams.get("vendorType") || "all", provider: url.searchParams.get("provider") || "all" };
    const locationFor = (rep: Rep | undefined, orderDateId: string) => resolveRepLocation(rep, weekStartFromDateId(orderDateId), assignmentsByRep).locationName;
    const exported = [...tfiber.docs, ...att.docs].map((document) => {
      const order = document.data();
      const isATT = String(order.provider).toLowerCase() === "att";
      const rep = order.matchedRepUid ? roster.get(String(order.matchedRepUid)) : undefined;
      const rawRepName = isATT ? formatImportedName(order.rawRepName) : String(order.rawRepName || "");
      const displayName = rep?.displayName ?? rawRepName;
      const locationName = locationFor(rep, String(order.orderDateId));
      return {
        orderUid: String(order.orderUid || document.id),
        orderDateId: String(order.orderDateId || ""),
        provider: isATT ? "ATT" : "T-Fiber",
        providerKey: String(order.provider || ""),
        orderId: sanitizeOrderId(order.orderId || order.orderUid || document.id),
        accountStatus: String(order.accountStatus || ""),
        installationDateId: order.installationDateId ? String(order.installationDateId) : null,
        estimatedInstallationDateId: order.estimatedInstallationDateId ? String(order.estimatedInstallationDateId) : null,
        cancellationDateId: order.cancellationDateId ? String(order.cancellationDateId) : null,
        saleCount: Number(order.saleCount || 1) || 1,
        representative: displayName,
        manager: rep?.managerName ?? (isATT ? "" : String(order.rawManagerName || "")),
        location: locationName,
        vendorType: rep?.vendorType ?? "unassigned",
        rawRepName,
        rawSalesId: String(order.rawSalesId || ""),
        rawManagerName: String(order.rawManagerName || ""),
        matchedRepUid: order.matchedRepUid ? String(order.matchedRepUid) : null,
        teamId: String(order.teamId || rep?.teamId || ""),
        rawData: order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {},
      };
    }).filter((row) => (filters.manager === "all" || row.manager === filters.manager) && (filters.team === "all" || row.teamId === filters.team) && (filters.rep === "all" || row.representative === filters.rep) && (filters.location === "all" || row.location === filters.location) && (filters.vendorType === "all" || row.vendorType === filters.vendorType) && (filters.provider === "all" || row.provider.toLowerCase() === filters.provider.toLowerCase())).sort((left, right) => left.orderDateId.localeCompare(right.orderDateId) || left.representative.localeCompare(right.representative));
    const reportRows = (provider: "ATT" | "T-Fiber") => pruneExportColumns(buildSalesExportRows(exported.filter((row) => row.provider === provider).map((row) => ({
      orderUid: row.orderUid,
      orderDateId: row.orderDateId,
      provider: row.provider,
      providerKey: row.providerKey,
      orderId: row.orderId,
      rawRepName: row.rawRepName,
      rawSalesId: row.rawSalesId,
      rawManagerName: row.rawManagerName,
      matchedRepUid: row.matchedRepUid,
      accountStatus: row.accountStatus,
      installationDateId: row.installationDateId,
      estimatedInstallationDateId: row.estimatedInstallationDateId,
      cancellationDateId: row.cancellationDateId,
      saleCount: row.saleCount,
      rawData: row.rawData,
      repName: row.representative,
      managerName: row.manager,
      locationName: row.location,
      vendorType: row.vendorType,
      outcome: "",
      status: row.accountStatus,
      pastDue: false,
    }))));
    const worksheet = (rows: Record<string, unknown>[]) => {
      const data = buildWorksheetData(rows);
      return XLSX.utils.json_to_sheet(data.rows, { header: data.headers, dateNF: EXCEL_DATE_FORMAT });
    };
    const workbook = XLSX.utils.book_new();
    const attRows = reportRows("ATT");
    const tfiberRows = reportRows("T-Fiber");
    if (attRows.length) XLSX.utils.book_append_sheet(workbook, worksheet(attRows), "ATT");
    if (tfiberRows.length) XLSX.utils.book_append_sheet(workbook, worksheet(tfiberRows), "T-Fiber");
    if (!workbook.SheetNames.length) XLSX.utils.book_append_sheet(workbook, worksheet([]), "Export");
    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = allTime ? "sales-export-all-time.xlsx" : ytd ? `sales-export-ytd-${start}-to-${end}.xlsx` : `sales-export-${start}-to-${end}.xlsx`;
    return new NextResponse(file, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"` } });
  } catch (error) { return errorResponse("sales/export", error, "EXPORT_FAILED"); }
}
