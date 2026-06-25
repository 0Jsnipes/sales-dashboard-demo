import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { toDateId } from "@/src/lib/date/week";
import type { Rep } from "@/src/types/rep";

const salesProviders = ["att", "tfiber", "manual"] as const;
const lifecycleActor = "system:auto-no-sales-3-weeks";

const chunks = <T,>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

function startOfWeek(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value;
}

function unknownToDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  return null;
}

export function lastCompleteWeeksWindow(weeks = 3, today = new Date()) {
  const currentWeekStart = startOfWeek(today);
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - weeks * 7);
  const end = new Date(currentWeekStart);
  end.setDate(end.getDate() - 1);
  return { start: toDateId(start), end: toDateId(end), startDate: start, endDate: end };
}

export async function loadSaleMatchableReps(db: Firestore = getAdminDb()) {
  const snapshot = await db.collection("reps").where("status", "in", ["active", "inactive"]).get();
  return snapshot.docs.map((document) => document.data() as Rep);
}

export async function reactivateInactiveRepsForMatchedSales(repUids: Iterable<string>, db: Firestore = getAdminDb()) {
  const unique = [...new Set([...repUids].map((repUid) => repUid.trim()).filter(Boolean))];
  for (const group of chunks(unique, 400)) {
    const batch = db.batch();
    for (const repUid of group) {
      batch.update(db.collection("reps").doc(repUid), {
        status: "active",
        inactiveAt: FieldValue.delete(),
        inactiveBy: FieldValue.delete(),
        inactiveReason: FieldValue.delete(),
        reactivatedAt: FieldValue.serverTimestamp(),
        reactivatedBy: "system:matched-sale-import",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system:matched-sale-import",
      });
    }
    await batch.commit();
  }
  return unique.length;
}

export async function autoMoveNoSaleRepsToInactive(db: Firestore = getAdminDb()) {
  const window = lastCompleteWeeksWindow(3);
  const jobId = `auto-no-sales-3-weeks-${window.start}-${window.end}`;
  const jobRef = db.collection("systemJobs").doc(jobId);
  const previousRun = await jobRef.get();
  if (previousRun.exists) return { start: window.start, end: window.end, evaluated: 0, markedInactive: 0, skipped: true };
  const [activeSnapshot, ...salesSnapshots] = await Promise.all([
    db.collection("reps").where("status", "==", "active").get(),
    ...salesProviders.map((provider) =>
      db.collection("salesOrders").doc(provider).collection("orders").where("orderDateId", ">=", window.start).where("orderDateId", "<=", window.end).get(),
    ),
  ]);
  const soldRepUids = new Set<string>();
  for (const snapshot of salesSnapshots) {
    for (const document of snapshot.docs) {
      const order = document.data();
      if (Number(order.saleCount || 1) <= 0) continue;
      const repUid = String(order.matchedRepUid || "").trim();
      if (repUid) soldRepUids.add(repUid);
    }
  }
  const candidates = activeSnapshot.docs.filter((document) => {
    const rep = document.data() as Rep;
    const repUid = rep.repUid || document.id;
    if (soldRepUids.has(repUid)) return false;
    const activeSince = unknownToDate(rep.reactivatedAt) ?? unknownToDate(rep.createdAt);
    return !activeSince || activeSince <= window.startDate;
  });
  for (const group of chunks(candidates, 400)) {
    const batch = db.batch();
    for (const document of group) {
      batch.update(document.ref, {
        status: "inactive",
        inactiveAt: FieldValue.serverTimestamp(),
        inactiveBy: lifecycleActor,
        inactiveReason: "noSalesThreeWeeks",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: lifecycleActor,
      });
    }
    await batch.commit();
  }
  await jobRef.set({
    jobId,
    type: "autoNoSalesThreeWeeks",
    start: window.start,
    end: window.end,
    evaluated: activeSnapshot.size,
    markedInactive: candidates.length,
    completedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { start: window.start, end: window.end, evaluated: activeSnapshot.size, markedInactive: candidates.length, skipped: false };
}
