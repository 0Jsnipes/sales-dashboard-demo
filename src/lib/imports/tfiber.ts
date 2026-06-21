import "server-only";

import * as XLSX from "xlsx";
import { FieldValue } from "firebase-admin/firestore";
import type { Rep } from "@/src/types/rep";
import { matchImportRowToRep } from "@/src/lib/matching/matchRep";
import { getAdminDb } from "@/src/lib/firebase/admin";

type RawRow = Record<string, unknown>;
const orderCollection = () => getAdminDb().collection("salesOrders").doc("tfiber").collection("orders");
const dateId = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const text = String(value ?? "").trim();
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const serializable = (row: RawRow) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value ?? null]));
const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

export function parseTFiberWorkbook(buffer: Buffer): RawRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
  const required = ["Alt Order ID", "Order #", "Rep ID", "dealername", "Order Date"];
  const first = rows[0] ?? {};
  const missing = required.filter((column) => !(column in first));
  if (missing.length) throw new Error(`This is not a T-Fiber order export. Missing: ${missing.join(", ")}.`);
  return rows;
}

export async function importTFiberRows({ rows, uploadId, actorUid, fileName, storagePath }: { rows: RawRow[]; uploadId: string; actorUid: string; fileName: string; storagePath: string }) {
  const db = getAdminDb();
  const reps = (await db.collection("reps").where("status", "==", "active").get()).docs.map((document) => document.data() as Rep);
  const existing = new Map((await orderCollection().get()).docs.map((document) => [document.id, document.data()]));
  const orders: Array<{ orderUid: string; data: Record<string, unknown>; unmatched: boolean }> = [];
  let skipped = 0; let matched = 0;
  for (const row of rows) {
    const orderUid = String(row["Alt Order ID"] || row["Order #"] || "").trim();
    if (!orderUid) { skipped++; continue; }
    const previous = existing.get(orderUid);
    const result = previous?.lockedAssignment ? { repUid: previous.matchedRepUid as string | null, method: previous.matchMethod as string | null, confidence: 1, reason: "Locked manual assignment" } : matchImportRowToRep({ rawSalesId: String(row["Rep ID"] ?? ""), rawRepName: String(row.dealername ?? "") }, reps);
    const isMatched = Boolean(result.repUid);
    if (isMatched) matched++;
    const data = { orderUid, provider: "tfiber", sourceUploadId: uploadId, orderDate: dateId(row["Order Date"]), orderDateId: dateId(row["Order Date"]), saleCount: 1, rawRepName: String(row.dealername ?? ""), rawSalesId: String(row["Rep ID"] ?? ""), rawManagerName: String(row.Manager ?? row["Manager Name"] ?? ""), matchedRepUid: result.repUid, matchStatus: isMatched ? (result.method === "manual" ? "manual" : "matched") : "unmatched", matchMethod: result.method, lockedAssignment: Boolean(previous?.lockedAssignment), accountStatus: String(row["Account Status"] ?? ""), installationDateId: dateId(row["Est. Installation Date"]), cancellationDateId: dateId(row["Order Cancellation Date"]), rawData: serializable(row), legacyPath: null, createdAt: previous?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    orders.push({ orderUid, data, unmatched: !isMatched });
  }
  for (const group of chunks(orders, 350)) {
    const batch = db.batch();
    for (const order of group) {
      batch.set(orderCollection().doc(order.orderUid), order.data, { merge: true });
      if (order.unmatched) {
        const ref = db.collection("unmatchedImports").doc(`${uploadId}-tfiber-${order.orderUid}`);
        batch.set(ref, { unmatchedId: ref.id, uploadId, provider: "tfiber", rawRepName: order.data.rawRepName, rawSalesId: order.data.rawSalesId, rawData: order.data.rawData, suggestedRepUids: [], resolvedRepUid: null, status: "open", createdAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    await batch.commit();
  }
  await db.collection("uploadRuns").doc(uploadId).set({ uploadId, type: "tfiberSales", fileName, storagePath, uploadedBy: actorUid, uploadedAt: FieldValue.serverTimestamp(), rowsRead: rows.length, rowsValid: orders.length, rowsSkipped: skipped, rowsMatched: matched, rowsUnmatched: orders.length - matched, selectedDateIds: [], status: "complete", errors: [], summary: { provider: "tfiber", saleCount: orders.length } }, { merge: true });
  return { rowsRead: rows.length, rowsImported: orders.length, rowsSkipped: skipped, rowsMatched: matched, rowsUnmatched: orders.length - matched };
}

export async function rematchTFiberOrdersForRep(rep: Rep) {
  const snapshot = await orderCollection().where("matchStatus", "==", "unmatched").get();
  const candidates = snapshot.docs.filter((document) => {
    const row = document.data();
    return Boolean(matchImportRowToRep({ rawSalesId: row.rawSalesId, rawRepName: row.rawRepName }, [rep]).repUid);
  });
  for (const group of chunks(candidates, 400)) {
    const batch = getAdminDb().batch();
    for (const document of group) {
      const row = document.data();
      const result = matchImportRowToRep({ rawSalesId: row.rawSalesId, rawRepName: row.rawRepName }, [rep]);
      batch.update(document.ref, { matchedRepUid: rep.repUid, matchStatus: "matched", matchMethod: result.method, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  return candidates.length;
}
