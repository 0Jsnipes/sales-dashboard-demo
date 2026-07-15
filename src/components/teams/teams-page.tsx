"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CircleDot, DatabaseZap, Download, Mail, Pencil, Plus, Search, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import type { Rep } from "@/src/types/rep";
import type { Team } from "@/src/types/team";

type TeamForm = { name: string; description: string; color: string; active: boolean; managerRepUid: string };
type ExportRangeMode = "wtd" | "mtd" | "ytd" | "custom";
type ExportFileKind = "att-sales" | "tfiber-sales" | "att-knocks" | "tfiber-knocks";
const blankForm: TeamForm = { name: "", description: "", color: "#2563eb", active: true, managerRepUid: "" };
const exportFileOptions: Array<{ kind: ExportFileKind; label: string; description: string }> = [
  { kind: "att-sales", label: "ATT sales", description: "ATT orders for the selected period." },
  { kind: "tfiber-sales", label: "T-Fiber sales", description: "T-Fiber orders for the selected period." },
  { kind: "att-knocks", label: "ATT knocks", description: "ATT knock activity for the selected period." },
  { kind: "tfiber-knocks", label: "T-Fiber knocks", description: "T-Fiber knock activity for the selected period." },
];
const allExportFiles = () => new Set<ExportFileKind>(exportFileOptions.map((option) => option.kind));

function dateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function presetRange(mode: Exclude<ExportRangeMode, "custom">) {
  const today = new Date();
  if (mode === "ytd") return { start: dateId(new Date(today.getFullYear(), 0, 1)), end: dateId(today) };
  if (mode === "mtd") return { start: dateId(new Date(today.getFullYear(), today.getMonth(), 1)), end: dateId(today) };
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return { start: dateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset)), end: dateId(today) };
}

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canPrepareExports, setCanPrepareExports] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [editor, setEditor] = useState<Team | "new" | null>(null);
  const [form, setForm] = useState<TeamForm>(blankForm);
  const [editorMembers, setEditorMembers] = useState<Set<string>>(new Set());
  const [editorMemberQuery, setEditorMemberQuery] = useState("");
  const [managerTeamOpen, setManagerTeamOpen] = useState(false);
  const [managerTeamKey, setManagerTeamKey] = useState("");
  const [managerTeamName, setManagerTeamName] = useState("");
  const [creatingManagerTeam, setCreatingManagerTeam] = useState(false);
  const [memberTeam, setMemberTeam] = useState<Team | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [exportTeam, setExportTeam] = useState<Team | null>(null);
  const [exportRangeMode, setExportRangeMode] = useState<ExportRangeMode>("mtd");
  const [customStart, setCustomStart] = useState(dateId(new Date()));
  const [customEnd, setCustomEnd] = useState(dateId(new Date()));
  const [selectedExportFiles, setSelectedExportFiles] = useState<Set<ExportFileKind>>(allExportFiles);
  const [exporting, setExporting] = useState(false);
  const [emailTeam, setEmailTeam] = useState<Team | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("Orders to date");
  const [emailMessage, setEmailMessage] = useState("Hello,\n\nYour team's sales and knock data for the year to date.");
  const [emailFiles, setEmailFiles] = useState<Set<ExportFileKind>>(allExportFiles);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [preparingExports, setPreparingExports] = useState(false);

  const load = useCallback(() => {
    return authedJson<{ teams: Team[]; canManage: boolean; canPrepareExports: boolean }>("/api/teams")
      .then(async (teamResult) => {
        setTeams(teamResult.teams ?? []);
        setCanManage(teamResult.canManage);
        setCanPrepareExports(teamResult.canPrepareExports);
        if (teamResult.canManage) {
          const roster = await authedJson<{ reps: Rep[] }>("/api/reps?status=all");
          setReps(roster.reps ?? []);
        }
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to load teams.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.teamId, team.name])), [teams]);
  const repById = useMemo(() => new Map(reps.map((rep) => [rep.repUid, rep])), [reps]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return teams.filter((team) => {
      if (status === "active" && !team.active) return false;
      if (status === "inactive" && team.active) return false;
      return !term || `${team.name} ${team.description}`.toLowerCase().includes(term);
    });
  }, [query, status, teams]);

  const visibleReps = useMemo(() => {
    const term = memberQuery.trim().toLowerCase();
    return reps.filter((rep) => !term || `${rep.displayName} ${rep.email}`.toLowerCase().includes(term));
  }, [memberQuery, reps]);

  const editorVisibleReps = useMemo(() => {
    const term = editorMemberQuery.trim().toLowerCase();
    return reps
      .filter((rep) => rep.status === "active" || editorMembers.has(rep.repUid))
      .filter((rep) => !term || `${rep.displayName} ${rep.email} ${rep.managerName}`.toLowerCase().includes(term))
      .sort((left, right) => Number(editorMembers.has(right.repUid)) - Number(editorMembers.has(left.repUid)) || left.displayName.localeCompare(right.displayName));
  }, [editorMemberQuery, editorMembers, reps]);

  const managerGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; repUids: string[] }>();
    for (const rep of reps) {
      const name = rep.managerName.trim();
      if (rep.status !== "active" || !name) continue;
      const key = name.toLowerCase();
      const group = groups.get(key) ?? { key, name, repUids: [] };
      group.repUids.push(rep.repUid);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [reps]);

  function membersFor(team: Team) {
    const details = new Map(team.memberDetails?.map((member) => [member.repUid, member]) ?? []);
    return team.members.map((repUid) => {
      const rep = repById.get(repUid);
      return details.get(repUid) ?? {
        repUid,
        displayName: rep?.displayName || "Unknown rep",
        email: rep?.email || "",
        status: rep?.status || "",
      };
    });
  }

  function openEditor(team?: Team) {
    setEditor(team ?? "new");
    setForm(team ? { name: team.name, description: team.description, color: team.color, active: team.active, managerRepUid: team.managerRepUid ?? "" } : blankForm);
    setEditorMembers(new Set(team?.members ?? []));
    setEditorMemberQuery("");
  }

  function openManagerTeam() {
    setManagerTeamKey("");
    setManagerTeamName("");
    setManagerTeamOpen(true);
  }

  function selectManagerTeam(key: string) {
    const manager = managerGroups.find((item) => item.key === key);
    setManagerTeamKey(key);
    setManagerTeamName(manager ? `${manager.name} Team` : "");
  }

  async function createManagerTeam() {
    const manager = managerGroups.find((item) => item.key === managerTeamKey);
    if (!manager) return toast.error("Choose a manager.");
    if (managerTeamName.trim().length < 2) return toast.error("Enter a team name with at least two characters.");
    setCreatingManagerTeam(true);
    try {
      await authedJson("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: managerTeamName.trim(),
          description: `Team for ${manager.name} and their reps.`,
          color: "#2563eb",
          active: true,
          members: manager.repUids,
          managerRepUid: reps.find((rep) => rep.displayName.trim().toLowerCase() === manager.name.trim().toLowerCase())?.repUid ?? null,
        }),
      });
      toast.success(`${managerTeamName.trim()} created with ${manager.repUids.length} ${manager.repUids.length === 1 ? "rep" : "reps"}.`);
      setManagerTeamOpen(false);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create the manager team.");
    } finally {
      setCreatingManagerTeam(false);
    }
  }

  async function saveTeam() {
    if (form.name.trim().length < 2) return toast.error("Enter a team name with at least two characters.");
    setSaving(true);
    try {
      await authedJson(editor === "new" ? "/api/teams" : `/api/teams/${(editor as Team).teamId}`, {
        method: editor === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ ...form, ...(form.active ? { members: [...editorMembers] } : {}), managerRepUid: form.managerRepUid || null, name: form.name.trim(), description: form.description.trim() }),
      });
      toast.success(editor === "new" ? "Team created." : "Team updated.");
      setEditor(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save team.");
    } finally {
      setSaving(false);
    }
  }

  function openMembers(team: Team) {
    setMemberTeam(team);
    setMemberQuery("");
    setSelectedMembers(new Set(team.members));
  }

  async function saveMembers() {
    if (!memberTeam) return;
    setSaving(true);
    try {
      await authedJson(`/api/teams/${memberTeam.teamId}`, {
        method: "PATCH",
        body: JSON.stringify({ members: [...selectedMembers] }),
      });
      toast.success("Team membership synchronized.");
      setMemberTeam(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update members.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(team: Team) {
    if (!window.confirm(`Archive ${team.name}? Its historical assignments will remain intact.`)) return;
    try {
      await authedJson(`/api/teams/${team.teamId}`, { method: "DELETE" });
      toast.success("Team archived.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to archive team.");
    }
  }

  function openExport(team: Team) {
    const range = presetRange("mtd");
    setExportTeam(team);
    setExportRangeMode("mtd");
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setSelectedExportFiles(allExportFiles());
  }

  async function downloadTeamExports() {
    if (!exportTeam) return;
    const kinds = [...selectedExportFiles];
    if (!kinds.length) return toast.error("Select at least one file.");
    const range = exportRangeMode === "custom" ? { start: customStart, end: customEnd } : presetRange(exportRangeMode);
    if (!range.start || !range.end || range.start > range.end) return toast.error("Choose a valid export date range.");
    setExporting(true);
    try {
      const params = new URLSearchParams(range);
      const getFile = async (kind: ExportFileKind) => {
        const [provider, dataKind] = kind.split("-") as ["att" | "tfiber", "sales" | "knocks"];
        const fileParams = new URLSearchParams(params);
        fileParams.set("provider", provider);
        const response = await authedFetch(`/api/teams/${exportTeam.teamId}/export/${dataKind}?${fileParams.toString()}`);
        if (!response.ok) {
          const result = await response.json().catch(() => ({ error: `Unable to export ${kind}.` })) as { error?: string };
          throw new Error(result.error || `Unable to export ${kind}.`);
        }
        const disposition = response.headers.get("content-disposition") ?? "";
        const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `${kind}-${range.start}-to-${range.end}.xlsx`;
        return { blob: await response.blob(), fileName };
      };
      const files = await Promise.all(kinds.map(getFile));
      for (const file of files) {
        const url = URL.createObjectURL(file.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.fileName;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(`Downloaded ${kinds.length} ${kinds.length === 1 ? "workbook" : "workbooks"}.`);
      setExportTeam(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to export team data.");
    } finally {
      setExporting(false);
    }
  }

  function openEmail(team: Team) {
    setEmailTeam(team);
    setEmailRecipient(team.managerDetails?.email ?? "");
    setEmailSubject("Orders to date");
    setEmailMessage("Hello,\n\nYour team's sales and knock data for the year to date.");
    setEmailFiles(allExportFiles());
  }

  async function sendTeamEmail() {
    if (!emailTeam) return;
    if (!emailRecipient.trim()) return toast.error("Enter the manager's email address.");
    if (!emailFiles.size) return toast.error("Select at least one file to email.");
    const range = presetRange("ytd");
    setSendingEmail(true);
    try {
      const result = await authedJson<{ recipient: string; queued: boolean }>(`/api/teams/${emailTeam.teamId}/email`, {
        method: "POST",
        body: JSON.stringify({
          recipient: emailRecipient.trim(),
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
          files: [...emailFiles],
          ...range,
        }),
      });
      toast.success(`Year-to-date email queued for ${result.recipient}.`);
      setEmailTeam(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to email team data.");
    } finally {
      setSendingEmail(false);
    }
  }

  async function prepareExportData() {
    setPreparingExports(true);
    try {
      const response = await authedFetch("/api/knocks/export-cache", { method: "POST" });
      const result = await response.json() as { uploadsProcessed?: number; uploadsSkipped?: number; daysWritten?: number; rowsWritten?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to prepare export data.");
      toast.success(`Export data prepared: ${result.rowsWritten ?? 0} rows across ${result.daysWritten ?? 0} days.`);
      if (result.uploadsSkipped) toast.warning(`${result.uploadsSkipped} unavailable source upload${result.uploadsSkipped === 1 ? " was" : "s were"} skipped.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to prepare export data.");
    } finally {
      setPreparingExports(false);
    }
  }

  if (loading && !teams.length) {
    return <div className="space-y-4"><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>;
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><AlertTitle>Teams unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader className="gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl"><UsersRound className="h-6 w-6 text-primary" />Reporting teams</CardTitle>
              <CardDescription className="mt-2">Group reps for analytics and exports independently from manager hierarchy.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">{canPrepareExports ? <Button variant="outline" disabled={preparingExports} onClick={() => void prepareExportData()}><DatabaseZap className="h-4 w-4" />{preparingExports ? "Preparing exports..." : "Prepare export data"}</Button> : null}{canManage ? <><Button variant="outline" onClick={openManagerTeam}><UsersRound className="h-4 w-4" />Create manager team</Button><Button onClick={() => openEditor()}><Plus className="h-4 w-4" />Create Team</Button></> : null}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search teams" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active teams</SelectItem><SelectItem value="inactive">Archived teams</SelectItem><SelectItem value="all">All teams</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Team manager</TableHead><TableHead>Description</TableHead><TableHead>Members</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length ? filtered.map((team) => (
                  <TableRow key={team.teamId}>
                    <TableCell><div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full ring-4 ring-muted" style={{ backgroundColor: team.color }} /><span className="font-medium">{team.name}</span></div></TableCell>
                    <TableCell><div><p className="font-medium">{team.managerDetails?.displayName || "Not assigned"}</p>{team.managerDetails?.email ? <p className="text-xs text-muted-foreground">{team.managerDetails.email}</p> : null}</div></TableCell>
                    <TableCell className="max-w-md text-muted-foreground">{team.description || "No description"}</TableCell>
                    <TableCell><TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild><Badge variant="secondary" tabIndex={0} className="cursor-help" aria-label={`${team.members.length} ${team.members.length === 1 ? "member" : "members"}. Hover to view names.`}>{team.members.length} {team.members.length === 1 ? "member" : "members"}</Badge></TooltipTrigger><TooltipContent side="right" align="start" className="max-h-72 w-72 overflow-y-auto p-0"><div className="border-b px-3 py-2"><p className="font-medium">{team.name} members</p><p className="text-xs text-muted-foreground">{team.members.length} total</p></div>{team.members.length ? <div className="divide-y">{membersFor(team).map((member) => <div key={member.repUid} className="px-3 py-2"><p className="font-medium">{member.displayName}</p>{member.email ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}</div>)}</div> : <p className="px-3 py-4 text-muted-foreground">No members assigned.</p>}</TooltipContent></Tooltip></TooltipProvider></TableCell>
                    <TableCell><Badge variant={team.active ? "success" : "outline"}><CircleDot className="h-3 w-3" />{team.active ? "Active" : "Archived"}</Badge></TableCell>
                    <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => openExport(team)}><Download className="h-4 w-4" />Export</Button>{canManage ? <><Button variant="ghost" size="sm" onClick={() => openEmail(team)}><Mail className="h-4 w-4" />Email</Button><Button variant="ghost" size="sm" onClick={() => openEditor(team)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="ghost" size="sm" disabled={!team.active} onClick={() => openMembers(team)}><UsersRound className="h-4 w-4" />Members</Button>{team.active ? <Button variant="ghost" size="sm" onClick={() => void archive(team)}><Archive className="h-4 w-4" />Archive</Button> : null}</> : null}</div></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No teams match the current view.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editor === "new" ? "Create team" : "Edit team"}</DialogTitle><DialogDescription>Review the current team, assign its manager, and add or remove representatives in one place.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="team-name">Team name</Label><Input id="team-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="team-description">Description</Label><Input id="team-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="team-manager">Team manager</Label><Select value={form.managerRepUid || "__none__"} onValueChange={(value) => setForm({ ...form, managerRepUid: value === "__none__" ? "" : value })}><SelectTrigger id="team-manager"><SelectValue placeholder="Choose a manager" /></SelectTrigger><SelectContent><SelectItem value="__none__">No team manager</SelectItem>{reps.filter((rep) => rep.status === "active").map((rep) => <SelectItem key={rep.repUid} value={rep.repUid}>{rep.displayName}{rep.email ? ` — ${rep.email}` : " — no email"}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Email exports go to this person when an email is listed.</p></div>
            <div className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3"><div><Label htmlFor="team-editor-member-search">Team members</Label><p className="text-xs text-muted-foreground">Current members are checked and shown first. Selecting someone from another team will move them here when saved.</p></div><Badge variant="secondary">{editorMembers.size} selected</Badge></div>
              {!form.active ? <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">Reactivate this team before changing its members.</p> : null}
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="team-editor-member-search" className="pl-9" placeholder="Search representatives" value={editorMemberQuery} onChange={(event) => setEditorMemberQuery(event.target.value)} disabled={!form.active} /></div>
              <ScrollArea className="h-64 rounded-xl border">
                <div className="divide-y">
                  {editorVisibleReps.length ? editorVisibleReps.map((rep) => {
                    const checked = editorMembers.has(rep.repUid);
                    const existingTeam = rep.teamId ? teamNameById.get(rep.teamId) : null;
                    return (
                      <label key={rep.repUid} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50">
                        <Checkbox disabled={!form.active} checked={checked} onCheckedChange={(value) => setEditorMembers((current) => { const next = new Set(current); if (value === true) next.add(rep.repUid); else next.delete(rep.repUid); return next; })} />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{rep.displayName}</p><p className="truncate text-xs text-muted-foreground">{rep.email || "No email"}</p></div>
                        <Badge variant={checked ? "secondary" : "outline"}>{checked ? "On this team" : existingTeam ? existingTeam : "No team"}</Badge>
                      </label>
                    );
                  }) : <p className="p-6 text-center text-sm text-muted-foreground">No representatives match this search.</p>}
                </div>
              </ScrollArea>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-4"><div className="space-y-2"><Label htmlFor="team-color">Color</Label><Input id="team-color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div><Input type="color" aria-label="Choose team color" className="h-10 w-14 p-1" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div>
            <label className="flex items-center justify-between rounded-xl border p-3"><span><span className="block text-sm font-medium">Active</span><span className="text-xs text-muted-foreground">Active teams can receive new members.</span></span><Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button disabled={saving} onClick={() => void saveTeam()}>{saving ? "Saving..." : "Save team"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={managerTeamOpen} onOpenChange={(open) => { if (!creatingManagerTeam) setManagerTeamOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create manager team</DialogTitle><DialogDescription>Select a manager to create a team containing all of their active reps. Reps already assigned elsewhere will move to the new team.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-manager-team-manager">Manager</Label>
              <Select value={managerTeamKey} onValueChange={selectManagerTeam}>
                <SelectTrigger id="new-manager-team-manager"><SelectValue placeholder="Choose a manager" /></SelectTrigger>
                <SelectContent>{managerGroups.map((manager) => <SelectItem key={manager.key} value={manager.key}>{manager.name} ({manager.repUids.length} {manager.repUids.length === 1 ? "rep" : "reps"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-manager-team-name">Team name</Label>
              <Input id="new-manager-team-name" value={managerTeamName} onChange={(event) => setManagerTeamName(event.target.value)} placeholder="Manager name Team" maxLength={120} />
            </div>
            {managerTeamKey ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">This will add {managerGroups.find((item) => item.key === managerTeamKey)?.repUids.length ?? 0} active reps to the new team.</p> : null}
          </div>
          <DialogFooter><Button variant="outline" disabled={creatingManagerTeam} onClick={() => setManagerTeamOpen(false)}>Cancel</Button><Button disabled={creatingManagerTeam || !managerTeamKey || managerTeamName.trim().length < 2} onClick={() => void createManagerTeam()}>{creatingManagerTeam ? "Creating team..." : "Create manager team"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(exportTeam)} onOpenChange={(open) => !open && !exporting && setExportTeam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export {exportTeam?.name}</DialogTitle><DialogDescription>Select which source-style Excel files to download. Each file is filtered to this team&apos;s current members.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Files to download</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {exportFileOptions.map((option) => <FileOption key={option.kind} option={option} checked={selectedExportFiles.has(option.kind)} onCheckedChange={(checked) => setSelectedExportFiles((current) => { const next = new Set(current); if (checked) next.add(option.kind); else next.delete(option.kind); return next; })} />)}
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="team-export-range">Date range</Label><Select value={exportRangeMode} onValueChange={(value) => setExportRangeMode(value as ExportRangeMode)}><SelectTrigger id="team-export-range"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wtd">WTD</SelectItem><SelectItem value="mtd">MTD</SelectItem><SelectItem value="ytd">YTD</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select></div>
            {exportRangeMode === "custom" ? <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="team-export-start">Start date</Label><Input id="team-export-start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="team-export-end">End date</Label><Input id="team-export-end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div></div> : <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{(() => { const range = presetRange(exportRangeMode); return `${range.start} through ${range.end}`; })()}</p>}
            {[...selectedExportFiles].some((kind) => kind.endsWith("knocks")) ? <p className="text-xs text-muted-foreground">Knocks workbooks are rebuilt from stored source uploads, so larger date histories may take a moment.</p> : null}
          </div>
          <DialogFooter><Button variant="outline" disabled={exporting} onClick={() => setExportTeam(null)}>Cancel</Button><Button disabled={exporting || selectedExportFiles.size === 0} onClick={() => void downloadTeamExports()}><Download className="h-4 w-4" />{exporting ? `Building ${selectedExportFiles.size} ${selectedExportFiles.size === 1 ? "file" : "files"}...` : selectedExportFiles.size ? `Download ${selectedExportFiles.size} ${selectedExportFiles.size === 1 ? "file" : "files"}` : "Select a file"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(emailTeam)} onOpenChange={(open) => { if (!open && !sendingEmail) setEmailTeam(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email {emailTeam?.name} year-to-date data</DialogTitle>
            <DialogDescription>
              {emailTeam?.managerDetails
                ? `Assigned team manager: ${emailTeam.managerDetails.displayName}. Their saved email is used automatically when available.`
                : "No team manager is assigned. Enter the recipient email manually or assign a manager from Edit team."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="team-email-recipient">Manager email</Label><Input id="team-email-recipient" type="email" value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} placeholder="manager@example.com" /></div>
              <div className="space-y-2"><Label htmlFor="team-email-subject">Subject</Label><Input id="team-email-subject" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="team-email-message">Message</Label><Textarea id="team-email-message" rows={5} value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} /></div>
            <div className="space-y-2">
              <Label>Year-to-date attachments</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {exportFileOptions.map((option) => <FileOption key={option.kind} option={option} checked={emailFiles.has(option.kind)} onCheckedChange={(checked) => setEmailFiles((current) => { const next = new Set(current); if (checked) next.add(option.kind); else next.delete(option.kind); return next; })} />)}
              </div>
              <p className="text-xs text-muted-foreground">{(() => { const range = presetRange("ytd"); return `${range.start} through ${range.end}`; })()}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={sendingEmail} onClick={() => setEmailTeam(null)}>Cancel</Button>
            <Button disabled={sendingEmail || !emailRecipient.trim() || !emailSubject.trim() || !emailMessage.trim() || emailFiles.size === 0} onClick={() => void sendTeamEmail()}><Mail className="h-4 w-4" />{sendingEmail ? "Sending..." : `Send ${emailFiles.size} ${emailFiles.size === 1 ? "file" : "files"}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memberTeam)} onOpenChange={(open) => !open && setMemberTeam(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Manage {memberTeam?.name} members</DialogTitle><DialogDescription>{selectedMembers.size} selected. Adding a rep here automatically removes them from any prior team.</DialogDescription></DialogHeader>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search by name or email" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} /></div>
          <ScrollArea className="h-[420px] rounded-xl border">
            <div className="divide-y">
              {visibleReps.map((rep) => {
                const checked = selectedMembers.has(rep.repUid);
                return <label key={rep.repUid} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"><Checkbox checked={checked} onCheckedChange={(value) => setSelectedMembers((current) => { const next = new Set(current); if (value === true) next.add(rep.repUid); else next.delete(rep.repUid); return next; })} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{rep.displayName}</p><p className="truncate text-xs text-muted-foreground">{rep.email || "No email"}</p></div><Badge variant="outline">{checked ? memberTeam?.name : rep.teamId ? teamNameById.get(rep.teamId) ?? "Other team" : "No team"}</Badge></label>;
              })}
            </div>
          </ScrollArea>
          <DialogFooter><Button variant="outline" onClick={() => setMemberTeam(null)}>Cancel</Button><Button disabled={saving} onClick={() => void saveMembers()}>{saving ? "Saving..." : `Save ${selectedMembers.size} members`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileOption({ option, checked, onCheckedChange }: {
  option: { kind: ExportFileKind; label: string; description: string };
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span><span className="block text-sm font-medium">{option.label}</span><span className="text-xs text-muted-foreground">{option.description}</span></span>
    </label>
  );
}
