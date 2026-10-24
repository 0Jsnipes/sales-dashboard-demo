import type { DocumentReference } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";

export type SalesUploadType = "companyASales" | "companyBSales";
export type KnockUploadType = "knockImport";

export type SalesUploadRun = {
  uploadId: string;
  type: SalesUploadType | KnockUploadType | string;
  fileName: string;
  storagePath?: string;
  uploadedBy?: string;
  uploadedAt?: { toDate?: () => Date } | Date | null;
  status?: string;
  rowsRead?: number;
  rowsValid?: number;
  rowsSkipped?: number;
  rowsMatched?: number;
  rowsUnmatched?: number;
  summary?: { saleCount?: number };
  ingestMethod?: string;
  origin?: string;
  emailSender?: string;
  emailSubject?: string;
};

export type SalesUploadListItem = {
  uploadId: string;
  type: SalesUploadType;
  fileName: string;
  storagePath: string;
  uploadedBy: string;
  uploadedAt: string | null;
  status: string;
  rowsRead: number;
  rowsValid: number;
  rowsSkipped: number;
  rowsMatched: number;
  rowsUnmatched: number;
  ingestMethod: string;
  origin: string;
  emailSender: string;
  emailSubject: string;
};

export type KnockUploadRun = SalesUploadRun & {
  type: KnockUploadType;
};

function toIsoDate(value: SalesUploadRun["uploadedAt"]) {
  if (!value) return null;
  const date = value instanceof Date ? value : value.toDate?.();
  return date instanceof Date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
}

export async function listSalesUploads(limit = 100) {
  const snapshot = await getAdminDb().collection("uploadRuns").orderBy("uploadedAt", "desc").limit(limit).get();
  return snapshot.docs
    .map((document) => document.data() as SalesUploadRun)
    .filter((item): item is SalesUploadRun & { type: SalesUploadType } => item.type === "companyASales" || item.type === "companyBSales")
    .map((item) => ({
      uploadId: item.uploadId,
      type: item.type,
      fileName: item.fileName,
      storagePath: item.storagePath ?? "",
      uploadedBy: item.uploadedBy ?? "",
      uploadedAt: toIsoDate(item.uploadedAt),
      status: item.status ?? "complete",
      rowsRead: Number(item.rowsRead ?? 0),
      rowsValid: Number(item.rowsValid ?? item.summary?.saleCount ?? 0),
      rowsSkipped: Number(item.rowsSkipped ?? 0),
      rowsMatched: Number(item.rowsMatched ?? 0),
      rowsUnmatched: Number(item.rowsUnmatched ?? 0),
      ingestMethod: item.ingestMethod ?? (item.uploadedBy === "system:email-import" ? "email" : "manual"),
      origin: item.origin ?? "",
      emailSender: item.emailSender ?? "",
      emailSubject: item.emailSubject ?? "",
    }));
}

async function deleteInBatches<T extends { ref: DocumentReference }>(items: T[]) {
  for (let index = 0; index < items.length; index += 400) {
    const batch = getAdminDb().batch();
    for (const item of items.slice(index, index + 400)) batch.delete(item.ref);
    await batch.commit();
  }
}

async function deleteStorageFile(storagePath?: string) {
  if (!storagePath) return false;
  try {
    await getStorage(getAdminApp()).bucket().file(storagePath).delete({ ignoreNotFound: true });
    return true;
  } catch {
    return false;
  }
}

async function deleteSalesUploadById(uploadId: string) {
  const runRef = getAdminDb().collection("uploadRuns").doc(uploadId);
  const runSnapshot = await runRef.get();
  if (!runSnapshot.exists) {
    return { uploadId, deletedOrders: 0, deletedUnmatched: 0, deletedStorage: false, deletedRun: false };
  }
  const run = runSnapshot.data() as SalesUploadRun;
  if (run.type !== "companyASales" && run.type !== "companyBSales") {
    return { uploadId, deletedOrders: 0, deletedUnmatched: 0, deletedStorage: false, deletedRun: false };
  }

  const orderProvider = run.type === "companyASales" ? "companya" : "companyb";
  const orderSnapshot = await getAdminDb().collection("salesOrders").doc(orderProvider).collection("orders").get();
  const ordersToDelete = orderSnapshot.docs.filter((document) => String(document.data().sourceUploadId || "") === uploadId);
  const unmatchedSnapshot = await getAdminDb().collection("unmatchedImports").where("uploadId", "==", uploadId).get();

  await deleteInBatches(ordersToDelete.map((document) => ({ ref: document.ref })));
  await deleteInBatches(unmatchedSnapshot.docs.map((document) => ({ ref: document.ref })));
  const deletedStorage = await deleteStorageFile(run.storagePath);
  await runRef.delete();

  return {
    uploadId,
    deletedOrders: ordersToDelete.length,
    deletedUnmatched: unmatchedSnapshot.size,
    deletedStorage,
    deletedRun: true,
  };
}

export async function deleteSalesUpload(uploadId: string) {
  return deleteSalesUploadById(uploadId);
}

export async function deleteAllSalesUploads() {
  const uploads = await listSalesUploads(500);
  const results = [];
  for (const upload of uploads) results.push(await deleteSalesUploadById(upload.uploadId));
  return { uploads: uploads.length, results };
}

export async function deleteKnockUpload(uploadId: string) {
  const runRef = getAdminDb().collection("uploadRuns").doc(uploadId);
  const runSnapshot = await runRef.get();
  if (!runSnapshot.exists) {
    return { uploadId, deletedKnockDocs: 0, daysTouched: 0, deletedStorage: false, deletedRun: false };
  }

  const run = runSnapshot.data() as KnockUploadRun;
  if (run.type !== "knockImport") {
    return { uploadId, deletedKnockDocs: 0, daysTouched: 0, deletedStorage: false, deletedRun: false };
  }

  const knockSnapshot = await getAdminDb()
    .collectionGroup("reps")
    .where("sourceUploadId", "==", uploadId)
    .get();

  const daysTouched = new Set(
    knockSnapshot.docs
      .map((document) => document.ref.parent.parent?.id)
      .filter((value): value is string => Boolean(value)),
  );

  await deleteInBatches(knockSnapshot.docs.map((document) => ({ ref: document.ref })));
  const deletedStorage = await deleteStorageFile(run.storagePath);
  await runRef.delete();

  return {
    uploadId,
    deletedKnockDocs: knockSnapshot.size,
    daysTouched: daysTouched.size,
    deletedStorage,
    deletedRun: true,
  };
}
