import { FieldValue } from "firebase-admin/firestore";
import Papa from "papaparse";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { matchImportRowToRep } from "@/src/lib/matching/matchRep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { loadSaleMatchableReps, reactivateInactiveRepsForMatchedSales } from "@/src/lib/reps/lifecycle";
import type { Rep } from "@/src/types/rep";

type RawRow = Record<string, string | null | undefined>;
type ServiceName = "Video" | "Internet" | "Wireless";
const services: Array<{ name: ServiceName; modernPackage: string; modernStatus: string; legacyPackage: string; legacyStatus: string }> = [
  { name: "Video", modernPackage: "Video_Package", modernStatus: "Video_CurrentStatus", legacyPackage: "Video Package", legacyStatus: "Video Status" },
  { name: "Internet", modernPackage: "Internet_Package", modernStatus: "Internet_CurrentStatus", legacyPackage: "Internet Package", legacyStatus: "Internet Status" },
  { name: "Wireless", modernPackage: "Wireless_Package", modernStatus: "Wireless_CurrentStatus", legacyPackage: "Wireless Package", legacyStatus: "Wireless Status" },
];

const orderCollection = () => getAdminDb().collection("salesOrders").doc("att").collection("orders");
const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const text = (value: unknown) => String(value ?? "").trim();
const valueFor = (row: RawRow, modern: string, legacy: string) => text(row[modern] ?? row[legacy]);
// Some ATT exports contain intentionally blank column headings. Firestore field names cannot be empty,
// so retain every meaningful source field while dropping those unnamed spacer columns.
const serializableRow = (row: RawRow) => Object.fromEntries(Object.entries(row).filter(([key]) => key.trim().length > 0).map(([key, value]) => [key, value ?? null]));
const dateId = (value: unknown) => {
  const source = text(value);
  const parts = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) return `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const parsed = new Date(source);
  return Number.isNaN(parsed.valueOf()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const rowOrderId = (row: RawRow) => text(row.STIOrderNum ?? row["STI Order Num"] ?? row.OrderID ?? row["Order ID"]);
const rowDate = (row: RawRow) => text(row.OrderDate ?? row["Order Date"]);
const rowRepName = (row: RawRow) => text(row.SalespersonName ?? row.Salesperson ?? row.UserName ?? row["User Name"]);
const packageCount = (serviceDetails: Array<{ packageName: string }>) => serviceDetails.filter((item) => Boolean(item.packageName)).length;

export function parseATTReport(buffer: Buffer): RawRow[] {
  const result = Papa.parse<RawRow>(buffer.toString("utf8"), { header: true, skipEmptyLines: true });
  if (result.errors.length) throw new Error(`Unable to read ATT CSV: ${result.errors[0]?.message ?? "unknown CSV error"}.`);
  const first = result.data[0] ?? {};
  if (!("OrderID" in first || "Order ID" in first) || !("OrderDate" in first || "Order Date" in first)) throw new Error("This is not an ATT order export. Missing Order ID or Order Date.");
  if (!services.some((service) => service.modernPackage in first || service.legacyPackage in first)) throw new Error("This ATT export does not include Video, Internet, or Wireless package columns.");
  return result.data;
}

export async function importATTRows({ rows, uploadId, actorUid, fileName, storagePath }: { rows: RawRow[]; uploadId: string; actorUid: string; fileName: string; storagePath: string }) {
  const db = getAdminDb();
  const reps = await loadSaleMatchableReps(db);
  const inactiveRepUids = new Set(reps.filter((rep) => rep.status === "inactive").map((rep) => rep.repUid));
  const [existingAtt, existingTFiber, existingManual] = await Promise.all([
    orderCollection().get(),
    db.collection("salesOrders").doc("tfiber").collection("orders").get(),
    db.collection("salesOrders").doc("manual").collection("orders").get(),
  ]);
  const existing = new Map(existingAtt.docs.map((document) => [document.id, document.data()]));
  const existingSalesDaysByRep = new Set<string>();
  for (const document of [...existingAtt.docs, ...existingTFiber.docs, ...existingManual.docs]) {
    const data = document.data();
    const repUid = String(data.matchedRepUid || "").trim();
    const orderDateId = String(data.orderDateId || "").trim();
    if (!repUid || !orderDateId || !inactiveRepUids.has(repUid)) continue;
    if (Number(data.saleCount || 1) <= 0) continue;
    existingSalesDaysByRep.add(`${repUid}::${orderDateId}`);
  }
  const canonical = new Map<string, { orderUid: string; data: Record<string, unknown>; unmatched: boolean }>();
  const newlyMatchedInactiveRepUids = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    const orderId = rowOrderId(row); const orderDateId = dateId(rowDate(row));
    if (!orderId || !orderDateId) { skipped++; continue; }
    const serviceDetails = services
      .map((service) => ({
        name: service.name,
        packageName: valueFor(row, service.modernPackage, service.legacyPackage),
        status: valueFor(row, service.modernStatus, service.legacyStatus),
        installationDateId: dateId(row[`${service.name}_InstallDate`] ?? row[`${service.name} Install Date`]),
        cancellationDateId: dateId(row[`${service.name}_CancelDate`] ?? row[`${service.name} Cancel Date`]),
      }))
      .filter((item) => Boolean(item.packageName || item.status));
    if (!serviceDetails.length) continue;
    const orderUid = orderId;
    if (!orderUid) { skipped++; continue; }
    const previous = existing.get(orderUid);
    const rawRepName = formatImportedName(rowRepName(row));
    const result = previous?.lockedAssignment ? { repUid: previous.matchedRepUid as string | null, method: previous.matchMethod as string | null } : matchImportRowToRep({ rawRepName }, reps);
    const isMatched = Boolean(result.repUid);
    if (result.repUid && inactiveRepUids.has(result.repUid)) {
      const repDayKey = `${result.repUid}::${orderDateId}`;
      if (!existingSalesDaysByRep.has(repDayKey)) {
        newlyMatchedInactiveRepUids.add(result.repUid);
        existingSalesDaysByRep.add(repDayKey);
      }
    }
    const saleCount = packageCount(serviceDetails);
    const packageName = serviceDetails.map((item) => item.packageName).filter(Boolean).join(" | ");
    const accountStatus = serviceDetails.map((item) => item.status).filter(Boolean).join(" | ") || "Unknown";
    const installationDateId = serviceDetails.find((item) => item.installationDateId)?.installationDateId ?? "";
    const cancellationDateId = serviceDetails.find((item) => item.cancellationDateId)?.cancellationDateId ?? "";
    const matchedRep = result.repUid ? reps.find((rep) => rep.repUid === result.repUid) : undefined;
    canonical.set(orderUid, { orderUid, unmatched: !isMatched, data: {
      orderUid, orderId, provider: "att", serviceType: "att", packageName, sourceUploadId: uploadId,
      orderDate: rowDate(row), orderDateId, saleCount, rawRepName, rawSalesId: "", rawManagerName: "",
      matchedRepUid: result.repUid, teamId: matchedRep?.teamId ?? null, matchStatus: isMatched ? (result.method === "manual" ? "manual" : "matched") : "unmatched", matchMethod: result.method ?? null, lockedAssignment: Boolean(previous?.lockedAssignment),
      accountStatus, installationDateId, cancellationDateId, rawData: serializableRow(row),
      createdAt: previous?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }});
  }
  const orders = [...canonical.values()];
  const totalSales = orders.reduce((sum, order) => sum + Number(order.data.saleCount || 0), 0);
  const matchedSales = orders.reduce((sum, order) => sum + (order.unmatched ? 0 : Number(order.data.saleCount || 0)), 0);
  // ATT rows carry a wide audit payload. Keep commits deliberately small so a historical export
  // remains below Firestore's 10 MiB atomic-write limit.
  for (const group of chunks(orders, 40)) {
    const batch = db.batch();
    for (const order of group) {
      batch.set(orderCollection().doc(order.orderUid), order.data, { merge: true });
      if (order.unmatched) {
        const ref = db.collection("unmatchedImports").doc(`${uploadId}-att-${order.orderUid}`);
        batch.set(ref, { unmatchedId: ref.id, uploadId, provider: "att", rawRepName: order.data.rawRepName, rawSalesId: "", rawData: order.data.rawData, suggestedRepUids: [], resolvedRepUid: null, status: "open", createdAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    await batch.commit();
  }
  const unmatchedSales = totalSales - matchedSales;
  const repsReactivated = await reactivateInactiveRepsForMatchedSales(newlyMatchedInactiveRepUids, db);
  await db.collection("uploadRuns").doc(uploadId).set({ uploadId, type: "attSales", fileName, storagePath, uploadedBy: actorUid, uploadedAt: FieldValue.serverTimestamp(), rowsRead: rows.length, rowsValid: totalSales, rowsSkipped: skipped, rowsMatched: matchedSales, rowsUnmatched: unmatchedSales, selectedDateIds: [], status: "complete", errors: [], summary: { provider: "att", saleCount: totalSales } }, { merge: true });
  return { rowsRead: rows.length, rowsImported: totalSales, rowsSkipped: skipped, rowsMatched: matchedSales, rowsUnmatched: unmatchedSales, repsReactivated };
}

export async function rematchATTOrdersForRep(rep: Rep) {
  const snapshot = await orderCollection().where("matchStatus", "==", "unmatched").get();
  const candidates = snapshot.docs.filter((document) => Boolean(matchImportRowToRep({ rawRepName: document.data().rawRepName }, [rep]).repUid));
  for (const group of chunks(candidates, 400)) {
    const batch = getAdminDb().batch();
    for (const document of group) {
      const result = matchImportRowToRep({ rawRepName: document.data().rawRepName }, [rep]);
      batch.update(document.ref, { matchedRepUid: rep.repUid, matchStatus: "matched", matchMethod: result.method, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  if (candidates.length && rep.status === "inactive") await reactivateInactiveRepsForMatchedSales([rep.repUid]);
  return candidates.length;
}
