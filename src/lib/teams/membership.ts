export type TeamRecord = { teamId: string; name: string; members?: string[]; repUids?: string[] };

function membersOf(team: TeamRecord) {
  return team.members?.length ? team.members : team.repUids ?? [];
}

export function repUidSetForTeam(teams: TeamRecord[], teamId: string): Set<string> {
  const team = teams.find((item) => item.teamId === teamId);
  return new Set(team ? membersOf(team) : []);
}

export function buildRepToTeamIndex(teams: TeamRecord[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const team of teams) {
    for (const repUid of membersOf(team)) {
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
