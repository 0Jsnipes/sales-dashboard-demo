import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "@/src/lib/firebase/admin";
import { buildTeamKnocksExport, buildTeamSalesExport, teamExportSlug, type TeamExportProvider } from "@/src/lib/teams/export";
import type { TeamReportFileKind, TeamReportRange } from "@/src/lib/teams/report-types";
import type { Team } from "@/src/types/team";

type QueueTeamReportOptions = {
  team: Team;
  recipient: string;
  cc?: string[];
  subject: string;
  message: string;
  files: TeamReportFileKind[];
  ranges: { sales: TeamReportRange; knocks: TeamReportRange };
  requestedBy: string;
  metadata?: Record<string, unknown>;
};

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const signedUrlLifetimeMs = 24 * 60 * 60 * 1000;

function fileParts(kind: TeamReportFileKind): { provider: TeamExportProvider; dataKind: "sales" | "knocks" } {
  return {
    provider: kind.startsWith("att-") ? "att" : "tfiber",
    dataKind: kind.endsWith("sales") ? "sales" : "knocks",
  };
}

function rangeFilePart(range: TeamReportRange) {
  return range.start === "0001-01-01" && range.end === "9999-12-31" ? "all-time" : `${range.start}-to-${range.end}`;
}

export async function queueTeamReportEmail(options: QueueTeamReportOptions) {
  const { team, recipient, subject, message, files, ranges, requestedBy, metadata = {} } = options;
  const recipientKey = recipient.trim().toLowerCase();
  const cc = [...new Map((options.cc ?? [])
    .map((email) => email.trim())
    .filter((email) => email && email.toLowerCase() !== recipientKey)
    .map((email) => [email.toLowerCase(), email])).values()];
  const db = getAdminDb();
  const mailCollection = process.env.FIREBASE_TRIGGER_EMAIL_COLLECTION?.trim() || "mail";
  const mailReference = db.collection(mailCollection).doc();
  const bucket = getAdminStorage().bucket();
  const expires = Date.now() + signedUrlLifetimeMs;
  const attachments = await Promise.all(files.map(async (kind) => {
    const { provider, dataKind } = fileParts(kind);
    const range = ranges[dataKind];
    const providerLabel = provider === "att" ? "att" : "tfiber";
    const file = dataKind === "sales"
      ? await buildTeamSalesExport(team, range, provider, { dateOrder: "newest-first" })
      : await buildTeamKnocksExport(team, range, provider);
    const fileName = `${teamExportSlug(team)}-${providerLabel}-${dataKind}-${rangeFilePart(range)}.xlsx`;
    const storageFile = bucket.file(`team-email-attachments/${mailReference.id}/${fileName}`);
    await storageFile.save(Buffer.from(file), {
      resumable: false,
      contentType,
      metadata: { metadata: { teamId: team.teamId, mailDocumentId: mailReference.id } },
    });
    const [url] = await storageFile.getSignedUrl({ action: "read", expires });
    return { filename: fileName, contentType, path: url };
  }));

  await mailReference.create({
    to: [recipient],
    ...(cc.length ? { cc } : {}),
    message: { subject, text: message, attachments },
    createdAt: FieldValue.serverTimestamp(),
    teamId: team.teamId,
    requestedBy,
    metadata,
  });
  await db.collection("teamEmailLogs").add({
    teamId: team.teamId,
    recipient,
    cc,
    subject,
    files,
    ranges,
    mailCollection,
    mailDocumentId: mailReference.id,
    status: "queued",
    queuedAt: FieldValue.serverTimestamp(),
    queuedBy: requestedBy,
    ...metadata,
  });
  return { recipient, cc, mailDocumentId: mailReference.id };
}
