export type TeamRecord = { teamId: string; name: string; repUids: string[] };

export function repUidSetForTeam(teams: TeamRecord[], teamId: string): Set<string> {
  return new Set(teams.find((team) => team.teamId === teamId)?.repUids ?? []);
}

export function buildRepToTeamIndex(teams: TeamRecord[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const team of teams) {
    for (const repUid of team.repUids) {
      const entry = index.get(repUid) ?? new Set<string>();
      entry.add(team.teamId);
      index.set(repUid, entry);
    }
  }
  return index;
}

export function teamMatches(repUid: string | null | undefined, teamFilter: string, index: Map<string, Set<string>>): boolean {
  if (teamFilter === "all") return true;
  if (!repUid) return false;
  return index.get(repUid)?.has(teamFilter) ?? false;
}
