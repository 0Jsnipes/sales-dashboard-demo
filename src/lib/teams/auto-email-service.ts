import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { easternDateId, normalizeTeamAutoEmailSettings, teamAutoEmailRange, type TeamAutoEmailSettings, type TeamAutoEmailUploadType } from "@/src/lib/teams/auto-email-config";
import { queueTeamReportEmail } from "@/src/lib/teams/email-report";
import { getActiveTeams } from "@/src/lib/teams/team-service";

const settingsReference = () => getAdminDb().collection("automationSettings").doc("team-report-emails");

export async function getTeamAutoEmailSettings() {
  const snapshot = await settingsReference().get();
  return normalizeTeamAutoEmailSettings(snapshot.data());
}

export async function saveTeamAutoEmailSettings(settings: TeamAutoEmailSettings, actorUid: string) {
  await settingsReference().set({
    ...settings,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  }, { merge: true });
  return settings;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown automatic team email error.";
}

async function acquireDailyDelivery(teamId: string, uploadId: string, trigger: TeamAutoEmailUploadType) {
  const db = getAdminDb();
  const day = easternDateId();
  const reference = db.collection("teamAutoEmailDeliveries").doc(`${day}_${teamId}`);
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const status = String(snapshot.data()?.status ?? "");
    if (status === "processing" || status === "queued") return false;
    transaction.set(reference, {
      day,
      teamId,
      uploadId,
      trigger,
      status: "processing",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return { acquired, reference, day };
}

export async function queueAutomaticTeamReports(input: { trigger: TeamAutoEmailUploadType; uploadId: string; actorUid: string }) {
  const settings = await getTeamAutoEmailSettings();
  if (!settings.enabled) return { enabled: false, queued: 0, skipped: 0, failed: 0 };
  if (!settings.triggerUploadTypes.includes(input.trigger)) return { enabled: true, matchedTrigger: false, queued: 0, skipped: 0, failed: 0 };

  const db = getAdminDb();
  const teams = await getActiveTeams(db);
  const managerIds = [...new Set(teams.map((team) => team.managerRepUid).filter((value): value is string => Boolean(value)))];
  const managerSnapshots = managerIds.length
    ? await db.getAll(...managerIds.map((repUid) => db.collection("reps").doc(repUid)))
    : [];
  const managerById = new Map(managerSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));
  const ranges = {
    sales: teamAutoEmailRange(settings.salesRange),
    knocks: teamAutoEmailRange(settings.knocksRange),
  };
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const team of teams) {
    const manager = team.managerRepUid ? managerById.get(team.managerRepUid) : null;
    const recipient = String(manager?.email ?? "").trim();
    if (!recipient) {
      skipped += 1;
      continue;
    }
    const delivery = await acquireDailyDelivery(team.teamId, input.uploadId, input.trigger);
    if (!delivery.acquired) {
      skipped += 1;
      continue;
    }
    try {
      const result = await queueTeamReportEmail({
        team,
        recipient,
        subject: settings.subject,
        message: settings.message,
        files: settings.reportFiles,
        ranges,
        requestedBy: input.actorUid,
        metadata: {
          automated: true,
          automationFrequency: settings.frequency,
          triggerUploadType: input.trigger,
          triggerUploadId: input.uploadId,
          deliveryDay: delivery.day,
        },
      });
      await delivery.reference.set({
        status: "queued",
        recipient,
        mailDocumentId: result.mailDocumentId,
        queuedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      queued += 1;
    } catch (error) {
      await delivery.reference.set({
        status: "failed",
        error: errorMessage(error),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      failed += 1;
    }
  }
  return { enabled: true, matchedTrigger: true, queued, skipped, failed };
}

export async function safelyQueueAutomaticTeamReports(input: { trigger: TeamAutoEmailUploadType; uploadId: string; actorUid: string }) {
  try {
    return await queueAutomaticTeamReports(input);
  } catch (error) {
    return { enabled: true, matchedTrigger: true, queued: 0, skipped: 0, failed: 1, error: errorMessage(error) };
  }
}
