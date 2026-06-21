import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { matchImportRowToRep } from "@/src/lib/matching/matchRep";
import { formatImportedName } from "@/src/lib/matching/display-name";
import type { Rep } from "@/src/types/rep";

type RawRow = Record<string, string | null | undefined>;
type ServiceName = "Video" | "Internet" | "Voice";
const Papa = require("papaparse") as { parse: <T>(input: string, config: { header: boolean; skipEmptyLines: boolean }) => { data: T[]; errors: Array<{ message: string }> } };

const services: Array<{ name: ServiceName; modernPackage: string; modernStatus: string; legacyPackage: string; legacyStatus: string }> = [
  { name: "Video", modernPackage: "Video_Package", modernStatus: "Video_CurrentStatus", legacyPackage: "Video Package", legacyStatus: "Video Status" },
  { name: "Internet", modernPackage: "Internet_Package", modernStatus: "Internet_CurrentStatus", legacyPackage: "Internet Package", legacyStatus: "Internet Status" },
  { name: "Voice", modernPackage: "Voice_Package", modernStatus: "Voice_CurrentStatus", legacyPackage: "Voice Package", legacyStatus: "Voice Status" },
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
const rowOrderId = (row: RawRow) => text(row.OrderID ?? row["Order ID"]);
const rowDate = (row: RawRow) => text(row.OrderDate ?? row["Order Date"]);
const rowRepName = (row: RawRow) => text(row.SalespersonName ?? row.Salesperson ?? row.UserName ?? row["User Name"]);
const documentId = (orderId: string, service: ServiceName) => `${encodeURIComponent(orderId)}--${service.toLowerCase()}`;

export function parseATTReport(buffer: Buffer): RawRow[] {
  const result = Papa.parse<RawRow>(buffer.toString("utf8"), { header: true, skipEmptyLines: true });
  if (result.errors.length) throw new Error(`Unable to read ATT CSV: ${result.errors[0]?.message ?? "unknown CSV error"}.`);
  const first = result.data[0] ?? {};
  if (!("OrderID" in first || "Order ID" in first) || !("OrderDate" in first || "Order Date" in first)) throw new Error("This is not an ATT order export. Missing Order ID or Order Date.");
  if (!services.some((service) => service.modernPackage in first || service.legacyPackage in first)) throw new Error("This ATT export does not include Video, Internet, or Voice package columns.");
  return result.data;
}

export async function importATTRows({ rows, uploadId, actorUid, fileName, storagePath }: { rows: RawRow[]; uploadId: string; actorUid: string; fileName: string; storagePath: string }) {
  const db = getAdminDb();
  const reps = (await db.collection("reps").where("status", "==", "active").get()).docs.map((document) => document.data() as Rep);
  const existing = new Map((await orderCollection().get()).docs.map((document) => [document.id, document.data()]));
  const canonical = new Map<string, { orderUid: string; data: Record<string, unknown>; unmatched: boolean }>();
  let skipped = 0; let matched = 0;
  for (const row of rows) {
    const orderId = rowOrderId(row); const orderDateId = dateId(rowDate(row));
    if (!orderId || !orderDateId) { skipped++; continue; }
    for (const service of services) {
      const packageName = valueFor(row, service.modernPackage, service.legacyPackage);
      if (!packageName) continue;
      const orderUid = documentId(orderId, service.name); const previous = existing.get(orderUid);
      const rawRepName = formatImportedName(rowRepName(row));
      const result = previous?.lockedAssignment ? { repUid: previous.matchedRepUid as string | null, method: previous.matchMethod as string | null } : matchImportRowToRep({ rawRepName }, reps);
      const isMatched = Boolean(result.repUid); if (isMatched) matched++;
      canonical.set(orderUid, { orderUid, unmatched: !isMatched, data: {
        orderUid, orderId, provider: "att", serviceType: service.name.toLowerCase(), packageName, sourceUploadId: uploadId,
        orderDate: rowDate(row), orderDateId, saleCount: 1, rawRepName, rawSalesId: "", rawManagerName: "",
        matchedRepUid: result.repUid, matchStatus: isMatched ? (result.method === "manual" ? "manual" : "matched") : "unmatched", matchMethod: result.method ?? null, lockedAssignment: Boolean(previous?.lockedAssignment),
        accountStatus: valueFor(row, service.modernStatus, service.legacyStatus), installationDateId: dateId(row[`${service.name}_InstallDate`] ?? row[`${service.name} Install Date`]), cancellationDateId: dateId(row[`${service.name}_CancelDate`] ?? row[`${service.name} Cancel Date`]), rawData: serializableRow(row),
        createdAt: previous?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }});
    }
  }
  const orders = [...canonical.values()];
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
  const unmatched = orders.filter((order) => order.unmatched).length;
  await db.collection("uploadRuns").doc(uploadId).set({ uploadId, type: "attSales", fileName, storagePath, uploadedBy: actorUid, uploadedAt: FieldValue.serverTimestamp(), rowsRead: rows.length, rowsValid: orders.length, rowsSkipped: skipped, rowsMatched: orders.length - unmatched, rowsUnmatched: unmatched, selectedDateIds: [], status: "complete", errors: [], summary: { provider: "att", saleCount: orders.length } }, { merge: true });
  return { rowsRead: rows.length, rowsImported: orders.length, rowsSkipped: skipped, rowsMatched: orders.length - unmatched, rowsUnmatched: unmatched };
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
  return candidates.length;
}
