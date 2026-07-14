import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import { buildYtdWeeklySalesPivotWorkbook, type YtdPivotInputRow } from "@/src/lib/exports/ytdWeeklyPivotExport";
import { groupAssignmentsByRep, normalizeAssignmentDoc, resolveRepLocation, type RepLocationAssignment } from "@/src/lib/reps/location-assignments";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const weekStartFromDateId = (dateIdValue: string) => toDateId(startOfWeek(new Date(`${dateIdValue}T12:00:00`)));

function providerKey(value: unknown) {
  const source = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (source === "att" || source.includes("att")) return "att";
  if (source === "tfiber" || source.includes("tfiber")) return "tfiber";
  return "other";
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const selectedYear = Number(url.searchParams.get("year") || new Date().getFullYear());
    if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) {
      return NextResponse.json({ error: "Choose a valid year." }, { status: 400 });
    }

    const start = `${selectedYear}-01-01`;
    const end = `${selectedYear}-12-31`;
    const db = getAdminDb();
    const getOrders = (provider: "att" | "tfiber") =>
      db.collection("salesOrders").doc(provider).collection("orders")
        .where("orderDateId", ">=", start)
        .where("orderDateId", "<=", end)
        .get();

    const [attSnapshot, tfiberSnapshot, repsSnapshot, assignmentsSnapshot] = await Promise.all([
      getOrders("att"),
      getOrders("tfiber"),
      db.collection("reps").get(),
      db.collection("repLocationAssignments").get(),
    ]);

    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const assignmentsByRep = groupAssignmentsByRep(
      assignmentsSnapshot.docs
        .map((document) => normalizeAssignmentDoc(document.data()))
        .filter((item): item is RepLocationAssignment => item !== null),
    );

    const locationFor = (rep: Rep | undefined, orderDateId: string) => resolveRepLocation(rep, weekStartFromDateId(orderDateId), assignmentsByRep).locationName;

    const toRow = (document: FirebaseFirestore.QueryDocumentSnapshot, fallbackProvider: "ATT" | "T-Fiber", originalRowNumber: number): YtdPivotInputRow => {
      const order = document.data();
      const normalizedProviderKey = providerKey(order.provider);
      const provider = normalizedProviderKey === "att" ? "ATT" : fallbackProvider;
      const rep = order.matchedRepUid ? roster.get(String(order.matchedRepUid)) : undefined;
      return {
        orderDateId: String(order.orderDateId || ""),
        provider,
        providerKey: String(order.provider || provider),
        representative: rep?.displayName ?? (provider === "ATT" ? formatImportedName(order.rawRepName) : String(order.rawRepName || "")),
        repName: rep?.displayName ?? String(order.rawRepName || ""),
        rawRepName: String(order.rawRepName || ""),
        location: locationFor(rep, String(order.orderDateId || "")),
        locationName: locationFor(rep, String(order.orderDateId || "")),
        rawData: order.rawData && typeof order.rawData === "object" ? {
          ...order.rawData as Record<string, unknown>,
          "Order ID": sanitizeOrderId(order.orderId || order.orderUid || document.id),
        } : { "Order ID": sanitizeOrderId(order.orderId || order.orderUid || document.id) },
        source: "Sales Orders",
        originalSheet: provider,
        originalRowNumber,
      };
    };

    const rows = [
      ...attSnapshot.docs.map((document, index) => toRow(document, "ATT", index + 1)),
      ...tfiberSnapshot.docs.map((document, index) => toRow(document, "T-Fiber", attSnapshot.size + index + 1)),
    ];

    const workbook = buildYtdWeeklySalesPivotWorkbook({
      rows,
      selectedYear,
      fileNamePrefix: "Dashboard",
    });

    return new NextResponse(workbook.buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${workbook.fileName}"`,
      },
    });
  } catch (error) {
    return errorResponse("overview/export-ytd-pivot", error, "EXPORT_FAILED");
  }
}
