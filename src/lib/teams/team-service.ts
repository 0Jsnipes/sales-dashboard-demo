import "server-only";

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import type { Rep } from "@/src/types/rep";
import type { Team } from "@/src/types/team";

const TEAMS = "teams";
const REPS = "reps";
const USERS = "users";

type TeamInput = Pick<Team, "name" | "description" | "color" | "active">;

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

export function normalizeTeam(teamId: string, data: Record<string, unknown>): Team {
  const members = uniqueIds(data.members);
  return {
    teamId,
    name: String(data.name ?? "Untitled team").trim(),
    description: String(data.description ?? "").trim(),
    color: String(data.color ?? "#2563eb"),
    active: data.active !== false,
    members: members.length ? members : uniqueIds(data.repUids),
    createdAt: data.createdAt,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    updatedAt: data.updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  };
}

export async function getTeams(db: Firestore = getAdminDb()) {
  const snapshot = await db.collection(TEAMS).get();
  return snapshot.docs
    .map((document) => normalizeTeam(document.id, document.data()))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getActiveTeams(db: Firestore = getAdminDb()) {
  return (await getTeams(db)).filter((team) => team.active);
}

export async function getTeamById(teamId: string, db: Firestore = getAdminDb()) {
  const snapshot = await db.collection(TEAMS).doc(teamId).get();
  return snapshot.exists ? normalizeTeam(snapshot.id, snapshot.data() ?? {}) : null;
}

export async function createTeam(data: TeamInput, actorUid: string, db: Firestore = getAdminDb()) {
  const reference = db.collection(TEAMS).doc();
  const team = {
    teamId: reference.id,
    name: data.name.trim(),
    description: data.description.trim(),
    color: data.color,
    active: data.active,
    members: [],
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  };
  await reference.create(team);
  return normalizeTeam(reference.id, team);
}

export async function updateTeam(teamId: string, data: Partial<TeamInput>, actorUid: string, db: Firestore = getAdminDb()) {
  const reference = db.collection(TEAMS).doc(teamId);
  await reference.update({ ...data, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorUid });
  return getTeamById(teamId, db);
}

export async function archiveTeam(teamId: string, actorUid: string, db: Firestore = getAdminDb()) {
  return updateTeam(teamId, { active: false }, actorUid, db);
}

function updateLinkedUser(transaction: Transaction, db: Firestore, rep: Rep, teamId: string | null) {
  if (!rep.authUid) return;
  transaction.set(db.collection(USERS).doc(rep.authUid), { teamId }, { merge: true });
}

/**
 * Assigns one roster rep to exactly one reporting team. All team documents are
 * read inside the transaction so legacy/stray membership is removed as well.
 */
export async function assignUserToTeam(repUid: string, newTeamId: string | null, actorUid: string, db: Firestore = getAdminDb()) {
  await db.runTransaction(async (transaction) => {
    const repRef = db.collection(REPS).doc(repUid);
    const [repSnapshot, teamsSnapshot] = await Promise.all([
      transaction.get(repRef),
      transaction.get(db.collection(TEAMS)),
    ]);
    if (!repSnapshot.exists) throw new Error("REP_NOT_FOUND");
    const rep = repSnapshot.data() as Rep;
    const teamDocs = teamsSnapshot.docs.map((document) => ({ reference: document.ref, team: normalizeTeam(document.id, document.data()) }));
    if (newTeamId && !teamDocs.some(({ team }) => team.teamId === newTeamId && team.active)) throw new Error("ACTIVE_TEAM_NOT_FOUND");

    for (const { reference, team } of teamDocs) {
      const members = team.members.filter((id) => id !== repUid);
      if (team.teamId === newTeamId) members.push(repUid);
      if (members.length !== team.members.length || team.teamId === newTeamId || team.repUids?.includes(repUid)) {
        transaction.update(reference, {
          members: [...new Set(members)],
          repUids: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actorUid,
        });
      }
    }
    transaction.update(repRef, { teamId: newTeamId, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorUid });
    updateLinkedUser(transaction, db, rep, newTeamId);
  });
}

export async function removeUserFromTeam(repUid: string, teamId: string, actorUid: string, db: Firestore = getAdminDb()) {
  const rep = await db.collection(REPS).doc(repUid).get();
  if (!rep.exists) throw new Error("REP_NOT_FOUND");
  if ((rep.data() as Rep).teamId && (rep.data() as Rep).teamId !== teamId) return;
  await assignUserToTeam(repUid, null, actorUid, db);
}

/** Reconciles a team's desired member list and moves reps from prior teams atomically. */
export async function syncTeamMembers(teamId: string, memberIds: string[], actorUid: string, db: Firestore = getAdminDb()) {
  const desired = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  if (desired.length > 400) throw new Error("TEAM_MEMBER_LIMIT_EXCEEDED");
  const target = await getTeamById(teamId, db);
  if (!target) throw new Error("TEAM_NOT_FOUND");
  if (!target.active) throw new Error("TEAM_ARCHIVED");
  const desiredSet = new Set(desired);
  const currentSet = new Set(target.members);
  const desiredReps = desired.length ? await db.getAll(...desired.map((repUid) => db.collection(REPS).doc(repUid))) : [];
  if (desiredReps.some((snapshot) => !snapshot.exists)) throw new Error("REP_NOT_FOUND");
  const repTeamIds = new Map(desiredReps.map((snapshot) => [snapshot.id, (snapshot.data() as Rep).teamId ?? null]));
  const additions = desired.filter((repUid) => !currentSet.has(repUid) || repTeamIds.get(repUid) !== teamId);
  const removals = target.members.filter((repUid) => !desiredSet.has(repUid));

  // Each assignment is its own transaction. This keeps every rep/team/user
  // relationship consistent without approaching Firestore's 500-write limit
  // when a large team is replaced in one UI save.
  for (const repUid of additions) await assignUserToTeam(repUid, teamId, actorUid, db);
  for (const repUid of removals) await removeUserFromTeam(repUid, teamId, actorUid, db);
}
