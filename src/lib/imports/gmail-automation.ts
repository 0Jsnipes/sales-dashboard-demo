import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { getReportMessage, listReportMessages, markMessageProcessed } from "@/src/lib/gmail/client";
import { importEmailAttachment } from "@/src/lib/imports/email-import";

const lockLeaseMs = 10 * 60 * 1000;

type ProcessOptions = {
  actorUid: string;
  maxMessages?: number;
};

function messageLimit(value: number | undefined) {
  return Math.max(1, Math.min(25, Number.isFinite(value) ? Math.floor(value!) : 10));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Gmail import error.";
}

export async function processGmailReportInbox({ actorUid, maxMessages }: ProcessOptions) {
  const db = getAdminDb();
  const lockReference = db.collection("automationLocks").doc("gmail-report-import");
  const runId = crypto.randomUUID();
  const now = Date.now();
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockReference);
    const lockedUntil = snapshot.data()?.lockedUntil as Timestamp | undefined;
    if (lockedUntil && lockedUntil.toMillis() > now) return false;
    transaction.set(lockReference, {
      runId,
      status: "running",
      startedAt: FieldValue.serverTimestamp(),
      lockedUntil: Timestamp.fromMillis(now + lockLeaseMs),
    }, { merge: true });
    return true;
  });
  if (!acquired) return { ok: true, skipped: true, reason: "A Gmail import is already running.", processedMessages: 0, failedMessages: 0, results: [] };

  const results: Array<Record<string, unknown>> = [];
  let processedMessages = 0;
  let failedMessages = 0;
  try {
    const messages = await listReportMessages(messageLimit(maxMessages));
    for (const item of messages) {
      const ledgerReference = db.collection("gmailImportMessages").doc(item.id);
      try {
        const ledgerSnapshot = await ledgerReference.get();
        if (ledgerSnapshot.data()?.status === "success") {
          await markMessageProcessed(item.id);
          continue;
        }
        const message = await getReportMessage(item.id);
        const completedKeys = ledgerSnapshot.data()?.completedAttachmentKeys;
        const completed = new Set<string>(Array.isArray(completedKeys) ? completedKeys.filter((key): key is string => typeof key === "string") : []);
        await ledgerReference.set({
          messageId: message.id,
          threadId: message.threadId,
          from: message.from,
          subject: message.subject,
          status: "processing",
          runId,
          lastAttemptAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        const reportAttachments = message.attachments.filter((attachment) => /\.(csv|xlsx|xls)$/i.test(attachment.fileName));
        const imported: Array<Record<string, unknown>> = [];
        for (const [index, attachment] of reportAttachments.entries()) {
          const attachmentKey = `${index}:${attachment.fileName}:${attachment.buffer.length}`;
          if (completed.has(attachmentKey)) continue;
          const result = await importEmailAttachment(attachment, {
            actorUid,
            sender: message.from,
            subject: message.subject,
            origin: "gmail-automation",
          });
          imported.push(result);
          completed.add(attachmentKey);
          await ledgerReference.set({
            completedAttachmentKeys: FieldValue.arrayUnion(attachmentKey),
            lastImportedAttachment: result,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        await markMessageProcessed(message.id);
        await ledgerReference.set({
          status: "success",
          attachmentCount: reportAttachments.length,
          completedAt: FieldValue.serverTimestamp(),
          error: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        processedMessages += 1;
        results.push({ messageId: message.id, from: message.from, subject: message.subject, imported });
      } catch (error) {
        failedMessages += 1;
        const message = errorMessage(error);
        await ledgerReference.set({ status: "error", error: message, runId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        results.push({ messageId: item.id, error: message });
      }
    }
    await lockReference.set({
      status: failedMessages ? "completed_with_errors" : "success",
      processedMessages,
      failedMessages,
      completedAt: FieldValue.serverTimestamp(),
      lockedUntil: FieldValue.delete(),
    }, { merge: true });
    return { ok: failedMessages === 0, skipped: false, processedMessages, failedMessages, results };
  } catch (error) {
    await lockReference.set({ status: "error", error: errorMessage(error), completedAt: FieldValue.serverTimestamp(), lockedUntil: FieldValue.delete() }, { merge: true });
    throw error;
  }
}
