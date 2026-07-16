import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { easternDateId, normalizeTeamAutoEmailSettings, teamAutoEmailDeliveryId, teamAutoEmailRange, type TeamAutoEmailRule, type TeamAutoEmailSettings, type TeamAutoEmailTemplate, type TeamAutoEmailTemplateInput, type TeamAutoEmailUploadType } from "@/src/lib/teams/auto-email-config";
import { queueTeamReportEmail } from "@/src/lib/teams/email-report";
import { getActiveTeams, getTeamById } from "@/src/lib/teams/team-service";

const settingsReference = () => getAdminDb().collection("automationSettings").doc("team-report-emails");
const rulesCollection = () => getAdminDb().collection("teamAutoEmailRules");
const templatesCollection = () => getAdminDb().collection("teamAutoEmailTemplates");

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

export async function getTeamAutoEmailRules(teamId: string) {
  const snapshot = await rulesCollection().where("teamId", "==", teamId).get();
  return snapshot.docs
    .map((document) => ({ ...document.data(), ruleId: document.id } as TeamAutoEmailRule))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveTeamAutoEmailRules(teamId: string, rules: TeamAutoEmailRule[], actorUid: string) {
  const team = await getTeamById(teamId);
  if (!team) throw new Error("TEAM_NOT_FOUND");
  const db = getAdminDb();
  const existing = await rulesCollection().where("teamId", "==", teamId).get();
  if (existing.empty && !rules.length) return [];
  const desiredSnapshots = rules.length ? await db.getAll(...rules.map((rule) => rulesCollection().doc(rule.ruleId))) : [];
  if (desiredSnapshots.some((snapshot) => snapshot.exists && String(snapshot.data()?.teamId ?? "") !== teamId)) throw new Error("AUTO_EMAIL_RULE_ID_CONFLICT");
  const desiredIds = new Set(rules.map((rule) => rule.ruleId));
  const batch = db.batch();
  for (const document of existing.docs) if (!desiredIds.has(document.id)) batch.delete(document.ref);
  for (const rule of rules) {
    const reference = rulesCollection().doc(rule.ruleId);
    batch.set(reference, {
      ...rule,
      teamId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
      ...(existing.docs.some((document) => document.id === rule.ruleId) ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: actorUid }),
    }, { merge: true });
  }
  await batch.commit();
  return rules.map((rule) => ({ ...rule, teamId }));
}

export async function getTeamAutoEmailTemplates() {
  const snapshot = await templatesCollection().get();
  return snapshot.docs
    .map((document) => ({ ...document.data(), templateId: document.id } as TeamAutoEmailTemplate))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createTeamAutoEmailTemplate(input: TeamAutoEmailTemplateInput, actorUid: string) {
  const reference = templatesCollection().doc();
  await reference.create({
    ...input,
    templateId: reference.id,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  });
  return { ...input, templateId: reference.id };
}

export async function deleteTeamAutoEmailTemplate(templateId: string) {
  await templatesCollection().doc(templateId).delete();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown automatic team email error.";
}

async function acquireDailyDelivery(teamId: string, ruleId: string, uploadId: string, trigger: TeamAutoEmailUploadType) {
  const db = getAdminDb();
  const day = easternDateId();
  const reference = db.collection("teamAutoEmailDeliveries").doc(teamAutoEmailDeliveryId(day, teamId, ruleId));
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const status = String(snapshot.data()?.status ?? "");
    if (status === "processing" || status === "queued") return false;
    transaction.set(reference, {
      day,
      teamId,
      ruleId,
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
  const db = getAdminDb();
  const [teams, ruleSnapshot] = await Promise.all([
    getActiveTeams(db),
    rulesCollection().where("triggerUploadType", "==", input.trigger).get(),
  ]);
  const rules = ruleSnapshot.docs
    .map((document) => ({ ...document.data(), ruleId: document.id } as TeamAutoEmailRule))
    .filter((rule) => rule.enabled);
  if (!rules.length) return { enabled: false, matchedTrigger: false, queued: 0, skipped: 0, failed: 0 };
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const matchingTeams = [...new Map(rules.flatMap((rule) => {
    const team = teamById.get(rule.teamId);
    return team ? [[team.teamId, team] as const] : [];
  })).values()];
  const managerIds = [...new Set(matchingTeams.map((team) => team.managerRepUid).filter((value): value is string => Boolean(value)))];
  const managerSnapshots = managerIds.length
    ? await db.getAll(...managerIds.map((repUid) => db.collection("reps").doc(repUid)))
    : [];
  const managerById = new Map(managerSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of rules) {
    const team = teamById.get(rule.teamId);
    if (!team) {
      skipped += 1;
      continue;
    }
    const manager = team.managerRepUid ? managerById.get(team.managerRepUid) : null;
    const recipient = String(manager?.email ?? "").trim();
    if (!recipient) {
      skipped += 1;
      continue;
    }
    const delivery = await acquireDailyDelivery(team.teamId, rule.ruleId, input.uploadId, input.trigger);
    if (!delivery.acquired) {
      skipped += 1;
      continue;
    }
    try {
      const result = await queueTeamReportEmail({
        team,
        recipient,
        cc: rule.cc,
        subject: rule.subject,
        message: rule.message,
        files: rule.reportFiles,
        ranges: {
          sales: teamAutoEmailRange(rule.salesRange),
          knocks: teamAutoEmailRange(rule.knocksRange),
        },
        requestedBy: input.actorUid,
        metadata: {
          automated: true,
          automationRuleId: rule.ruleId,
          automationRuleName: rule.name,
          automationFrequency: rule.frequency,
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
