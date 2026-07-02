import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";
import { parseKnockWorkbook } from "@/src/lib/knocks/parse";
import { normalizeRepName } from "@/src/lib/knocks/matching";
import type { Rep } from "@/src/types/rep";

type UploadRun = {
  uploadId?: string;
  type?: string;
  storagePath?: string;
};

const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

export async function backfillKnockLcps() {
  const db = getAdminDb();
  const [runsSnapshot, repsSnapshot] = await Promise.all([
    db.collection("uploadRuns").where("type", "==", "knockImport").get(),
    db.collection("reps").get(),
  ]);
  const reps = repsSnapshot.docs.map((document) => document.data() as Rep);
  const bucket = getStorage(getAdminApp()).bucket();
  const updates = new Map<string, Map<string, Set<string>>>();
  let processedUploads = 0;

  for (const document of runsSnapshot.docs) {
    const run = document.data() as UploadRun;
    if (!run.storagePath) continue;
    const [buffer] = await bucket.file(run.storagePath).download();
    const parsed = parseKnockWorkbook(buffer, reps);
    processedUploads += 1;
    for (const row of parsed.rows) {
      if (row.provider !== "T-Fiber" || !row.lcp) continue;
      const repUid = row.repId ?? `unmatched:${normalizeRepName(row.repName)}`;
      const byRep = updates.get(row.activityDateKey) ?? new Map<string, Set<string>>();
      const values = byRep.get(repUid) ?? new Set<string>();
      values.add(String(row.lcp).trim());
      byRep.set(repUid, values);
      updates.set(row.activityDateKey, byRep);
    }
  }

  let updatedDocs = 0;
  for (const [dateId, byRep] of updates.entries()) {
    for (const group of chunks([...byRep.entries()], 200)) {
      const batch = db.batch();
      for (const [repUid, lcps] of group) {
        if (!lcps.size) continue;
        const ref = db.collection("knockDaily").doc(dateId).collection("reps").doc(repUid);
        batch.set(ref, { lcps: FieldValue.arrayUnion(...Array.from(lcps)) }, { merge: true });
        updatedDocs += 1;
      }
      await batch.commit();
    }
  }

  return { processedUploads, updatedDocs, daysTouched: updates.size };
}
