"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Download, Pencil, RefreshCcw, Search, UserPlus, Users } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { formatNumber } from "@/src/lib/formatters/number";
import { endOfWeek, isoWeek, startOfWeek, toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { useAuth } from "@/src/components/auth-provider";
import { extractSalesOrder, type RawSalesOrder, type SalesDataset, type SalesRepGroup } from "@/src/lib/sales/grouping";
import { RepEditorDialog, blankRepEditorForm, type RepEditorForm } from "@/src/components/roster/rep-editor-dialog";
import type { ManagerOption } from "@/src/types/manager";
import type { Rep } from "@/src/types/rep";
import { cn } from "@/lib/utils";

type SalesResponse = {
  week: { start: string; end: string };
  reps: Array<SalesRepGroup & { orders?: RawSalesOrder[] }>;
};

type RosterOption = Rep;
type LocationOption = { locationId: string; name: string };
type SalesManagerOption = ManagerOption;
type ViewMode = "rep" | "team";

type ActionTarget = {
  rep: SalesRepGroup;
  type: "goal" | "alias" | "location" | "roster";
};

type SalesGridRow = SalesRepGroup & {
  email?: string;
  source: "roster" | "sales" | "unmatched";
};

function LoadingState() {
  return (
    <div className="space-y-6 overflow-x-hidden">
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="space-y-4 p-5 sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-4 w-[min(100%,22rem)]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-11 rounded-full" />)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0 lg:p-7 lg:pt-0">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-[24px]" />)}
          </div>
          <Skeleton className="h-[360px] rounded-[28px]" />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-border/70 bg-gradient-to-b from-muted/30 to-background p-8 text-center shadow-sm">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/85 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="relative flex items-start justify-between gap-4 p-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/40 p-3 text-primary shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function weekDayName(dateId: string) {
  return new Date(`${dateId}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

function shortDateLabel(dateId: string) {
  return new Date(`${dateId}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

type TableSegment = {
  key: string;
  start: string;
  end: string;
  label: string;
  sublabel: string;
  dateIds: string[];
};

function dateRangeDays(start: string, end: string) {
  const days: Array<{ dateId: string; day: string; label: string }> = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    days.push({
      dateId: toDateId(cursor),
      day: cursor.toLocaleDateString(undefined, { weekday: "short" }),
      label: cursor.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildRangeSegments(mode: "wtd" | "mtd", start: string, end: string) {
  const days = dateRangeDays(start, end);
  if (mode === "wtd") {
    return days.map((day) => ({
      key: day.dateId,
      start: day.dateId,
      end: day.dateId,
      label: weekDayName(day.dateId),
      sublabel: day.label,
      dateIds: [day.dateId],
    })) satisfies TableSegment[];
  }

  const segments: TableSegment[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const chunk = days.slice(index, index + 7);
    if (!chunk.length) continue;
    segments.push({
      key: chunk[0].dateId,
      start: chunk[0].dateId,
      end: chunk[chunk.length - 1].dateId,
      label: `Week ${segments.length + 1}`,
      sublabel: `${shortDateLabel(chunk[0].dateId)} - ${shortDateLabel(chunk[chunk.length - 1].dateId)}`,
      dateIds: chunk.map((day) => day.dateId),
    });
  }
  return segments;
}

function formatRangeLabel(mode: "wtd" | "mtd", start: string, end: string) {
  if (mode === "mtd") {
    return `${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })} MTD`;
  }
  return weekRangeLabel(start, end);
}

function weekOptions(anchorWeekStart: string, count = 10) {
  return Array.from({ length: count }, (_, index) => {
    const value = shiftWeekStart(anchorWeekStart, -7 * index);
    const end = shiftWeekStart(value, 6);
    return { value, label: weekRangeLabel(value, end) };
  });
}

function weekColumnClass(index: number) {
  return index % 2 === 0 ? "bg-muted/20" : "bg-background";
}

function shiftWeekStart(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateId(date);
}

function weekToDateEnd(weekStart: string) {
  const selectedStart = new Date(`${weekStart}T12:00:00`);
  const selectedWeekStart = startOfWeek(selectedStart);
  const currentWeekStart = startOfWeek(new Date());
  if (toDateId(selectedWeekStart) !== toDateId(currentWeekStart)) {
    return toDateId(endOfWeek(selectedWeekStart));
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toDateId(yesterday < selectedWeekStart ? selectedWeekStart : yesterday);
}

type WorkspaceKind = "sales" | "knocks";
type GoalField = "weeklySalesGoal" | "weeklyKnocksGoal";

export function SalesPage({ kind = "sales" }: { kind?: WorkspaceKind }) {
  useAuth();
  const reducedMotion = useReducedMotion();
  const isKnocks = kind === "knocks";
  const workspaceName = isKnocks ? "Knocks" : "Sales";
  const workspaceNameLower = isKnocks ? "knocks" : "sales";
  const goalField: GoalField = isKnocks ? "weeklyKnocksGoal" : "weeklySalesGoal";
  const goalLabel = isKnocks ? "Knocks goal" : "Weekly goal";
  const goalColumnLabel = isKnocks ? "Knocks goal" : "Goal";
  const [weekStart, setWeekStart] = useQueryState("weekStart", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [managerFilter, setManagerFilter] = useQueryState("manager", parseAsString.withDefault("all"));
  const [repFilter, setRepFilter] = useQueryState("rep", parseAsString.withDefault("all"));
  const [locationFilter, setLocationFilter] = useQueryState("location", parseAsString.withDefault("all"));
  const [viewMode, setViewMode] = useQueryState("view", parseAsString.withDefault("rep"));
  const [rangeMode, setRangeMode] = useQueryState("range", parseAsString.withDefault("wtd"));
  const [showZeroSales, setShowZeroSales] = useQueryState("showZeroSales", parseAsString.withDefault("1"));
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
  const [locationId, setLocationId] = useState("");
  const [locationMode, setLocationMode] = useState<"forward" | "single">("forward");
  const [locationWeek, setLocationWeek] = useState("");
  const [managerDraft, setManagerDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [managerCreating, setManagerCreating] = useState(false);
  const [locationCreating, setLocationCreating] = useState(false);

  const loadSales = useCallback(async (options?: { silent?: boolean }) => {
    const params = new URLSearchParams({
      weekStart,
      range: rangeMode,
      includeOrders: "true",
      search: search.trim(),
      manager: managerFilter,
      location: locationFilter,
      rep: repFilter,
    });
    try {
      if (!options?.silent) setLoading(true);
      const response = await authedJson<SalesResponse>(`/api/${kind}?${params.toString()}`);
      setError(null);
      setData({
        week: response.week,
        reps: response.reps.map((rep) => ({
          ...rep,
          orders: (rep.orders ?? []).map(extractSalesOrder),
        })),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Unable to load ${workspaceNameLower}.`;
      setError(message);
      toast.error(message);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [kind, locationFilter, managerFilter, rangeMode, repFilter, search, weekStart, workspaceNameLower]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void loadSales({ silent: false });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadSales]);

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

  const rangeStart = rangeMode === "mtd"
    ? toDateId(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    : weekStart;
  const rangeEnd = rangeMode === "mtd"
    ? toDateId(new Date())
    : weekToDateEnd(weekStart);
  const displayRangeEnd = rangeMode === "mtd"
    ? rangeEnd
    : toDateId(endOfWeek(new Date(`${weekStart}T12:00:00`)));

  const reportSegments = useMemo(() => buildRangeSegments(rangeMode === "mtd" ? "mtd" : "wtd", data?.week.start ?? rangeStart, rangeMode === "mtd" ? data?.week.end ?? rangeEnd : displayRangeEnd), [data?.week.end, data?.week.start, displayRangeEnd, rangeEnd, rangeMode, rangeStart]);
  const segmentIndexByDateId = useMemo(() => {
    const indexByDateId = new Map<string, number>();
    reportSegments.forEach((segment, index) => {
      segment.dateIds.forEach((dateId) => indexByDateId.set(dateId, index));
    });
    return indexByDateId;
  }, [reportSegments]);

  const rows = useMemo<SalesGridRow[]>(() => {
    const salesRows = data?.reps ?? [];
    const salesByRepUid = new Map(salesRows.filter((row) => row.repUid).map((row) => [row.repUid as string, row]));
    const rosterRows = rosterOptions.map((rep) => {
      const salesRow = salesByRepUid.get(rep.repUid);
      if (salesRow) {
        return {
          ...salesRow,
          email: rep.email,
          source: "sales" as const,
          managerName: rep.managerName || salesRow.managerName,
          locationName: rep.locationName || salesRow.locationName,
          weeklySalesGoal: rep.weeklySalesGoal ?? salesRow.weeklySalesGoal,
          weeklyKnocksGoal: rep.weeklyKnocksGoal ?? salesRow.weeklyKnocksGoal,
        };
      }
      return {
        key: `rep:${rep.repUid}`,
        repUid: rep.repUid,
        rawSalesId: "",
        displayName: rep.displayName,
        managerName: rep.managerName || "",
        locationName: rep.locationName || "",
        programName: "",
        vendorType: rep.vendorType ?? "unassigned",
        weeklySalesGoal: rep.weeklySalesGoal || 0,
        weeklyKnocksGoal: rep.weeklyKnocksGoal || 0,
        matchStatus: "matched" as const,
        total: 0,
        installed: 0,
        pending: 0,
        pastDue: 0,
        preorder: 0,
        canceled: 0,
        churned: 0,
        unknown: 0,
        orders: [],
        days: reportSegments.map(() => 0),
        week: data?.week ?? { start: weekStart, end: weekStart },
        email: rep.email,
        source: "roster" as const,
      };
    });
    const unmatchedRows = salesRows.filter((row) => !row.repUid).map((row) => ({ ...row, source: "unmatched" as const }));
    return [...rosterRows, ...unmatchedRows].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data?.reps, data?.week, reportSegments, rosterOptions, weekStart]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const includeZeroSales = showZeroSales !== "0";
    return rows.filter((row) => {
      const matchesSearch = !term || [row.displayName, row.managerName, row.locationName, row.programName, row.rawSalesId, row.email, ...row.orders.map((order) => order.customerName), ...row.orders.map((order) => order.orderNumber)].join(" ").toLowerCase().includes(term);
      return matchesSearch
        && (managerFilter === "all" || row.managerName === managerFilter)
        && (repFilter === "all" || row.displayName === repFilter)
        && (locationFilter === "all" || row.locationName === locationFilter)
        && (includeZeroSales || row.total > 0);
    });
  }, [locationFilter, managerFilter, repFilter, rows, search, showZeroSales]);

  const teamChart = useMemo(() => visibleRows.map((row) => ({ name: row.displayName, sales: row.total })).slice(0, 12), [visibleRows]);

    const rowSegments = useMemo(() => visibleRows.map((row) => {
    const counts = reportSegments.map(() => 0);
    for (const order of row.orders) {
      const index = segmentIndexByDateId.get(order.orderDateId);
      if (index !== undefined) counts[index] += Number(order.saleCount || 1);
    }
    return { row, counts };
  }), [segmentIndexByDateId, reportSegments, visibleRows]);

  const totals = useMemo(() => {
    const summary = { total: 0, goal: 0, segments: reportSegments.map(() => 0) };
    for (const row of visibleRows) {
      summary.total += row.total;
      summary.goal += Number(row[goalField] || 0);
      for (const order of row.orders) {
        const index = segmentIndexByDateId.get(order.orderDateId);
        if (index !== undefined) summary.segments[index] += Number(order.saleCount || 1);
      }
    }
    return summary;
  }, [goalField, reportSegments, segmentIndexByDateId, visibleRows]);

  const currentLabel = formatRangeLabel(rangeMode === "mtd" ? "mtd" : "wtd", data?.week.start ?? rangeStart, rangeMode === "mtd" ? data?.week.end ?? rangeEnd : displayRangeEnd);
  const isTeamView = viewMode === "team";
  const hasNoData = !loading && visibleRows.length === 0;

  function openAction(rep: SalesRepGroup, type: ActionTarget["type"]) {
    setActionTarget({ rep, type });
    setAliasTargetRepUid("");
    setLocationId(rep.locationName || "");
    setLocationMode("forward");
    setLocationWeek(weekISOForWeekStart(weekStart));
    setGoalDraft(String(Number(rep[goalField] || 0)));
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
      weeklyKnocksGoal: String(Number(rep.weeklyKnocksGoal || 0)),
    });
  }

  async function saveGoal() {
    if (!actionTarget?.rep.repUid) return;
    setActionSaving(true);
    try {
      const response = await authedFetch(`/api/reps/${actionTarget.rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "setGoal", goalType: isKnocks ? "knocks" : "sales", [goalField]: Number(goalDraft || 0) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save goal.");
      toast.success("Weekly goal updated.");
      setActionTarget(null);
      setData((current) => current ? {
        ...current,
        reps: current.reps.map((row) => row.repUid === actionTarget.rep.repUid ? { ...row, [goalField]: Number(goalDraft || 0) } : row),
      } : current);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save goal.");
    } finally {
      setActionSaving(false);
    }
  }

  async function saveAlias() {
    if (!actionTarget || !aliasTargetRepUid) return;
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
      setAliasTargetRepUid("");
      await loadSales({ silent: true });
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
      const nextLocationName = locations.find((item) => item.locationId === locationId)?.name ?? "";
      const response = await authedFetch(`/api/reps/${actionTarget.rep.repUid}/location`, {
        method: "POST",
        body: JSON.stringify({
          weekISO: locationWeek,
          locationId,
          locationName: nextLocationName,
          mode: locationMode,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to assign location.");
      toast.success("Location updated.");
      setActionTarget(null);
      setRosterOptions((current) => current.map((item) => item.repUid === actionTarget.rep.repUid ? { ...item, locationName: nextLocationName } : item));
      setData((current) => current ? {
        ...current,
        reps: current.reps.map((row) => row.repUid === actionTarget.rep.repUid ? { ...row, locationName: nextLocationName } : row),
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
          programIds: newRepForm.programIds,
          vendorType: newRepForm.vendorType,
          weeklySalesGoal: Number(newRepForm.weeklySalesGoal || 0),
          weeklyKnocksGoal: Number(newRepForm.weeklyKnocksGoal || 0),
          salesIds: newRepForm.salesIds.split(",").map((item) => item.trim()).filter(Boolean),
          aliases: newRepForm.aliases.split(",").map((item) => item.trim()).filter(Boolean),
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

  async function createManager() {
    const name = managerDraft.trim();
    if (!name) return;
    setManagerCreating(true);
    try {
      const response = await authedFetch("/api/managers", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create manager.");
      const created = result.manager as SalesManagerOption;
      setManagers((current) => [...current.filter((item) => item.managerUid !== created.managerUid), created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRepForm((current) => ({ ...current, managerUid: created.managerUid, managerName: created.name }));
      setManagerDraft("");
      toast.success(`Manager ${created.name} added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create manager.");
    } finally {
      setManagerCreating(false);
    }
  }

  async function createLocation() {
    const name = locationDraft.trim();
    if (!name) return;
    setLocationCreating(true);
    try {
      const response = await authedFetch("/api/locations", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create location.");
      const created = result.location as LocationOption;
      setLocations((current) => [...current.filter((item) => item.locationId !== created.locationId), created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRepForm((current) => ({ ...current, locationId: created.locationId, locationName: created.name }));
      setLocationDraft("");
      toast.success(`Location ${created.name} added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create location.");
    } finally {
      setLocationCreating(false);
    }
  }

  async function updateInlineGoal(rep: SalesRepGroup, nextGoal: string) {
    if (!rep.repUid) return;
    const previousGoal = Number(rep[goalField] || 0);
    const goal = Number(nextGoal || 0);
    setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, [goalField]: goal } : row) } : current);
    try {
      const response = await authedFetch(`/api/reps/${rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "setGoal", goalType: isKnocks ? "knocks" : "sales", [goalField]: goal }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save goal.");
      toast.success("Weekly goal updated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save goal.");
      setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, [goalField]: previousGoal } : row) } : current);
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
      setRosterOptions((current) => current.map((item) => item.repUid === rep.repUid ? { ...item, locationName: nextLocationName } : item));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to assign location.");
      setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, locationName: previousLocationName } : row) } : current);
    } finally {}
  }

  if (loading && !data) return <LoadingState />;
  if (error && !data) {
    return <EmptyState title={`${workspaceName} unavailable`} description={error} />;
  }

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="-mx-4 space-y-6 overflow-x-hidden px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <Card className="overflow-hidden border-border/60 bg-card/85 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
        <CardHeader className="gap-5 p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Weekly {workspaceNameLower}
                </Badge>
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">AB Marketing</span>
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl tracking-tight sm:text-4xl">{workspaceName} command center</CardTitle>
                <CardDescription className="max-w-2xl text-sm sm:text-base">
                  {isKnocks
                    ? "Weekly and month-to-date rep knocks with inline actions, goal editing, and team totals."
                    : "Weekly and month-to-date rep sales with inline actions, goal editing, and team totals."}
                </CardDescription>
              </div>
              <p className="text-sm text-muted-foreground">{currentLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon-sm" className="rounded-full" onClick={() => setWeekStart(shiftWeekStart(weekStart, -7))} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={weekStart} onValueChange={setWeekStart}>
                <SelectTrigger className="h-10 w-[min(100%,240px)] gap-2 rounded-full border-border/60 bg-background/80 px-4 shadow-sm sm:w-[240px] md:w-[260px]">
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Select week" className="min-w-0 flex-1 truncate text-center text-sm" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions(weekStart).map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon-sm" className="rounded-full" onClick={() => setWeekStart(shiftWeekStart(weekStart, 7))} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="flex items-center rounded-full border border-border/60 bg-background/80 p-1 shadow-sm">
                <Button size="sm" variant={rangeMode === "wtd" ? "default" : "ghost"} className="h-8 rounded-full px-3" onClick={() => setRangeMode("wtd")}>WTD</Button>
                <Button size="sm" variant={rangeMode === "mtd" ? "default" : "ghost"} className="h-8 rounded-full px-3" onClick={() => setRangeMode("mtd")}>MTD</Button>
              </div>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void loadSales()}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => toast.message("Export remains on the existing backend export route.")}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
            </div>
          </div>

          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList className="inline-flex rounded-full bg-muted/60 p-1">
              <TabsTrigger value="rep">Rep grid</TabsTrigger>
              <TabsTrigger value="team">Team chart</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 rounded-[24px] border border-border/60 bg-muted/20 p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-full border-border/60 bg-background/80 pl-9 shadow-sm"
                placeholder={isKnocks ? "Search rep, manager, location" : "Search rep, manager, location, order, customer"}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {Array.from(new Set(rows.map((row) => row.managerName).filter((value) => value && value !== "—"))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {rosterOptions.map((item) => <SelectItem key={item.repUid} value={item.displayName}>{item.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {Array.from(new Set(rows.map((row) => row.locationName).filter((value) => value && value !== "—"))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex h-11 items-center justify-between gap-3 rounded-full border border-border/60 bg-background/80 px-4 shadow-sm">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">Show zero {workspaceNameLower}</p>
                <p className="mt-1 text-xs text-muted-foreground">Include reps with no orders</p>
              </div>
              <Switch checked={showZeroSales !== "0"} onCheckedChange={(checked) => void setShowZeroSales(checked ? "1" : "0")} aria-label={`Show reps with zero ${workspaceNameLower}`} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={isKnocks ? "Total knocks" : "Total sales"} value={formatNumber(totals.total)} icon={Users} />
        <Metric label={goalLabel} value={formatNumber(totals.goal)} icon={CalendarDays} />
        <Metric label="Visible reps" value={formatNumber(visibleRows.length)} icon={UserPlus} />
        <Metric label={rangeMode === "mtd" ? "Weeks in range" : "Days in range"} value={reportSegments.length} icon={BarChart3} />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/60 bg-card/85 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.28)]">
          <CardHeader className={cn("gap-2 p-5 sm:p-6 lg:p-7", viewMode === "team" ? "pb-3" : undefined)}>
            <CardTitle>{isTeamView ? "Team totals" : `Rep weekly grid`}</CardTitle>
            <CardDescription>
              {isTeamView
                ? `Bar chart of total ${workspaceNameLower} by rep.`
                : rangeMode === "mtd"
                  ? `Rep names, manager, location, weekly ${workspaceNameLower}, and weekly goal.`
                  : `Rep names, manager, location, daily ${workspaceNameLower}, and weekly goal.`}
            </CardDescription>
          </CardHeader>
          <CardContent className={cn("p-5 pt-0 sm:p-6 sm:pt-0 lg:p-7 lg:pt-0", viewMode === "team" ? "px-0" : undefined)}>
            {isTeamView ? (
              teamChart.length ? (
                <div className="h-[420px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamChart} margin={{ left: 0, right: 12, top: 8, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.7} vertical={false} />
                      <XAxis dataKey="name" hide />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={36} tick={{ fill: "var(--muted-foreground)" }} />
                      <RechartsTooltip content={<ChartTooltip metricLabel={isKnocks ? "Knocks" : "Sales"} />} />
                      <Bar dataKey="sales" radius={[14, 14, 0, 0]} fill="var(--info)" stroke="var(--info)" maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No team data" description="Try clearing filters or changing the week." />
              )
            ) : hasNoData ? (
              <EmptyState title={`No ${workspaceNameLower} found`} description="Try clearing filters or switching week." />
            ) : (
              <div className="overflow-x-auto overflow-y-hidden rounded-[28px] border border-border/60 bg-background/80 shadow-sm">
                <Table className="min-w-max table-fixed">
                  <TableHeader>
                    <TableRow className="border-border/60 bg-muted/20 hover:bg-muted/20">
                      <TableHead className="w-[180px]">Rep</TableHead>
                      <TableHead className="w-[160px]">Manager</TableHead>
                      <TableHead className="w-[160px]">Location</TableHead>
                      {reportSegments.map((segment, index) => (
                        <TableHead key={segment.key} className={`w-[92px] text-center ${weekColumnClass(index)}`}>
                          <span className="block text-xs font-medium">{segment.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{segment.sublabel}</span>
                        </TableHead>
                      ))}
                      <TableHead className="w-[100px] text-center">{goalColumnLabel}</TableHead>
                      <TableHead className="w-[84px] text-center">Total</TableHead>
                      <TableHead className="w-[144px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowSegments.map(({ row: rep, counts }) => (
                      <TableRow key={rep.key} className="h-16 border-border/60 transition-colors hover:bg-muted/20">
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="truncate">{rep.displayName}</div>
                            <div className="mt-1 text-xs text-muted-foreground xl:hidden">
                              {rep.managerName || "No manager"} / {rep.locationName || "No location"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="block truncate">{rep.managerName}</span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {rep.repUid ? (
                            <Select value={locations.find((item) => item.name === rep.locationName)?.locationId || ""} onValueChange={(value) => void updateInlineLocation(rep, value)}>
                              <SelectTrigger className="mx-auto h-9 w-full max-w-[170px] rounded-full border-border/60 bg-background/80 px-3 shadow-sm">
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
                        {counts.map((value, index) => {
                          const daily = value;
                          return (
                            <TableCell key={reportSegments[index]?.key ?? index} className={cn("text-center transition-colors", weekColumnClass(index))}>
                              {daily ? <Badge variant="success">{daily}</Badge> : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-medium">
                          {rep.repUid ? (
                            <Input
                              type="number"
                              min={0}
                              className="mx-auto h-9 w-24 rounded-full border-border/60 bg-background/80 px-2 text-center shadow-sm"
                              value={Number(rep[goalField] || 0)}
                              onChange={(event) => {
                                const nextGoal = Number(event.target.value || 0);
                                setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === rep.repUid ? { ...row, [goalField]: nextGoal } : row) } : current);
                              }}
                              onBlur={(event) => void updateInlineGoal(rep, event.target.value)}
                              aria-label={`Weekly goal for ${rep.displayName}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold">{formatNumber(rep.total)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {!rep.repUid && (
                              <>
                                <Button size="sm" variant="outline" className="h-9 rounded-full gap-1.5 px-3 shadow-sm" onClick={() => openAction(rep, "alias")}>
                                  <Pencil className="h-4 w-4" />
                                  Add alias
                                </Button>
                                <Button size="sm" variant="outline" className="h-9 rounded-full gap-1.5 px-3 shadow-sm" onClick={() => openAction(rep, "roster")}>
                                  <UserPlus className="h-4 w-4" />
                                  Add to roster
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border/60 bg-muted/20">
                      <TableCell className="font-semibold">Totals</TableCell>
                      <TableCell className="hidden xl:table-cell" />
                      <TableCell className="hidden xl:table-cell" />
                      {totals.segments.map((value, index) => (
                        <TableCell key={index} className={cn("text-center font-semibold", weekColumnClass(index))}>{formatNumber(value)}</TableCell>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card/95 shadow-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === "goal" ? `Update ${goalLabel.toLowerCase()}` : actionTarget?.type === "alias" ? "Add alias" : actionTarget?.type === "location" ? "Change location" : "Add to roster"}
            </DialogTitle>
            <DialogDescription>
              {actionTarget?.rep.displayName ? `Working on ${actionTarget.rep.displayName}.` : `Review and save the change without leaving ${workspaceNameLower}.`}
            </DialogDescription>
          </DialogHeader>

          {actionTarget?.type === "goal" && (
            <div className="space-y-2">
              <Label htmlFor={goalField}>{goalLabel}</Label>
              <Input id={goalField} type="number" min={0} className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm" value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} />
            </div>
          )}

          {actionTarget?.type === "alias" && (
            <div className="space-y-2">
              <Label>Target rep</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full justify-between rounded-full border-border/60 bg-background/80 shadow-sm">
                    {aliasTargetRepUid ? rosterOptions.find((item) => item.repUid === aliasTargetRepUid)?.displayName ?? "Choose rep" : "Choose rep"}
                    <Search className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(92vw,420px)] rounded-2xl border-border/70 p-0 shadow-xl">
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
              <p className="text-xs text-muted-foreground">The imported name will be added as an alias to the selected rep.</p>
            </div>
          )}

          {actionTarget?.type === "location" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="locationId">Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger id="locationId" className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Choose location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="locationWeek">Week</Label>
                  <Input id="locationWeek" className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm" value={locationWeek} onChange={(event) => setLocationWeek(event.target.value)} placeholder="YYYY-W##" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationMode">Mode</Label>
                  <Select value={locationMode} onValueChange={(value) => setLocationMode(value as "forward" | "single")}>
                    <SelectTrigger id="locationMode" className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue /></SelectTrigger>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionTarget) return;
                if (actionTarget.type === "goal") void saveGoal();
                if (actionTarget.type === "alias") void saveAlias();
                if (actionTarget.type === "location") void saveLocation();
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
        description={`Create the new roster record without leaving ${workspaceNameLower}.`}
        saveLabel="Create representative"
        saving={actionSaving}
        form={newRepForm}
        setForm={setNewRepForm}
        managers={managers}
        locations={locations}
        managerDraft={managerDraft}
        locationDraft={locationDraft}
        onCreateManager={() => void createManager()}
        onCreateLocation={() => void createLocation()}
        managerCreating={managerCreating}
        locationCreating={locationCreating}
        canCreateManager={Boolean(managerDraft.trim())}
        canCreateLocation={Boolean(locationDraft.trim())}
        onManagerDraftChange={setManagerDraft}
        onLocationDraftChange={setLocationDraft}
        onOpenChange={(open) => {
          if (open) return;
          setActionTarget(null);
          setManagerDraft("");
          setLocationDraft("");
        }}
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

function ChartTooltip({ active, payload, metricLabel = "Sales" }: { active?: boolean; payload?: Array<{ payload?: { name?: string; sales?: number } }>; metricLabel?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-2xl border border-border/70 bg-popover/95 px-4 py-3 text-popover-foreground shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Representative</p>
      <p className="mt-1 text-sm font-medium text-foreground">{row.name || "Rep"}</p>
      <p className="mt-2 text-sm font-semibold text-primary">{metricLabel}: {formatNumber(row.sales || 0)}</p>
    </div>
  );
}
