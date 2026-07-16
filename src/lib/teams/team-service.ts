import "server-only";

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import type { Rep } from "@/src/types/rep";
import type { Team } from "@/src/types/team";

const TEAMS = "teams";
const REPS = "reps";
const USERS = "users";

type TeamInput = Pick<Team, "name" | "description" | "color" | "active" | "managerRepUid">;

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
    managerRepUid: typeof data.managerRepUid === "string" && data.managerRepUid.trim() ? data.managerRepUid.trim() : null,
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

function normalizedManagerName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Finds one unambiguous active reporting team for a roster manager. */
export async function findTeamForManager(managerUid: string | null | undefined, managerName: string, db: Firestore = getAdminDb()) {
  const teams = await getActiveTeams(db);
  const matches = new Map<string, Team>();
  if (managerUid) {
    for (const team of teams) if (team.managerRepUid === managerUid) matches.set(team.teamId, team);
  }
  const normalizedName = normalizedManagerName(managerName);
  if (normalizedName) {
    const managedTeams = teams.filter((team) => team.managerRepUid);
    const managerRepUids = [...new Set(managedTeams.map((team) => team.managerRepUid!))];
    const managerSnapshots = managerRepUids.length
      ? await db.getAll(...managerRepUids.map((repUid) => db.collection(REPS).doc(repUid)))
      : [];
    const managerNameByRepUid = new Map(managerSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, normalizedManagerName(String(snapshot.data()?.displayName ?? ""))]));
    for (const team of managedTeams) {
      if (managerNameByRepUid.get(team.managerRepUid!) === normalizedName) matches.set(team.teamId, team);
    }
    for (const team of teams) {
      const teamName = normalizedManagerName(team.name);
      if (teamName === normalizedName || teamName === `${normalizedName} team`) matches.set(team.teamId, team);
    }
  }
  return matches.size === 1 ? [...matches.values()][0]! : null;
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
    managerRepUid: data.managerRepUid,
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

/** Sets the rep's primary roster team without removing manually added reporting-team memberships. */
export async function assignUserToTeam(repUid: string, newTeamId: string | null, actorUid: string, db: Firestore = getAdminDb()) {
  await db.runTransaction(async (transaction) => {
    const repRef = db.collection(REPS).doc(repUid);
    const [repSnapshot, teamsSnapshot] = await Promise.all([
      transaction.get(repRef),
      transaction.get(db.collection(TEAMS)),
    ]);
    if (!repSnapshot.exists) throw new Error("REP_NOT_FOUND");
    const rep = repSnapshot.data() as Rep;
    const previousTeamId = rep.teamId ?? null;
    const teamDocs = teamsSnapshot.docs.map((document) => ({ reference: document.ref, team: normalizeTeam(document.id, document.data()) }));
    if (newTeamId && !teamDocs.some(({ team }) => team.teamId === newTeamId && team.active)) throw new Error("ACTIVE_TEAM_NOT_FOUND");

    for (const { reference, team } of teamDocs) {
      if (team.teamId !== previousTeamId && team.teamId !== newTeamId) continue;
      const members = team.teamId === previousTeamId && previousTeamId !== newTeamId
        ? team.members.filter((id) => id !== repUid)
        : [...team.members, repUid];
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

/** Reconciles one reporting team's members without changing any other team memberships. */
export async function syncTeamMembers(teamId: string, memberIds: string[], actorUid: string, db: Firestore = getAdminDb()) {
  const desired = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  if (desired.length > 400) throw new Error("TEAM_MEMBER_LIMIT_EXCEEDED");
  const target = await getTeamById(teamId, db);
  if (!target) throw new Error("TEAM_NOT_FOUND");
  if (!target.active) throw new Error("TEAM_ARCHIVED");
  const desiredReps = desired.length ? await db.getAll(...desired.map((repUid) => db.collection(REPS).doc(repUid))) : [];
  if (desiredReps.some((snapshot) => !snapshot.exists)) throw new Error("REP_NOT_FOUND");
  await db.collection(TEAMS).doc(teamId).update({
    members: desired,
    repUids: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  });
}
