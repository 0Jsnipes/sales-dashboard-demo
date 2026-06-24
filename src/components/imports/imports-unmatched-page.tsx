"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ChevronRight, Filter, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import { matchImportRowToRep } from "@/src/lib/matching/matchRep";
import { getMatchConfidenceBadge, groupUnmatchedBySource, normalizeAlias, normalizeImportedName } from "@/src/lib/imports/ui";
import type { Rep } from "@/src/types/rep";

type SalesRow = {
  key: string;
  repUid: string | null;
  displayName: string;
  rawSalesId: string;
  programName?: string;
  vendorType: "organic" | "subVendor" | "unassigned";
  weeklySalesGoal: number;
  managerName: string;
  locationName: string;
  days: number[];
  total: number;
  accountStatuses: Record<string, number>;
};

type SalesResponse = { week: { start: string; end: string }; reps: SalesRow[] };

type UnmatchedRow = {
  id: string;
  rawName: string;
  rawSalesId: string;
  provider: string;
  confidence: number;
  reason: string;
  suggestedRepUid: string | null;
  suggestedRepName: string;
  total: number;
  managerName: string;
};

function ConfidencePill({ confidence }: { confidence: number }) {
  const badge = getMatchConfidenceBadge(confidence);
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function ImportsUnmatchedPage() {
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [sales, setSales] = useState<SalesResponse | null>(null);
  const [roster, setRoster] = useState<Rep[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [suggestedRep, setSuggestedRep] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aliasTarget, setAliasTarget] = useState<UnmatchedRow | null>(null);
  const [aliasRepUid, setAliasRepUid] = useState("");
  const [mobileSheetRow, setMobileSheetRow] = useState<UnmatchedRow | null>(null);

  const loadData = useCallback(async () => {
    const [salesData, rosterData] = await Promise.all([
      authedJson<SalesResponse>(`/api/sales?weekStart=${toDateId(startOfWeek())}`),
      authedJson<{ reps: Rep[] }>("/api/reps?status=active"),
    ]);
    setSales(salesData);
    setRoster(rosterData.reps ?? []);
    const defaults: Record<string, string> = {};
    for (const row of salesData.reps.filter((item) => !item.repUid)) {
      const match = matchImportRowToRep({ rawSalesId: row.rawSalesId, rawRepName: row.displayName }, rosterData.reps);
      if (match.repUid) defaults[row.key] = match.repUid;
    }
    setSuggestedRep(defaults);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadData()
        .catch((cause) => {
          if (!active) return;
          toast.error(cause instanceof Error ? cause.message : "Unable to load unmatched rows.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const rows = useMemo<UnmatchedRow[]>(() => {
    const reps = roster;
    return (sales?.reps ?? [])
      .filter((row) => !row.repUid)
      .map((row) => {
        const match = matchImportRowToRep({ rawSalesId: row.rawSalesId, rawRepName: row.displayName }, reps);
        return {
          id: row.key,
          rawName: row.displayName,
          rawSalesId: row.rawSalesId || "—",
          provider: row.programName || "unknown",
          confidence: match.confidence,
          reason: match.reason,
          suggestedRepUid: match.repUid,
          suggestedRepName: roster.find((item) => item.repUid === match.repUid)?.displayName ?? "No match",
          total: row.total,
          managerName: row.managerName,
        };
      })
      .filter((row) => {
        const term = normalizeImportedName(query);
        const providerMatch = provider === "all" || row.provider === provider;
        if (!providerMatch) return false;
        if (!term) return true;
        return [row.rawName, row.rawSalesId, row.provider, row.suggestedRepName, row.managerName].map(normalizeAlias).join(" ").includes(term);
      });
  }, [provider, query, roster, sales]);

  const grouped = useMemo(() => groupUnmatchedBySource(rows), [rows]);
  const providers = Object.keys(grouped).sort();
  const total = rows.length;
  const highConfidence = rows.filter((row) => row.confidence >= 0.95).length;
  const needsManualReview = rows.filter((row) => row.confidence < 0.95).length;
  const readyToResolve = rows.filter((row) => Boolean(suggestedRep[row.id] || row.suggestedRepUid)).length;
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const resolveRow = useCallback(async (row: UnmatchedRow) => {
    const target = suggestedRep[row.id] || row.suggestedRepUid;
    if (!target) {
      toast.error("Choose a rep first.");
      return;
    }
    setResolvingId(row.id);
    try {
      const response = await authedFetch(`/api/reps/${target}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "addAlias", alias: row.rawName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to resolve row.");
      toast.success("Unmatched row resolved.");
      setSelected((current) => ({ ...current, [row.id]: false }));
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to resolve row.");
    } finally {
      setResolvingId(null);
    }
  }, [loadData, suggestedRep]);

  const openAliasDialog = (row: UnmatchedRow) => {
    setAliasTarget(row);
    setAliasRepUid(suggestedRep[row.id] || row.suggestedRepUid || "");
  };

  const confirmAlias = async () => {
    if (!aliasTarget || !aliasRepUid) return;
    const rep = roster.find((item) => item.repUid === aliasRepUid);
    const alias = normalizeAlias(aliasTarget.rawName);
    if (!rep) return;
    if (rep.aliases.some((value) => normalizeAlias(value) === alias)) {
      toast.message("Alias already exists for that rep.");
      return;
    }
    setResolvingId(aliasTarget.id);
    try {
      const response = await authedFetch(`/api/reps/${aliasRepUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "addAlias", alias: aliasTarget.rawName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add alias.");
      toast.success(`Alias added to ${rep.displayName}.`);
      setAliasTarget(null);
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to add alias.");
    } finally {
      setResolvingId(null);
    }
  };

  if (loading && !sales) {
    return <Card><CardContent className="flex min-h-[240px] items-center justify-center p-6 text-sm text-muted-foreground">Loading unmatched rows...</CardContent></Card>;
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total unmatched", value: total, note: "Imported rows needing review." },
          { label: "High-confidence suggestions", value: highConfidence, note: "Matches above the review threshold." },
          { label: "Needs manual review", value: needsManualReview, note: "Rows with weak or missing signals." },
          { label: "Ready to resolve", value: readyToResolve, note: "Rows with a selected rep." },
        ].map((item) => (
          <Card key={item.label} className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">{item.note}</CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Unmatched review</CardTitle>
            <CardDescription>Resolve low-confidence or unassigned rows before they affect reporting.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{total} rows</Badge>
            <Badge variant="warning">{selectedCount} selected</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1.2fr_.8fr_.8fr]">
          <Input placeholder="Search imported name, ID, provider, suggestion" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={selectedCount === 0} onClick={() => toast.message("Bulk actions can be enabled later without changing the layout.")}>
            <Filter className="h-4 w-4" />
            Bulk resolve ({selectedCount})
          </Button>
        </CardContent>
      </Card>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Filter className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            <p className="font-medium text-foreground">Review before trusting reports</p>
            <p className="text-muted-foreground">Low-confidence or unmatched rows should be confirmed before they are used in reporting.</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Review table</CardTitle>
            <CardDescription>Confidence, suggested rep selector, and resolve actions.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox checked={selectedCount > 0 && selectedCount === rows.length} onCheckedChange={(value) => setSelected(value ? Object.fromEntries(rows.map((row) => [row.id, true])) : {})} />
                    </TableHead>
                    <TableHead>Imported name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Suggested rep</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox checked={selected[row.id] ?? false} onCheckedChange={(value) => setSelected((current) => ({ ...current, [row.id]: !!value }))} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.rawName}</p>
                          <p className="text-xs text-muted-foreground">{row.rawSalesId}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{row.provider}</Badge></TableCell>
                      <TableCell>
                        <Select value={suggestedRep[row.id] ?? row.suggestedRepUid ?? ""} onValueChange={(value) => setSuggestedRep((current) => ({ ...current, [row.id]: value }))}>
                          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Choose rep" /></SelectTrigger>
                          <SelectContent>
                            {roster.map((rep) => <SelectItem key={rep.repUid} value={rep.repUid}>{rep.displayName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><ConfidencePill confidence={row.confidence} /></TableCell>
                      <TableCell className="max-w-[280px] text-sm text-muted-foreground">{row.reason}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="xs" variant="outline" onClick={() => void resolveRow(row)} disabled={resolvingId === row.id}>
                            <CheckCircle2 className="h-4 w-4" />
                            {resolvingId === row.id ? "Resolving..." : "Resolve"}
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => openAliasDialog(row)}>
                            <Users className="h-4 w-4" />
                            Add alias
                          </Button>
                          <Button size="xs" variant="ghost" asChild>
                            <Link href={`/roster?add=1&name=${encodeURIComponent(row.rawName)}&salesId=${encodeURIComponent(row.rawSalesId)}`}>
                              <ChevronRight className="h-4 w-4" />
                              Add rep
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {rows.map((row) => (
                <Card key={row.id} className="border-border/70">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.rawName}</p>
                        <p className="text-sm text-muted-foreground">{row.rawSalesId}</p>
                      </div>
                      <Checkbox checked={selected[row.id] ?? false} onCheckedChange={(value) => setSelected((current) => ({ ...current, [row.id]: !!value }))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{row.provider}</Badge>
                      <ConfidencePill confidence={row.confidence} />
                    </div>
                    <p className="text-sm text-muted-foreground">{row.reason}</p>
                    <div className="space-y-2">
                      <Label>Suggested rep</Label>
                      <Select value={suggestedRep[row.id] ?? row.suggestedRepUid ?? ""} onValueChange={(value) => setSuggestedRep((current) => ({ ...current, [row.id]: value }))}>
                        <SelectTrigger><SelectValue placeholder="Choose rep" /></SelectTrigger>
                        <SelectContent>
                          {roster.map((rep) => <SelectItem key={rep.repUid} value={rep.repUid}>{rep.displayName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="flex-1" onClick={() => setMobileSheetRow(row)}>
                        Review actions
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => void resolveRow(row)} disabled={resolvingId === row.id}>
                        Resolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Safety note</CardTitle>
              <CardDescription>Never auto-commit low-confidence matches.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>A row only resolves after you confirm the target rep and save the alias.</p>
              <p>Manual review keeps ambiguous rows from leaking into reporting.</p>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/imports">Back to import center</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Source breakdown</CardTitle>
              <CardDescription>Rows grouped by provider.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(grouped).map(([key, values]) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{key}</span>
                    <Badge variant="outline">{values.length}</Badge>
                  </div>
                  <Separator />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={Boolean(aliasTarget)} onOpenChange={(open) => !open && setAliasTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add alias</DialogTitle>
            <DialogDescription>Confirm the imported name and choose the rep that should receive the alias.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Imported name</Label>
              <Input value={aliasTarget?.rawName ?? ""} readOnly />
            </div>
            <div className="space-y-1">
              <Label>Existing rep</Label>
              <Select value={aliasRepUid} onValueChange={setAliasRepUid}>
                <SelectTrigger><SelectValue placeholder="Choose rep" /></SelectTrigger>
                <SelectContent>
                  {roster.map((rep) => <SelectItem key={rep.repUid} value={rep.repUid}>{rep.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasTarget(null)}>Cancel</Button>
            <Button onClick={() => void confirmAlias()} disabled={!aliasTarget || !aliasRepUid || resolvingId === aliasTarget?.id}>Confirm alias</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(mobileSheetRow)} onOpenChange={(open) => !open && setMobileSheetRow(null)}>
        <SheetContent side="bottom" className="h-[80vh] overflow-hidden rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Row actions</SheetTitle>
            <SheetDescription>Quick actions for the selected imported row.</SheetDescription>
          </SheetHeader>
          {mobileSheetRow && (
            <ScrollArea className="mt-4 h-[calc(80vh-7rem)] pr-4">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="font-medium">{mobileSheetRow.rawName}</p>
                  <p className="text-sm text-muted-foreground">{mobileSheetRow.rawSalesId}</p>
                </div>
                <Button className="w-full" onClick={() => void resolveRow(mobileSheetRow)} disabled={resolvingId === mobileSheetRow.id}>
                  Resolve row
                </Button>
                <Button variant="outline" className="w-full" onClick={() => openAliasDialog(mobileSheetRow)}>
                  Add alias
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link href={`/roster?add=1&name=${encodeURIComponent(mobileSheetRow.rawName)}&salesId=${encodeURIComponent(mobileSheetRow.rawSalesId)}`}>
                    Add new roster rep
                  </Link>
                </Button>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
