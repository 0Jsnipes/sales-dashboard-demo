import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { importATTRows, parseATTReport } from "@/src/lib/imports/att";
import { importTFiberRows, parseTFiberWorkbook } from "@/src/lib/imports/tfiber";
import { expectedImportFileLabel, validateImportFileName } from "@/src/lib/imports/file-conventions";
import { importKnockWorkbook } from "@/src/lib/knocks/import";
import { getAdminApp, getAdminDb } from "@/src/lib/firebase/admin";

type ImportAttachmentOptions = {
  actorUid: string;
  sender?: string;
  subject?: string;
  origin?: string;
  contentType?: string;
};

type EmailAttachment = {
  fileName: string;
  contentType?: string;
  buffer: Buffer;
};

function isSpreadsheet(fileName: string) {
  return /\.(xlsx|xls)$/i.test(fileName);
}

function isCsv(fileName: string) {
  return /\.csv$/i.test(fileName);
}

export async function importEmailAttachment(file: EmailAttachment, options: ImportAttachmentOptions) {
  const actorUid = options.actorUid;
  const sender = String(options.sender ?? "").trim();
  const subject = String(options.subject ?? "").trim();
  const uploadId = randomUUID();
  const storagePath = `imports/email/${uploadId}/${file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await getStorage(getAdminApp()).bucket().file(storagePath).save(file.buffer, {
    contentType: file.contentType || "application/octet-stream",
    metadata: {
      metadata: {
        uploadId,
        uploadedBy: actorUid,
        sender,
        subject,
        origin: options.origin ?? "email",
      },
    },
  });

  if (isCsv(file.fileName)) {
    if (!validateImportFileName("attSales", file.fileName)) {
      throw new Error(`ATT sales files must follow the ${expectedImportFileLabel("attSales")} naming format.`);
    }
    await getAdminDb().collection("uploadRuns").doc(uploadId).set({
      uploadId,
      type: "attSales",
      fileName: file.fileName,
      storagePath,
      uploadedBy: actorUid,
      uploadedAt: new Date(),
      status: "pending",
    });
    const summary = await importATTRows({
      rows: parseATTReport(file.buffer),
      uploadId,
      actorUid,
      fileName: file.fileName,
      storagePath,
    });
    return { fileName: file.fileName, type: "attSales", summary, uploadId };
  }

  if (isSpreadsheet(file.fileName) && validateImportFileName("tfiberSales", file.fileName)) {
    await getAdminDb().collection("uploadRuns").doc(uploadId).set({
      uploadId,
      type: "tfiberSales",
      fileName: file.fileName,
      storagePath,
      uploadedBy: actorUid,
      uploadedAt: new Date(),
      status: "pending",
    });
    const summary = await importTFiberRows({
      rows: parseTFiberWorkbook(file.buffer),
      uploadId,
      actorUid,
      fileName: file.fileName,
      storagePath,
    });
    return { fileName: file.fileName, type: "tfiberSales", summary, uploadId };
  }

  if (isSpreadsheet(file.fileName)) {
    const result = await importKnockWorkbook(file.buffer, {
      actorUid,
      fileName: file.fileName,
      contentType: file.contentType,
      metadata: {
        sender,
        subject,
        origin: options.origin ?? "email",
      },
    });
    return { fileName: file.fileName, type: "knockImport", summary: result.summary, uploadId: result.uploadId };
  }

  throw new Error(`Unsupported attachment type for ${file.fileName}.`);
}

export async function importEmailAttachments(files: EmailAttachment[], options: ImportAttachmentOptions) {
  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    results.push(await importEmailAttachment(file, options));
  }
  return results;
}
