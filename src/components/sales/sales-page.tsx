"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Search, UserPlus, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { formatNumber } from "@/src/lib/formatters/number";
import { endOfWeek, isoWeek, startOfWeek, toDateId, weekDates, weekRangeLabel } from "@/src/lib/date/week";
import { useAuth } from "@/src/components/auth-provider";
import { extractSalesOrder, type RawSalesOrder, type SalesDataset, type SalesRepGroup } from "@/src/lib/sales/grouping";
import { RepEditorDialog, blankRepEditorForm, type RepEditorForm } from "@/src/components/roster/rep-editor-dialog";
import type { ManagerOption } from "@/src/types/manager";

type SalesResponse = {
  week: { start: string; end: string };
  reps: Array<SalesRepGroup & { orders?: RawSalesOrder[] }>;
};

type RosterOption = { repUid: string; displayName: string; email: string };
type LocationOption = { locationId: string; name: string };
type SalesManagerOption = ManagerOption;
type ViewMode = "rep" | "team";

type ActionTarget = {
  rep: SalesRepGroup;
  type: "goal" | "alias" | "location" | "roster";
};

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-[320px] rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-2xl bg-muted/40 p-3">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function weekDayName(dateId: string) {
  return new Date(`${dateId}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

function weekColumnClass(index: number) {
  return index % 2 === 0 ? "bg-muted/20" : "bg-background";
}

function shiftWeekStart(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateId(date);
}

export function SalesPage() {
  useAuth();
  const reducedMotion = useReducedMotion();
  const [weekStart, setWeekStart] = useQueryState("weekStart", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [managerFilter, setManagerFilter] = useQueryState("manager", parseAsString.withDefault("all"));
  const [repFilter, setRepFilter] = useQueryState("rep", parseAsString.withDefault("all"));
  const [locationFilter, setLocationFilter] = useQueryState("location", parseAsString.withDefault("all"));
  const [viewMode, setViewMode] = useQueryState("view", parseAsString.withDefault("rep"));
  const [data, setData] = useState<SalesDataset | null>(null);
  const [rosterOptions, setRosterOptions] = useState<RosterOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [managers, setManagers] = useState<SalesManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [aliasTargetRepUid, setAliasTargetRepUid] = useState("");
  const [goalDraft, setGoalDraft] = useState("0");
  const [newRepForm, setNewRepForm] = useState<RepEditorForm>(blankRepEditorForm);
  const [newRepName, setNewRepName] = useState("");
  const [newRepLocationId, setNewRepLocationId] = useState("");
  const [newRepGoal, setNewRepGoal] = useState("0");
  const [locationId, setLocationId] = useState("");
  const [locationMode, setLocationMode] = useState<"forward" | "single">("forward");
  const [locationWeek, setLocationWeek] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) setLoading(true);
    }, 0);
    const load = async () => {
      try {
        const params = new URLSearchParams({
          weekStart,
          includeOrders: "true",
          search: search.trim(),
          manager: managerFilter,
          location: locationFilter,
          rep: repFilter,
        });
        const response = await authedJson<SalesResponse>(`/api/sales?${params.toString()}`);
        if (!active) return;
        setError(null);
        setData({
          week: response.week,
          reps: response.reps.map((rep) => ({
            ...rep,
            orders: (rep.orders ?? []).map(extractSalesOrder),
          })),
        });
      } catch (cause) {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load sales.";
        setError(message);
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [weekStart, search, managerFilter, repFilter, locationFilter]);

  useEffect(() => {
    authedJson<{ reps: RosterOption[] }>("/api/reps?status=active")
      .then((value) => setRosterOptions(value.reps ?? []))
      .catch(() => undefined);
    authedJson<{ locations: LocationOption[] }>("/api/locations")
      .then((value) => setLocations(value.locations ?? []))
      .catch(() => undefined);
    authedJson<{ managers: SalesManagerOption[] }>("/api/managers")
      .then((value) => setManagers(value.managers ?? []))
      .catch(() => undefined);
  }, []);

  const weekDays = useMemo(() => weekDates(data?.week.start ?? weekStart), [data?.week.start, weekStart]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.reps ?? []).filter((row) => {
      const matchesSearch = !term || [row.displayName, row.managerName, row.locationName, row.programName, row.rawSalesId, ...row.orders.map((order) => order.customerName), ...row.orders.map((order) => order.orderNumber)].join(" ").toLowerCase().includes(term);
      return matchesSearch
        && (managerFilter === "all" || row.managerName === managerFilter)
        && (repFilter === "all" || row.displayName === repFilter)
        && (locationFilter === "all" || row.locationName === locationFilter);
    });
  }, [data, locationFilter, managerFilter, repFilter, search]);

  const teamChart = useMemo(() => filteredRows.map((row) => ({ name: row.displayName, sales: row.total })).slice(0, 12), [filteredRows]);

  const totals = useMemo(() => {
    const summary = { total: 0, goal: 0, days: weekDays.map(() => 0) };
    for (const row of filteredRows) {
      summary.total += row.total;
      summary.goal += row.weeklySalesGoal || 0;
      for (const order of row.orders) {
        const index = weekDays.findIndex((day) => day.dateId === order.orderDateId);
        if (index >= 0) summary.days[index] += 1;
      }
    }
    return summary;
  }, [filteredRows, weekDays]);

  const currentLabel = weekRangeLabel(data?.week.start ?? weekStart, data?.week.end ?? toDateId(endOfWeek(new Date(`${weekStart}T12:00:00`))));
  const isTeamView = viewMode === "team";
  const hasNoData = !loading && filteredRows.length === 0;

  function openAction(rep: SalesRepGroup, type: ActionTarget["type"]) {
    setActionTarget({ rep, type });
    setAliasTargetRepUid("");
    setLocationId(rep.locationName || "");
    setLocationMode("forward");
    setLocationWeek(weekISOForWeekStart(weekStart));
    setGoalDraft(String(rep.weeklySalesGoal || 0));
    const matchedManager = managers.find((item) => item.name === rep.managerName);
    const matchedLocation = locations.find((item) => item.name === rep.locationName);
    setNewRepForm({
      ...blankRepEditorForm,
      displayName: rep.displayName || "",
      managerUid: matchedManager?.managerUid ?? "",
      managerName: rep.managerName || "",
      locationId: matchedLocation?.locationId ?? "",
      locationName: rep.locationName || "",
      weeklySalesGoal: String(rep.weeklySalesGoal || 0),
    });
  }

  async function saveGoal() {
    if (!actionTarget?.rep.repUid) return;
    setActionSaving(true);
    try {
      const response = await authedFetch(`/api/reps/${actionTarget.rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "setGoal", weeklySalesGoal: Number(goalDraft || 0) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save goal.");
      toast.success("Weekly goal updated.");
      setActionTarget(null);
      setData((current) => current ? {
        ...current,
        reps: current.reps.map((row) => row.repUid === actionTarget.rep.repUid ? { ...row, weeklySalesGoal: Number(goalDraft || 0) } : row),
      } : current);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save goal.");
    } finally {
      setActionSaving(false);
    }
  }

  async function saveAlias() {
    if (!actionTarget?.rep.repUid || !aliasTargetRepUid) return;
    const rep = rosterOptions.find((item) => item.repUid === aliasTargetRepUid);
    if (!rep) return;
    setActionSaving(true);
    try {
      const response = await authedFetch(`/api/reps/${aliasTargetRepUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "addAlias", alias: actionTarget.rep.displayName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add alias.");
      toast.success(`Alias added to ${rep.displayName}.`);
      setActionTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to add alias.");
    } finally {
      setActionSaving(false);
    }
  }

  async function saveLocation() {
    if (!actionTarget?.rep.repUid || !locationId) return;
    setActionSaving(true);
    try {
      const response = await authedFetch(`/api/reps/${actionTarget.rep.repUid}/location`, {
        method: "POST",
        body: JSON.stringify({
          weekISO: locationWeek,
          locationId,
          locationName: locations.find((item) => item.locationId === locationId)?.name ?? "",
          mode: locationMode,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to assign location.");
      toast.success("Location updated.");
      setActionTarget(null);
      setData((current) => current ? {
        ...current,
        reps: current.reps.map((row) => row.repUid === actionTarget.rep.repUid ? { ...row, locationName: locations.find((item) => item.locationId === locationId)?.name ?? row.locationName } : row),
      } : current);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to assign location.");
    } finally {
      setActionSaving(false);
    }
  }

  async function createRep() {
    if (!actionTarget) return;
    setActionSaving(true);
    try {
      const response = await authedFetch("/api/reps", {
        method: "POST",
        body: JSON.stringify({
          displayName: newRepForm.displayName.trim(),
          email: newRepForm.email.trim(),
          phone: newRepForm.phone.trim(),
          managerUid: newRepForm.managerUid || null,
          managerName: newRepForm.managerName.trim(),
          locationId: newRepForm.locationId.trim(),
          locationName: newRepForm.locationName.trim(),
          programIds: newRepForm.programIds.split(",").map((item) => item.trim()).filter(Boolean),
          vendorType: newRepForm.vendorType,
          weeklySalesGoal: Number(newRepForm.weeklySalesGoal || 0),
          salesIds: newRepForm.salesIds.split(",").map((item) => item.trim()).filter(Boolean),
          aliases: newRepForm.aliases.split(",").map((item) => item.trim()).filter(Boolean),
          socials: {
            instagram: newRepForm.instagram.trim(),
            facebook: newRepForm.facebook.trim(),
            tiktok: newRepForm.tiktok.trim(),
            linkedin: newRepForm.linkedin.trim(),
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create rep.");
      toast.success("Rep added to roster.");
      setActionTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create rep.");
    } finally {
      setActionSaving(false);
    }
  }

  async function updateInlineGoal(rep: SalesRepGroup, nextGoal: string) {
    if (!rep.repUid) return;
    const previousGoal = rep.weeklySalesGoal;
    const goal = Number(nextGoal || 0);
    setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, weeklySalesGoal: goal } : row) } : current);
    try {
      const response = await authedFetch(`/api/reps/${rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "setGoal", weeklySalesGoal: goal }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save goal.");
      toast.success("Weekly goal updated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save goal.");
      setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, weeklySalesGoal: previousGoal } : row) } : current);
    } finally {}
  }

  async function updateInlineLocation(rep: SalesRepGroup, nextLocationId: string) {
    if (!rep.repUid) return;
    const previousLocationName = rep.locationName;
    const nextLocationName = locations.find((item) => item.locationId === nextLocationId)?.name ?? "";
    setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, locationName: nextLocationName } : row) } : current);
    try {
      const response = await authedFetch(`/api/reps/${rep.repUid}/location`, {
        method: "POST",
        body: JSON.stringify({
          weekISO: weekISOForWeekStart(weekStart),
          locationId: nextLocationId,
          locationName: nextLocationName,
          mode: "single",
          persistRepLocation: false,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to assign location.");
      toast.success("Location updated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to assign location.");
      setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, locationName: previousLocationName } : row) } : current);
    } finally {}
  }

  if (loading && !data) return <LoadingState />;
  if (error && !data) {
    return <EmptyState title="Sales unavailable" description={error} />;
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6 overflow-x-hidden">
      <Card className="border-border/70">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Sales command center</CardTitle>
              <CardDescription>Weekly rep grid with inline actions, goals, and team totals.</CardDescription>
              <p className="mt-2 text-sm text-muted-foreground">{currentLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekStart(shiftWeekStart(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4" />
                Prev week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(shiftWeekStart(weekStart, 7))}>
                Next week
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLoading(true)}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.message("Export remains on the existing backend export route.")}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList>
              <TabsTrigger value="rep">Rep grid</TabsTrigger>
              <TabsTrigger value="team">Team chart</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input placeholder="Search rep, manager, location, order, customer" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger><SelectValue placeholder="Manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {Array.from(new Set((data?.reps ?? []).map((row) => row.managerName).filter(Boolean))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger><SelectValue placeholder="Rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {rosterOptions.map((item) => <SelectItem key={item.repUid} value={item.displayName}>{item.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {Array.from(new Set((data?.reps ?? []).map((row) => row.locationName).filter(Boolean))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total sales" value={formatNumber(totals.total)} icon={Users} />
        <Metric label="Weekly goal" value={formatNumber(totals.goal)} icon={CalendarDays} />
        <Metric label="Active reps" value={formatNumber(filteredRows.length)} icon={UserPlus} />
        <Metric label="Week days" value={weekDays.length} icon={BarChart3} />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader className={viewMode === "team" ? "px-4 pb-3 sm:px-6 lg:px-8" : undefined}>
            <CardTitle>{isTeamView ? "Team totals" : "Rep weekly grid"}</CardTitle>
            <CardDescription>{isTeamView ? "Bar chart of total sales by rep." : "Rep names, manager, location, daily sales, and weekly goal."}</CardDescription>
          </CardHeader>
          <CardContent className={viewMode === "team" ? "px-0 sm:px-0" : undefined}>
            {isTeamView ? (
              teamChart.length ? (
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamChart} margin={{ left: 12, right: 24, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" hide />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <RechartsTooltip content={<ChartTooltip />} />
                      <Bar dataKey="sales" radius={[12, 12, 0, 0]} fill="var(--primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No team data" description="Try clearing filters or changing the week." />
              )
            ) : hasNoData ? (
              <EmptyState title="No sales found" description="Try clearing filters or switching week." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Rep</TableHead>
                      <TableHead className="w-[150px]">Manager</TableHead>
                      <TableHead className="w-[140px]">Location</TableHead>
                      {weekDays.map((day, index) => <TableHead key={day.dateId} className={`w-[76px] text-center ${weekColumnClass(index)}`}><span className="block text-xs font-medium">{weekDayName(day.dateId)}</span><span className="block text-[11px] text-muted-foreground">{day.label}</span></TableHead>)}
                      <TableHead className="w-[96px] text-center">Goal</TableHead>
                      <TableHead className="w-[80px] text-center">Total</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((rep) => (
                      <TableRow key={rep.key}>
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="truncate">{rep.displayName}</div>
                            <div className="mt-1 text-xs text-muted-foreground xl:hidden">
                              {rep.managerName || "No manager"} · {rep.locationName || "No location"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="block truncate">{rep.managerName}</span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {rep.repUid ? (
                              <Select value={locations.find((item) => item.name === rep.locationName)?.locationId || ""} onValueChange={(value) => void updateInlineLocation(rep, value)}>
                                <SelectTrigger className="mx-auto h-8 w-full max-w-[140px] overflow-hidden">
                                <SelectValue placeholder="Location" />
                              </SelectTrigger>
                              <SelectContent>
                                {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="block truncate">{rep.locationName || "Unassigned"}</span>
                          )}
                        </TableCell>
                        {weekDays.map((day, index) => {
                          const daily = rep.orders.filter((order) => order.orderDateId === day.dateId).length;
                          return (
                            <TableCell key={day.dateId} className={`text-center ${weekColumnClass(index)}`}>
                              {daily ? <Badge variant="success">{daily}</Badge> : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-medium">
                          {rep.repUid ? (
                            <Input
                              type="number"
                              min={0}
                              className="mx-auto h-8 w-20 px-2 text-center"
                              value={rep.weeklySalesGoal}
                              onChange={(event) => {
                                const nextGoal = Number(event.target.value || 0);
                                setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, weeklySalesGoal: nextGoal } : row) } : current);
                              }}
                              onBlur={(event) => void updateInlineGoal(rep, event.target.value)}
                              aria-label={`Weekly goal for ${rep.displayName}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold">{formatNumber(rep.total)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {rep.repUid ? (
                              <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3" onClick={() => openAction(rep, "alias")}>
                                <Pencil className="h-4 w-4" />
                                Add alias
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3" onClick={() => openAction(rep, "alias")}>
                                  <Plus className="h-4 w-4" />
                                  Add alias
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3" onClick={() => openAction(rep, "roster")}>
                                  <UserPlus className="h-4 w-4" />
                                  Add to roster
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Totals</TableCell>
                      <TableCell className="hidden xl:table-cell" />
                      <TableCell className="hidden xl:table-cell" />
                      {totals.days.map((value, index) => (
                        <TableCell key={index} className={`text-center font-semibold ${weekColumnClass(index)}`}>{formatNumber(value)}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{formatNumber(totals.goal)}</TableCell>
                      <TableCell className="text-center font-semibold">{formatNumber(totals.total)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={Boolean(actionTarget && actionTarget.type !== "roster")} onOpenChange={(open) => !open && setActionTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === "goal" ? "Update goal" : actionTarget?.type === "alias" ? "Add alias" : actionTarget?.type === "location" ? "Change location" : "Add to roster"}
            </DialogTitle>
            <DialogDescription>
              {actionTarget?.rep.displayName ? `Working on ${actionTarget.rep.displayName}.` : "Review and save the change without leaving sales."}
            </DialogDescription>
          </DialogHeader>

          {actionTarget?.type === "goal" && (
            <div className="space-y-2">
              <Label htmlFor="weeklySalesGoal">Weekly goal</Label>
              <Input id="weeklySalesGoal" type="number" min={0} value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} />
            </div>
          )}

          {actionTarget?.type === "alias" && (
            <div className="space-y-2">
              <Label>Target rep</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {aliasTargetRepUid ? rosterOptions.find((item) => item.repUid === aliasTargetRepUid)?.displayName ?? "Choose rep" : "Choose rep"}
                    <Search className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(92vw,420px)] p-0">
                  <Command>
                    <CommandInput placeholder="Search rep" />
                    <CommandList>
                      <CommandEmpty>No reps found.</CommandEmpty>
                      <CommandGroup>
                        {rosterOptions.map((rep) => (
                          <CommandItem key={rep.repUid} value={rep.displayName} onSelect={() => setAliasTargetRepUid(rep.repUid)}>
                            <div className="flex flex-col">
                              <span>{rep.displayName}</span>
                              <span className="text-xs text-muted-foreground">{rep.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">The imported sales name will be added as an alias to the selected rep.</p>
            </div>
          )}

          {actionTarget?.type === "location" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="locationId">Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger id="locationId"><SelectValue placeholder="Choose location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="locationWeek">Week</Label>
                  <Input id="locationWeek" value={locationWeek} onChange={(event) => setLocationWeek(event.target.value)} placeholder="YYYY-W##" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationMode">Mode</Label>
                  <Select value={locationMode} onValueChange={(value) => setLocationMode(value as "forward" | "single")}>
                    <SelectTrigger id="locationMode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward from week</SelectItem>
                      <SelectItem value="single">Single week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">This updates the rep&apos;s location through the existing location assignment API.</p>
            </div>
          )}

          {actionTarget?.type === "roster" && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="newRepName">Rep name</Label>
                  <Input id="newRepName" value={newRepName} onChange={(event) => setNewRepName(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="newRepLocation">Location</Label>
                  <Select value={newRepLocationId} onValueChange={setNewRepLocationId}>
                    <SelectTrigger id="newRepLocation"><SelectValue placeholder="Choose location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="newRepGoal">Weekly goal</Label>
                  <Input id="newRepGoal" type="number" min={0} value={newRepGoal} onChange={(event) => setNewRepGoal(event.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">This creates a new roster record through the existing reps API and keeps you on the sales page.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionTarget) return;
                if (actionTarget.type === "goal") void saveGoal();
                if (actionTarget.type === "alias") void saveAlias();
                if (actionTarget.type === "location") void saveLocation();
                if (actionTarget.type === "roster") void createRep();
              }}
              disabled={actionSaving || (actionTarget?.type === "alias" && !aliasTargetRepUid) || (actionTarget?.type === "location" && !locationId)}
            >
              {actionSaving ? "Saving..." : "Save change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RepEditorDialog
        open={actionTarget?.type === "roster"}
        title="Add representative"
        description="Create the new roster record without leaving sales."
        saveLabel="Create representative"
        saving={actionSaving}
        form={newRepForm}
        setForm={setNewRepForm}
        managers={managers}
        locations={locations}
        onOpenChange={(open) => !open && setActionTarget(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void createRep();
        }}
      />
    </motion.div>
  );
}

function weekISOForWeekStart(value: string) {
  return isoWeek(new Date(`${value}T12:00:00`));
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { name?: string; sales?: number } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-foreground">{row.name || "Rep"}</p>
      <p className="text-sm text-primary">sales: {formatNumber(row.sales || 0)}</p>
    </div>
  );
}
