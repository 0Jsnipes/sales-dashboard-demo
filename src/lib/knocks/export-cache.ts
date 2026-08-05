import "server-only";

import { FieldValue, type DocumentData, type Firestore, type QuerySnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import type { NormalizedKnockRow } from "@/src/lib/knocks/types";

const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const cacheDayId = (source: string, dateId: string) => `${source}__${dateId}`;
const MAX_CHUNK_BYTES = 550_000;
const MAX_CHUNK_ROWS = 150;

type CachedKnockRow = {
  repUid: string | null;
  rowIndex: number;
  rawData: Record<string, unknown>;
};

function buildCacheChunks(rows: Array<{ row: NormalizedKnockRow; rowIndex: number }>) {
  const output: CachedKnockRow[][] = [];
  let current: CachedKnockRow[] = [];
  let currentBytes = 0;
  rows.forEach(({ row, rowIndex }) => {
    const cached = { repUid: row.repId ?? null, rowIndex, rawData: row.raw };
    const bytes = Buffer.byteLength(JSON.stringify(cached), "utf8");
    if (current.length && (current.length >= MAX_CHUNK_ROWS || currentBytes + bytes > MAX_CHUNK_BYTES)) {
      output.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(cached);
    currentBytes += bytes;
  });
  if (current.length) output.push(current);
  return output;
}

export async function replaceKnockExportCacheRows(rows: NormalizedKnockRow[], uploadId: string, db: Firestore = getAdminDb()) {
  const bySourceDate = new Map<string, NormalizedKnockRow[]>();
  for (const row of rows) {
    const key = cacheDayId(row.source, row.activityDateKey);
    const values = bySourceDate.get(key) ?? [];
    values.push(row);
    bySourceDate.set(key, values);
  }

  const chunksRef = db.collection("knockExportChunks");
  const existingByDay = new Map<string, QuerySnapshot<DocumentData>>();
  for (const group of chunks([...bySourceDate.keys()], 20)) {
    const snapshots = await Promise.all(group.map((dayId) => chunksRef.where("dayId", "==", dayId).get()));
    group.forEach((dayId, index) => existingByDay.set(dayId, snapshots[index]!));
  }

  const writer = db.bulkWriter({ throttling: { initialOpsPerSecond: 2_000, maxOpsPerSecond: 10_000 } });
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (const [dayId, dayRows] of bySourceDate) {
    const existing = existingByDay.get(dayId);
    const rowsByRep = new Map<string, Array<{ row: NormalizedKnockRow; rowIndex: number }>>();
    dayRows.forEach((row, rowIndex) => {
      if (!row.repId) return;
      const values = rowsByRep.get(row.repId) ?? [];
      values.push({ row, rowIndex });
      rowsByRep.set(row.repId, values);
    });
    const nextChunks = [...rowsByRep.entries()].flatMap(([repUid, repRows]) => buildCacheChunks(repRows).map((rows, chunkIndex) => ({ repUid, rows, chunkIndex })));
    const nextIds = new Set(nextChunks.map(({ repUid, chunkIndex }) => `${dayId}__${repUid}__${String(chunkIndex).padStart(4, "0")}`));
    for (const document of existing?.docs ?? []) {
      if (!nextIds.has(document.id)) writer.delete(document.ref);
    }
    const first = dayRows[0]!;
    nextChunks.forEach(({ repUid, rows: cachedRows, chunkIndex }) => writer.set(chunksRef.doc(`${dayId}__${repUid}__${String(chunkIndex).padStart(4, "0")}`), {
      dayId,
      source: first.source,
      provider: first.provider,
      activityDateKey: first.activityDateKey,
      repUid,
      sourceUploadId: uploadId,
      chunkIndex,
      rows: cachedRows,
      updatedAt: FieldValue.serverTimestamp(),
    }));
  }
  await writer.close();
  return { daysWritten: bySourceDate.size, rowsWritten: rows.filter((row) => row.repId).length };
}

export async function rebuildKnockExportCache() {
  const db = getAdminDb();
  const metadataRef = db.collection("system").doc("knockExportCache");
  // Demo mode has no uploaded knock workbooks to re-parse from storage (knock
  // imports are seeded straight into `knockDaily`, not sourced from files), so
  // there is nothing to cache — report an immediate, empty "complete" result
  // rather than reaching into real Cloud Storage.
  const result = { uploadsProcessed: 0, uploadsSkipped: 0, daysWritten: 0, rowsWritten: 0, chunkCount: 0 };
  await metadataRef.set({ status: "complete", schemaVersion: 3, ...result, completedAt: FieldValue.serverTimestamp() }, { merge: true });
  return result;
}

export async function readKnockExportCacheRows(start: string, end: string, repUids: string[]) {
  const db = getAdminDb();
  const metadata = await db.collection("system").doc("knockExportCache").get();
  const cache = metadata.data();
  if (cache?.status !== "complete" || cache?.schemaVersion !== 3 || typeof cache?.chunkCount !== "number") {
    throw new Error("Export data is not ready. Use Prepare export data on the Teams page and wait for it to finish.");
  }
  if (!repUids.length) return [];
  const snapshots = await Promise.all(chunks(repUids, 30).map((group) => db.collection("knockExportChunks").where("repUid", "in", group).get()));
  return snapshots.flatMap((snapshot) => snapshot.docs).flatMap((document) => {
    const data = document.data() as { provider: "ATT" | "T-Fiber"; activityDateKey: string; rows?: CachedKnockRow[] };
    if (data.activityDateKey < start || data.activityDateKey > end) return [];
    return (data.rows ?? []).map((row) => ({ provider: data.provider, activityDateKey: data.activityDateKey, ...row }));
  });
}
