import "server-only";

import { FieldValue, type DocumentData, type Firestore, type QuerySnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";
import { parseKnockWorkbook } from "@/src/lib/knocks/parse";
import type { NormalizedKnockRow } from "@/src/lib/knocks/types";
import type { Rep } from "@/src/types/rep";

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

function uploadTime(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.valueOf();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.valueOf()) ? 0 : parsed.valueOf();
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
  await metadataRef.set({ status: "building", schemaVersion: 3, startedAt: FieldValue.serverTimestamp() }, { merge: true });
  try {
    const [runsSnapshot, repsSnapshot] = await Promise.all([
      db.collection("uploadRuns").where("type", "==", "knockImport").get(),
      db.collection("reps").get(),
    ]);
    const reps = repsSnapshot.docs.map((document) => ({ repUid: document.id, ...document.data() }) as Rep);
    const runs = runsSnapshot.docs
      .map((document) => {
        const data = document.data();
        return { uploadId: document.id, status: String(data.status || ""), storagePath: String(data.storagePath || ""), uploadedAt: data.uploadedAt };
      })
      .filter((run) => run.status === "complete" && run.storagePath)
      .sort((left, right) => uploadTime(left.uploadedAt) - uploadTime(right.uploadedAt) || left.uploadId.localeCompare(right.uploadId));
    const bucket = getStorage(getAdminApp()).bucket();
    const currentBySourceDate = new Map<string, { uploadId: string; rows: NormalizedKnockRow[] }>();
    let uploadsProcessed = 0;
    let uploadsSkipped = 0;

    for (const runGroup of chunks(runs, 5)) {
      const parsedGroup = await Promise.all(runGroup.map(async (run) => {
        try {
          const [buffer] = await bucket.file(run.storagePath).download();
          return { run, parsed: parseKnockWorkbook(buffer, reps) };
        } catch {
          return { run, parsed: null };
        }
      }));
      for (const { run, parsed } of parsedGroup) {
        if (!parsed) {
          uploadsSkipped += 1;
          continue;
        }
        const byDate = new Map<string, NormalizedKnockRow[]>();
        for (const row of parsed.rows) {
          const values = byDate.get(row.activityDateKey) ?? [];
          values.push(row);
          byDate.set(row.activityDateKey, values);
        }
        for (const [dateId, rows] of byDate) currentBySourceDate.set(cacheDayId(rows[0]!.source, dateId), { uploadId: run.uploadId, rows });
        uploadsProcessed += 1;
      }
    }

    const rowsByUpload = new Map<string, NormalizedKnockRow[]>();
    for (const current of currentBySourceDate.values()) {
      const rows = rowsByUpload.get(current.uploadId) ?? [];
      rows.push(...current.rows);
      rowsByUpload.set(current.uploadId, rows);
    }
    let daysWritten = 0;
    let rowsWritten = 0;
    for (const [uploadId, rows] of rowsByUpload) {
      const result = await replaceKnockExportCacheRows(rows, uploadId, db);
      daysWritten += result.daysWritten;
      rowsWritten += result.rowsWritten;
    }
    const chunkCount = (await db.collection("knockExportChunks").count().get()).data().count;
    const result = { uploadsProcessed, uploadsSkipped, daysWritten, rowsWritten, chunkCount };
    await metadataRef.set({ status: "complete", schemaVersion: 3, ...result, completedAt: FieldValue.serverTimestamp() }, { merge: true });
    return result;
  } catch (error) {
    await metadataRef.set({ status: "failed", failedAt: FieldValue.serverTimestamp(), error: error instanceof Error ? error.message : String(error) }, { merge: true });
    throw error;
  }
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
