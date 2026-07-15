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
import { formatHoursAsDuration } from "@/src/lib/formatters/duration";
import { endOfWeek, parseDateId, startOfWeek, toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { useAuth } from "@/src/components/auth-provider";
import { extractSalesOrder, type RawSalesOrder, type SalesDataset, type SalesRepGroup } from "@/src/lib/sales/grouping";
import { RepEditorDialog, blankRepEditorForm, type RepEditorForm } from "@/src/components/roster/rep-editor-dialog";
import { AssignLocationDialog } from "@/src/components/roster/assign-location-dialog";
import type { ManagerOption } from "@/src/types/manager";
import type { Rep } from "@/src/types/rep";
import type { Team } from "@/src/types/team";
import { normalizePermissions } from "@/src/lib/access";
import { cn } from "@/lib/utils";

type SalesResponse = {
  week: { start: string; end: string };
  reps: Array<SalesRepGroup & { orders?: RawSalesOrder[] }>;
  canViewKnockHours?: boolean;
};

type KnockHoursPeriod = "daily" | "weekly" | "monthly" | "custom";
type KnockHoursRow = {
  repUid: string;
  displayName: string;
  managerName: string;
  teamId: string | null;
  locationName: string;
  vendorType: string;
  knocks: number;
  sales: number;
  hoursWorked: number;
  daysWorked: number;
  firstKnockAt: string;
  lastKnockAt: string;
};
type KnockHoursResponse = { period: KnockHoursPeriod; range: { start: string; end: string }; rows: KnockHoursRow[] };

function previousDateId(dateId: string) {
  const date = parseDateId(dateId);
  date.setDate(date.getDate() - 1);
  return toDateId(date);
}

function yesterdayDateId() {
  return previousDateId(toDateId(new Date()));
}

type RosterOption = Rep;
type LocationOption = { locationId: string; name: string };
type SalesManagerOption = ManagerOption;
type ViewMode = "rep" | "team";

type ActionTarget = {
  rep: SalesRepGroup;
  type: "goal" | "alias" | "roster" | "restore";
};

type LocationCreateTarget = { kind: "newRep" };

type SalesGridRow = SalesRepGroup & {
  createdAt?: unknown;
  email?: string;
  firstSaleDateId?: string;
  programIds?: string[];
  inActiveRoster: boolean;
  source: "roster" | "sales" | "unmatched";
};

function normalizeProviderFilter(value: string) {
  const source = value.trim().toLowerCase();
  if (source === "att" || source === "at&t") return "att";
  if (source === "tfiber" || source === "t-fiber" || source === "tmobile fiber" || source === "t-mobile fiber") return "tfiber";
  return source;
}

function toValidDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value === "string") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.valueOf()) ? date : null;
    }
    const seconds = typeof candidate.seconds === "number" ? candidate.seconds : candidate._seconds;
    const nanoseconds = typeof candidate.nanoseconds === "number" ? candidate.nanoseconds : candidate._nanoseconds;
    if (typeof seconds === "number") {
      const millis = seconds * 1000 + Math.floor((nanoseconds ?? 0) / 1_000_000);
      const date = new Date(millis);
      return Number.isNaN(date.valueOf()) ? null : date;
    }
  }
  return null;
}

function getNewRepHighlightWindow(startDateId: string | null | undefined, days = 14) {
  if (!startDateId) return null;
  const startDate = toValidDate(startDateId);
  if (!startDate) return null;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const windowEnd = new Date(start);
  windowEnd.setDate(windowEnd.getDate() + days);
  return {
    start,
    end: windowEnd,
    startDateId: toDateId(start),
    endDateId: toDateId(windowEnd),
  };
}

function getFirstSaleDateId(row: Pick<SalesGridRow, "vendorType" | "orders" | "firstSaleDateId">) {
  if (row.vendorType !== "organic") return null;
  if (row.firstSaleDateId) return row.firstSaleDateId;
  const dateIds = row.orders.map((order) => order.orderDateId).filter((value): value is string => Boolean(value));
  if (!dateIds.length) return null;
  return [...dateIds].sort((a, b) => a.localeCompare(b))[0];
}

function isWithinNewRepHighlightWindow(row: Pick<SalesGridRow, "vendorType" | "orders" | "firstSaleDateId">, days = 14) {
  const window = getNewRepHighlightWindow(getFirstSaleDateId(row), days);
  if (!window) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today >= window.start && today <= window.end;
}

function formatApiError(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error !== "object") return fallback;
  const candidate = error as { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
  const fieldMessages = Object.entries(candidate.fieldErrors ?? {})
    .flatMap(([field, messages]) => (messages ?? []).filter(Boolean).map((message) => `${field}: ${message}`));
  const formMessages = (candidate.formErrors ?? []).filter(Boolean);
  return [...formMessages, ...fieldMessages][0] ?? fallback;
}

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

function formatRangeLabel(mode: "wtd" | "mtd", start: string, end: string, monthId: string) {
  if (mode === "mtd") {
    return `${monthLabel(monthId)} MTD`;
  }
  return weekRangeLabel(start, end);
}

function toMonthId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function firstOfMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function lastOfMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month, 0);
}

function shiftMonthId(monthId: string, delta: number) {
  const [year, month] = monthId.split("-").map(Number);
  return toMonthId(new Date(year, month - 1 + delta, 1));
}

function monthLabel(monthId: string) {
  return firstOfMonth(monthId).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthOptions(anchorMonthId: string, pastCount = 24, futureCount = 6) {
  return Array.from({ length: pastCount + futureCount + 1 }, (_, index) => {
    const offset = futureCount - index;
    const value = shiftMonthId(anchorMonthId, offset);
    return { value, label: monthLabel(value) };
  });
}

function weekOptions(anchorWeekStart: string, pastCount = 104, futureCount = 12) {
  return Array.from({ length: pastCount + futureCount + 1 }, (_, index) => {
    const weekOffset = futureCount - index;
    const value = shiftWeekStart(anchorWeekStart, 7 * weekOffset);
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
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();
  const isKnocks = kind === "knocks";
  const canAddAlias = profile?.role === "superAdmin";
  const profilePermissions = normalizePermissions(profile?.permissions);
  const canUseOnlyZeroSalesFilter = !isKnocks && (profile?.role === "superAdmin" || profilePermissions.canFilterZeroSalesOnly);
  const workspaceName = isKnocks ? "Knocks" : "Sales";
  const workspaceNameLower = isKnocks ? "knocks" : "sales";
  const goalField: GoalField = isKnocks ? "weeklyKnocksGoal" : "weeklySalesGoal";
  const goalLabel = isKnocks ? "Knocks goal" : "Weekly goal";
  const goalColumnLabel = isKnocks ? "Knocks goal" : "Goal";
  const [weekStart, setWeekStart] = useQueryState("weekStart", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [managerFilter, setManagerFilter] = useQueryState("manager", parseAsString.withDefault("all"));
  const [teamFilter, setTeamFilter] = useQueryState("team", parseAsString.withDefault("all"));
  const [repFilter, setRepFilter] = useQueryState("rep", parseAsString.withDefault("all"));
  const [locationFilter, setLocationFilter] = useQueryState("location", parseAsString.withDefault("all"));
  const [lcpFilter, setLcpFilter] = useQueryState("lcp", parseAsString.withDefault("all"));
  const [vendorFilter, setVendorFilter] = useQueryState("vendor", parseAsString.withDefault("all"));
  const [providerFilter, setProviderFilter] = useQueryState("provider", parseAsString.withDefault("all"));
  const [showNewRepHighlights, setShowNewRepHighlights] = useQueryState("showNewRepHighlights", parseAsString.withDefault("0"));
  const [viewMode, setViewMode] = useQueryState("view", parseAsString.withDefault("rep"));
  const [rangeMode, setRangeMode] = useQueryState("range", parseAsString.withDefault("wtd"));
  const [monthId, setMonthId] = useQueryState("month", parseAsString.withDefault(toMonthId(new Date())));
  const [showZeroSales, setShowZeroSales] = useQueryState("showZeroSales", parseAsString.withDefault("1"));
  const [onlyZeroSales, setOnlyZeroSales] = useQueryState("onlyZeroSales", parseAsString.withDefault("0"));
  const [data, setData] = useState<SalesDataset | null>(null);
  const [rosterOptions, setRosterOptions] = useState<RosterOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [managers, setManagers] = useState<SalesManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canViewKnockHours, setCanViewKnockHours] = useState(false);
  const [knockHoursPeriod, setKnockHoursPeriod] = useState<KnockHoursPeriod>("daily");
  const [knockHoursCustomStart, setKnockHoursCustomStart] = useState(yesterdayDateId);
  const [knockHoursCustomEnd, setKnockHoursCustomEnd] = useState(yesterdayDateId);
  const [knockHours, setKnockHours] = useState<KnockHoursResponse | null>(null);
  const [knockHoursLoading, setKnockHoursLoading] = useState(false);
  const [knockHoursError, setKnockHoursError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [aliasTargetRepUid, setAliasTargetRepUid] = useState("");
  const [goalDraft, setGoalDraft] = useState("0");
  const [newRepForm, setNewRepForm] = useState<RepEditorForm>(blankRepEditorForm);
  const [locationDialogRep, setLocationDialogRep] = useState<SalesRepGroup | null>(null);
  const [managerDraft, setManagerDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [managerCreating, setManagerCreating] = useState(false);
  const [locationCreating, setLocationCreating] = useState(false);
  const [locationCreateTarget, setLocationCreateTarget] = useState<LocationCreateTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [teamOptions, setTeamOptions] = useState<Team[]>([]);

  const refreshActiveRoster = useCallback(async () => {
    const response = await authedJson<{ reps: RosterOption[] }>("/api/reps?status=active");
    setRosterOptions(response.reps ?? []);
  }, []);

  const loadSales = useCallback(async (options?: { silent?: boolean }) => {
    const params = new URLSearchParams({
      weekStart,
      range: rangeMode,
      ...(rangeMode === "mtd" ? { month: monthId } : {}),
      includeOrders: "true",
      search: search.trim(),
      manager: managerFilter,
      team: teamFilter,
      location: locationFilter,
      ...(isKnocks && lcpFilter !== "all" ? { lcp: lcpFilter } : {}),
      rep: repFilter,
      vendor: vendorFilter,
      provider: providerFilter,
    });
    try {
      if (!options?.silent) setLoading(true);
      const response = await authedJson<SalesResponse>(`/api/${kind}?${params.toString()}`);
      setError(null);
      setCanViewKnockHours(Boolean(isKnocks && response.canViewKnockHours));
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
  }, [isKnocks, kind, lcpFilter, locationFilter, managerFilter, monthId, providerFilter, rangeMode, repFilter, search, teamFilter, vendorFilter, weekStart, workspaceNameLower]);

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
    authedJson<{ teams: Team[] }>("/api/teams")
      .then((value) => setTeamOptions(value.teams ?? []))
      .catch(() => undefined);
  }, []);

  const isCurrentMonthSelected = monthId === toMonthId(new Date());
  const rangeStart = rangeMode === "mtd"
    ? toDateId(firstOfMonth(monthId))
    : weekStart;
  const rangeEnd = rangeMode === "mtd"
    ? (isCurrentMonthSelected ? toDateId(new Date()) : toDateId(lastOfMonth(monthId)))
    : weekToDateEnd(weekStart);
  const ytdStart = toDateId(new Date(new Date().getFullYear(), 0, 1));
  const ytdEnd = toDateId(new Date());
  const displayRangeEnd = rangeMode === "mtd"
    ? rangeEnd
    : toDateId(endOfWeek(new Date(`${weekStart}T12:00:00`)));

  useEffect(() => {
    if (!isKnocks || !canViewKnockHours || !rangeEnd) return;
    const anchor = knockHoursPeriod === "daily"
      ? yesterdayDateId()
      : knockHoursPeriod === "custom"
        ? knockHoursCustomStart
        : rangeEnd;
    if (!anchor || (knockHoursPeriod === "custom" && (!knockHoursCustomEnd || anchor > knockHoursCustomEnd))) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ period: knockHoursPeriod, anchor, lcp: lcpFilter });
      if (knockHoursPeriod === "custom") params.set("end", knockHoursCustomEnd);
      setKnockHoursLoading(true);
      void authedJson<KnockHoursResponse>(`/api/performance/knock-hours?${params.toString()}`)
        .then((value) => {
          if (!active) return;
          setKnockHours(value);
          setKnockHoursError(null);
        })
        .catch((cause) => {
          if (!active) return;
          setKnockHoursError(cause instanceof Error ? cause.message : "Unable to load knock hours.");
        })
        .finally(() => {
          if (active) setKnockHoursLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canViewKnockHours, isKnocks, knockHoursCustomEnd, knockHoursCustomStart, knockHoursPeriod, lcpFilter, rangeEnd]);
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({
      manager: managerFilter,
      team: teamFilter,
      rep: repFilter,
      location: locationFilter,
      vendor: vendorFilter,
      provider: providerFilter,
    });
    if (isKnocks) {
      params.set("start", rangeStart);
      params.set("end", rangeEnd);
      if (lcpFilter !== "all") params.set("lcp", lcpFilter);
      return `/api/knocks/export?${params.toString()}`;
    }
    params.set("vendorType", vendorFilter);
    params.set("start", rangeStart);
    params.set("end", rangeEnd);
    return `/api/sales/export?${params.toString()}`;
  }, [isKnocks, lcpFilter, locationFilter, managerFilter, providerFilter, rangeEnd, rangeStart, repFilter, teamFilter, vendorFilter]);
  const exportYtdHref = useMemo(() => {
    const params = new URLSearchParams({
      start: ytdStart,
      end: ytdEnd,
      manager: managerFilter,
      team: teamFilter,
      rep: repFilter,
      location: locationFilter,
      provider: providerFilter,
    });
    if (isKnocks) {
      params.set("vendor", vendorFilter);
      if (lcpFilter !== "all") params.set("lcp", lcpFilter);
      return `/api/knocks/export?${params.toString()}`;
    }
    params.set("ytd", "true");
    params.set("vendorType", vendorFilter);
    return `/api/sales/export?${params.toString()}`;
  }, [isKnocks, lcpFilter, locationFilter, managerFilter, providerFilter, repFilter, teamFilter, vendorFilter, ytdEnd, ytdStart]);

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
    const rosterRepUids = new Set(rosterOptions.map((rep) => rep.repUid));
    const rosterRows = rosterOptions.map((rep) => {
      const salesRow = salesByRepUid.get(rep.repUid);
      if (salesRow) {
        return {
          ...salesRow,
          createdAt: rep.createdAt,
          email: rep.email,
          firstSaleDateId: rep.firstSaleDateId,
          programIds: rep.programIds,
          inActiveRoster: true,
          source: "sales" as const,
          managerName: rep.managerName || salesRow.managerName,
          locationName: salesRow.locationName || rep.locationName,
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
        createdAt: rep.createdAt,
        email: rep.email,
        firstSaleDateId: rep.firstSaleDateId,
        programIds: rep.programIds,
        inActiveRoster: true,
        source: "roster" as const,
      };
    });
    const historicalSalesRows = salesRows
      .filter((row): row is typeof row & { repUid: string } => {
        const repUid = row.repUid;
        return typeof repUid === "string" && repUid.length > 0 && !rosterRepUids.has(repUid);
      })
      .map((row) => ({
        ...row,
        createdAt: undefined,
        email: undefined,
        firstSaleDateId: undefined,
        programIds: [],
        inActiveRoster: false,
        source: "sales" as const,
      }));
    const unmatchedRows = salesRows.filter((row) => !row.repUid).map((row) => ({ ...row, firstSaleDateId: undefined, inActiveRoster: false, source: "unmatched" as const }));
    return [...rosterRows, ...historicalSalesRows, ...unmatchedRows].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data?.reps, data?.week, reportSegments, rosterOptions, weekStart]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const includeZeroSales = showZeroSales !== "0";
    const zeroSalesOnly = canUseOnlyZeroSalesFilter && onlyZeroSales !== "0";
    const selectedProvider = normalizeProviderFilter(providerFilter);
    const selectedLcp = lcpFilter.trim().toLowerCase();
    const highlightOnly = !isKnocks && showNewRepHighlights !== "0";
    return rows.filter((row) => {
      const isHighlightedRep = isWithinNewRepHighlightWindow(row);
      const matchesSearch = !term || [row.displayName, row.managerName, row.locationName, row.programName, row.rawSalesId, row.email, ...row.orders.map((order) => order.customerName), ...row.orders.map((order) => order.orderNumber)].join(" ").toLowerCase().includes(term);
      const matchesVendor = vendorFilter === "all" || row.vendorType === vendorFilter;
      const rowProviders = row.orders.map((order) => normalizeProviderFilter(order.provider)).filter(Boolean);
      const rosterProviders = (row.programIds ?? []).map(normalizeProviderFilter).filter(Boolean);
      const rowLcps = row.orders.flatMap((order) => {
        const raw = order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {};
        const values = raw.lcps;
        return Array.isArray(values) ? values.map((value) => String(value).trim().toLowerCase()).filter(Boolean) : [];
      });
      const matchesProvider = providerFilter === "all"
        || rowProviders.includes(selectedProvider)
        || (!rowProviders.length && rosterProviders.includes(selectedProvider));
      const matchesLcp = !isKnocks || lcpFilter === "all" || rowLcps.includes(selectedLcp);
      return matchesSearch
        && (managerFilter === "all" || row.managerName === managerFilter)
        && (teamFilter === "all" || row.teamId === teamFilter)
        && (repFilter === "all" || row.displayName === repFilter)
        && (locationFilter === "all" || row.locationName === locationFilter)
        && matchesVendor
        && matchesProvider
        && matchesLcp
        && (!zeroSalesOnly || row.total === 0)
        && (!highlightOnly || isHighlightedRep)
        && (zeroSalesOnly || highlightOnly || includeZeroSales || row.total > 0);
    });
  }, [canUseOnlyZeroSalesFilter, isKnocks, lcpFilter, locationFilter, managerFilter, onlyZeroSales, providerFilter, repFilter, rows, search, showNewRepHighlights, showZeroSales, teamFilter, vendorFilter]);

  const teamChart = useMemo(() => visibleRows.map((row) => ({ name: row.displayName, sales: row.total })), [visibleRows]);
  const knockHoursChart = useMemo(() => {
    if (!knockHours || (providerFilter !== "all" && normalizeProviderFilter(providerFilter) !== "tfiber")) return [];
    const term = search.trim().toLowerCase();
    return knockHours.rows.filter((row) => {
      if (term && ![row.displayName, row.managerName, row.locationName].join(" ").toLowerCase().includes(term)) return false;
      if (managerFilter !== "all" && row.managerName !== managerFilter) return false;
      if (teamFilter !== "all" && row.teamId !== teamFilter) return false;
      if (repFilter !== "all" && row.displayName !== repFilter) return false;
      if (locationFilter !== "all" && row.locationName !== locationFilter) return false;
      if (vendorFilter !== "all" && row.vendorType !== vendorFilter) return false;
      return true;
    });
  }, [knockHours, locationFilter, managerFilter, providerFilter, repFilter, search, teamFilter, vendorFilter]);

    const rowSegments = useMemo(() => visibleRows.map((row) => {
    const counts = reportSegments.map(() => 0);
    const highlightWindow = !isKnocks && showNewRepHighlights !== "0" ? getNewRepHighlightWindow(getFirstSaleDateId(row)) : null;
    for (const order of row.orders) {
      const index = segmentIndexByDateId.get(order.orderDateId);
      if (index !== undefined) counts[index] += Number(order.saleCount || 1);
    }
    return {
      row,
      counts,
      highlightedSegmentIndices: !isKnocks && showNewRepHighlights !== "0"
        ? reportSegments.map((segment) => Boolean(highlightWindow && segment.dateIds.some((dateId) => dateId >= highlightWindow.startDateId && dateId <= highlightWindow.endDateId)))
        : reportSegments.map(() => false),
    };
  }), [isKnocks, segmentIndexByDateId, reportSegments, showNewRepHighlights, visibleRows]);

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

  const currentLabel = formatRangeLabel(rangeMode === "mtd" ? "mtd" : "wtd", data?.week.start ?? rangeStart, rangeMode === "mtd" ? data?.week.end ?? rangeEnd : displayRangeEnd, monthId);
  const isTeamView = viewMode === "team";
  const isKnockHoursView = isKnocks && canViewKnockHours && isTeamView;
  const hasNoData = !loading && visibleRows.length === 0;

  function openAction(rep: SalesRepGroup, type: ActionTarget["type"]) {
    const matchedManager = managers.find((item) => item.name === rep.managerName);
    const matchedLocation = locations.find((item) => item.name === rep.locationName);
    setActionTarget({ rep, type });
    setAliasTargetRepUid(type === "alias" ? rep.repUid ?? "" : "");
    setGoalDraft(String(Number(rep[goalField] || 0)));
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

  async function createRep() {
    if (!actionTarget) return;
    if (!newRepForm.displayName.trim()) {
      toast.error("Display name is required.");
      return;
    }
    if (!newRepForm.locationId.trim() || !newRepForm.locationName.trim()) {
      toast.error("Location is required.");
      return;
    }
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
      if (!response.ok) throw new Error(formatApiError(result.error, "Unable to create rep."));
      toast.success("Rep added to roster.");
      setActionTarget(null);
      await refreshActiveRoster();
      await loadSales({ silent: true });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create rep.");
    } finally {
      setActionSaving(false);
    }
  }

  async function restoreRepToRoster() {
    if (!actionTarget?.rep.repUid) return;
    setActionSaving(true);
    try {
      const response = await authedFetch(`/api/reps/${actionTarget.rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "restore" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to restore rep.");
      toast.success("Rep restored to roster.");
      setActionTarget(null);
      await refreshActiveRoster();
      await loadSales({ silent: true });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to restore rep.");
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

  async function createLocation(targetOverride?: LocationCreateTarget) {
    const name = locationDraft.trim();
    if (!name) return;
    const target = targetOverride ?? locationCreateTarget;
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
      if (target?.kind === "newRep") {
        setNewRepForm((current) => ({ ...current, locationId: created.locationId, locationName: created.name }));
      }
      setLocationDraft("");
      setLocationCreateTarget(null);
      toast.success(`Location ${created.name} added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create location.");
    } finally {
      setLocationCreating(false);
    }
  }

  function syncGoalState(repUid: string, goal: number) {
    setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === repUid ? { ...row, [goalField]: goal } : row) } : current);
    setRosterOptions((current) => current.map((item) => item.repUid === repUid ? { ...item, [goalField]: goal } : item));
  }

  async function updateInlineGoal(rep: SalesRepGroup, nextGoal: string) {
    if (!rep.repUid) return;
    const previousGoal = Number(rep[goalField] || 0);
    const goal = Number(nextGoal || 0);
    syncGoalState(rep.repUid, goal);
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
      syncGoalState(rep.repUid, previousGoal);
    } finally {}
  }

  function openCreateLocationDialog(target: LocationCreateTarget) {
    setLocationCreateTarget(target);
    setLocationDraft("");
  }

  async function downloadExport(href: string, fallbackFileName: string, successMessage: string, errorMessage: string) {
    setExporting(true);
    try {
      const response = await authedFetch(href);
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: errorMessage })) as { error?: string };
        throw new Error(result.error || errorMessage);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = match?.[1] || fallbackFileName;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.message(successMessage);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : errorMessage);
    } finally {
      setExporting(false);
    }
  }

  async function exportCurrentWorkbook() {
    if (!exportHref) return;
    await downloadExport(
      exportHref,
      isKnocks ? `knocks-export-${rangeStart}-to-${rangeEnd}.xlsx` : `sales-export-${rangeStart}-to-${rangeEnd}.xlsx`,
      isKnocks ? "Downloaded the knocks export workbook." : "Downloaded the sales export workbook.",
      isKnocks ? "Unable to export knocks." : "Unable to export sales.",
    );
  }

  async function exportYtdWorkbook() {
    if (!exportYtdHref) return;
    await downloadExport(
      exportYtdHref,
      isKnocks ? `knocks-export-ytd-${ytdStart}-to-${ytdEnd}.xlsx` : `sales-export-ytd-${ytdStart}-to-${ytdEnd}.xlsx`,
      isKnocks ? "Downloaded the YTD knocks export workbook." : "Downloaded the YTD sales export workbook.",
      isKnocks ? "Unable to export YTD knocks." : "Unable to export YTD sales.",
    );
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
            <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => (rangeMode === "mtd" ? setMonthId(shiftMonthId(monthId, -1)) : setWeekStart(shiftWeekStart(weekStart, -7)))}
                aria-label={rangeMode === "mtd" ? "Previous month" : "Previous week"}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {rangeMode === "mtd" ? (
                <Select value={monthId} onValueChange={setMonthId}>
                  <SelectTrigger className="h-12 w-[min(100%,280px)] gap-2 rounded-full border-border/60 bg-background/80 px-5 shadow-sm sm:w-[280px] md:w-[320px] xl:w-[300px]">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Select month" className="min-w-0 flex-1 truncate text-center text-sm" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions(monthId).map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={weekStart} onValueChange={setWeekStart}>
                  <SelectTrigger className="h-12 w-[min(100%,280px)] gap-2 rounded-full border-border/60 bg-background/80 px-5 shadow-sm sm:w-[280px] md:w-[320px] xl:w-[300px]">
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
              )}
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => (rangeMode === "mtd" ? setMonthId(shiftMonthId(monthId, 1)) : setWeekStart(shiftWeekStart(weekStart, 7)))}
                aria-label={rangeMode === "mtd" ? "Next month" : "Next week"}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="flex items-center rounded-full border border-border/60 bg-background/80 p-1 shadow-sm">
                <Button size="sm" variant={rangeMode === "wtd" ? "default" : "ghost"} className="h-8 rounded-full px-3" onClick={() => setRangeMode("wtd")}>WTD</Button>
                <Button size="sm" variant={rangeMode === "mtd" ? "default" : "ghost"} className="h-8 rounded-full px-3" onClick={() => setRangeMode("mtd")}>MTD</Button>
              </div>
              <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap" onClick={() => void loadSales()}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full whitespace-nowrap"
                  onClick={() => void exportCurrentWorkbook()}
                  disabled={exporting}
                >
                  <Download className="h-4 w-4" />
                  {exporting ? "Exporting..." : isKnocks ? "Export knocks" : "Export"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full whitespace-nowrap"
                  onClick={() => void exportYtdWorkbook()}
                  disabled={exporting}
                >
                  <Download className="h-4 w-4" />
                  {exporting ? "Exporting..." : isKnocks ? "Export YTD knocks" : "Export YTD"}
                </Button>
            </div>
          </div>

          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList className="inline-flex rounded-full bg-muted/60 p-1">
              <TabsTrigger value="rep">Rep grid</TabsTrigger>
              <TabsTrigger value="team">Team chart</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 rounded-[24px] border border-border/60 bg-muted/20 p-4 shadow-sm md:grid-cols-2 xl:grid-cols-9">
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
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teamOptions.filter((team) => team.active || team.teamId === teamFilter).map((team) => <SelectItem key={team.teamId} value={team.teamId}>{team.name}</SelectItem>)}
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
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Vendor type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendor types</SelectItem>
                <SelectItem value="organic">Organic</SelectItem>
                <SelectItem value="subVendor">Sub-vendor</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="att">ATT</SelectItem>
                <SelectItem value="tfiber">T-Fiber</SelectItem>
              </SelectContent>
            </Select>
            {isKnocks ? (
              <Select value={lcpFilter} onValueChange={setLcpFilter}>
                <SelectTrigger className="h-11 rounded-full border-border/60 bg-background/80 shadow-sm"><SelectValue placeholder="LCP" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All LCPs</SelectItem>
                  {Array.from(new Set(rows.flatMap((row) => row.orders.flatMap((order) => {
                    const raw = order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {};
                    const values = raw.lcps;
                    return Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];
                  }))))
                    .sort((a, b) => a.localeCompare(b))
                    .map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            {canUseOnlyZeroSalesFilter ? (
              <div className="flex h-11 items-center justify-between gap-3 rounded-full border border-border/60 bg-background/80 px-4 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none">Exit Hold</p>
                </div>
                <Switch
                  checked={onlyZeroSales !== "0"}
                  onCheckedChange={(checked) => {
                    void setOnlyZeroSales(checked ? "1" : "0");
                    if (checked) void setShowZeroSales("1");
                  }}
                  aria-label="Exit Hold"
                />
              </div>
            ) : null}
            {!isKnocks ? (
              <div className="flex h-11 items-center justify-between gap-3 rounded-full border border-border/60 bg-background/80 px-4 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none">New rep window</p>
                </div>
                <Switch checked={showNewRepHighlights !== "0"} onCheckedChange={(checked) => void setShowNewRepHighlights(checked ? "1" : "0")} aria-label="Show new rep window" />
              </div>
            ) : null}
            <div className="flex h-11 items-center justify-between gap-3 rounded-full border border-border/60 bg-background/80 px-4 shadow-sm">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">Show zero {workspaceNameLower}</p>
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
            <CardTitle>{isKnockHoursView ? "Knock hours worked" : isTeamView ? "Team totals" : `Rep weekly grid`}</CardTitle>
            <CardDescription>
              {isKnockHoursView
                ? "Daily shows yesterday's completed activity. Use Custom for a specific day or range; sales are included when hovering."
                : isTeamView
                ? `Bar chart of total ${workspaceNameLower} by rep.`
                : rangeMode === "mtd"
                  ? `Rep names, manager, location, weekly ${workspaceNameLower}, and weekly goal.`
                  : `Rep names, manager, location, daily ${workspaceNameLower}, and weekly goal.`}
            </CardDescription>
            {isKnockHoursView ? (
              <Tabs value={knockHoursPeriod} onValueChange={(value) => setKnockHoursPeriod(value as KnockHoursPeriod)}>
                <TabsList><TabsTrigger value="daily">Daily</TabsTrigger><TabsTrigger value="weekly">Weekly</TabsTrigger><TabsTrigger value="monthly">Monthly</TabsTrigger><TabsTrigger value="custom">Custom</TabsTrigger></TabsList>
              </Tabs>
            ) : null}
            {isKnockHoursView && knockHoursPeriod === "custom" ? (
              <div className="flex flex-wrap items-end gap-3 pt-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="knock-hours-start">Start date</Label>
                  <Input
                    id="knock-hours-start"
                    type="date"
                    max={knockHoursCustomEnd || undefined}
                    value={knockHoursCustomStart}
                    onChange={(event) => {
                      const next = event.target.value;
                      setKnockHoursCustomStart(next);
                      if (next && (!knockHoursCustomEnd || knockHoursCustomEnd < next)) setKnockHoursCustomEnd(next);
                    }}
                    className="w-[170px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="knock-hours-end">End date</Label>
                  <Input id="knock-hours-end" type="date" min={knockHoursCustomStart || undefined} value={knockHoursCustomEnd} onChange={(event) => setKnockHoursCustomEnd(event.target.value)} className="w-[170px]" />
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className={cn("p-5 pt-0 sm:p-6 sm:pt-0 lg:p-7 lg:pt-0", viewMode === "team" ? "px-0" : undefined)}>
            {isTeamView ? (
              isKnockHoursView ? (
                knockHoursLoading ? (
                  <Skeleton className="h-[420px] rounded-[28px]" />
                ) : knockHoursError ? (
                  <EmptyState title="Hours unavailable" description={knockHoursError} />
                ) : knockHoursChart.length ? (
                  <div className="max-h-[680px] overflow-y-auto">
                    <div style={{ height: Math.max(420, knockHoursChart.length * 48) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={knockHoursChart} layout="vertical" margin={{ left: 20, right: 28, top: 24, bottom: 18 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.7} horizontal={false} />
                          <XAxis xAxisId="hours" type="number" orientation="bottom" tickLine={false} axisLine={false} tickFormatter={(value) => formatHoursAsDuration(Number(value))} />
                          <XAxis xAxisId="knocks" type="number" orientation="top" tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="displayName" width={170} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)" }} />
                          <RechartsTooltip content={<KnockHoursChartTooltip />} />
                          <Bar xAxisId="hours" dataKey="hoursWorked" name="Hours worked" radius={[0, 10, 10, 0]} fill="#8b5cf6" stroke="#8b5cf6" barSize={12} />
                          <Bar xAxisId="knocks" dataKey="knocks" name="Knocks" radius={[0, 10, 10, 0]} fill="#2563eb" stroke="#2563eb" barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No timestamped knocks" description="No matched T-Fiber disposition timestamps were found for this period and scope." />
                )
              ) : teamChart.length ? (
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
                    {rowSegments.map(({ row: rep, counts, highlightedSegmentIndices }) => (
                      <TableRow key={rep.key} className="h-16 border-border/60 transition-colors hover:bg-muted/20">
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate">{rep.displayName}</div>
                            </div>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="mx-auto h-9 w-full max-w-[170px] rounded-full border-border/60 bg-background/80 px-3 shadow-sm"
                              onClick={() => setLocationDialogRep(rep)}
                            >
                              <span className="truncate">{rep.locationName || "Unassigned"}</span>
                            </Button>
                          ) : (
                            <span className="block truncate">{rep.locationName || "Unassigned"}</span>
                          )}
                        </TableCell>
                        {counts.map((value, index) => {
                          const daily = value;
                          return (
                            <TableCell
                              key={reportSegments[index]?.key ?? index}
                              className={cn(
                                "text-center transition-colors",
                                weekColumnClass(index),
                                highlightedSegmentIndices[index] ? "bg-yellow-100/45 text-foreground dark:bg-yellow-200/18 dark:text-foreground" : undefined,
                              )}
                            >
                              {daily ? <Badge variant="success">{daily}</Badge> : <span className={highlightedSegmentIndices[index] ? "text-foreground/80" : "text-muted-foreground"}>0</span>}
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
                                if (rep.repUid) syncGoalState(rep.repUid, nextGoal);
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
                            {canAddAlias ? (
                              <Button size="sm" variant="outline" className="h-9 rounded-full gap-1.5 px-3 shadow-sm" onClick={() => openAction(rep, "alias")}>
                                <Pencil className="h-4 w-4" />
                                Add alias
                              </Button>
                            ) : null}
                            {rep.repUid && !rep.inActiveRoster ? (
                              <Button size="sm" variant="outline" className="h-9 rounded-full gap-1.5 px-3 shadow-sm" onClick={() => openAction(rep, "restore")}>
                                <UserPlus className="h-4 w-4" />
                                Restore to roster
                              </Button>
                            ) : null}
                            {!rep.repUid && (
                              <>
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
              {actionTarget?.type === "goal" ? `Update ${goalLabel.toLowerCase()}` : actionTarget?.type === "alias" ? "Add alias" : actionTarget?.type === "restore" ? "Restore to roster" : "Add to roster"}
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

          {actionTarget?.type === "restore" && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>This row is tied to an existing rep record that is not currently in the active roster.</p>
              <p>Restore it to bring the rep back into the active roster without creating a duplicate.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionTarget) return;
                if (actionTarget.type === "goal") void saveGoal();
                if (actionTarget.type === "alias") void saveAlias();
                if (actionTarget.type === "restore") void restoreRepToRoster();
              }}
              disabled={actionSaving || (actionTarget?.type === "alias" && !aliasTargetRepUid)}
            >
              {actionSaving ? "Saving..." : actionTarget?.type === "restore" ? "Restore rep" : "Save change"}
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
        onCreateLocation={() => void createLocation({ kind: "newRep" })}
        managerCreating={managerCreating}
        locationCreating={locationCreating}
        canCreateManager={Boolean(managerDraft.trim())}
        canCreateLocation={Boolean(locationDraft.trim())}
        onManagerDraftChange={setManagerDraft}
        onLocationDraftChange={setLocationDraft}
        onRequestAddLocation={() => openCreateLocationDialog({ kind: "newRep" })}
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
      <Dialog open={Boolean(locationCreateTarget)} onOpenChange={(open) => {
        if (open) return;
        setLocationCreateTarget(null);
        setLocationDraft("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add location</DialogTitle>
            <DialogDescription>Create a location and use it immediately in this workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-location-name">Location name</Label>
            <Input id="new-location-name" value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} placeholder="New location name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setLocationCreateTarget(null);
              setLocationDraft("");
            }}>Cancel</Button>
            <Button onClick={() => void createLocation()} disabled={locationCreating || !locationDraft.trim()}>
              {locationCreating ? "Adding..." : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssignLocationDialog
        open={Boolean(locationDialogRep)}
        onOpenChange={(open) => !open && setLocationDialogRep(null)}
        rep={locationDialogRep?.repUid ? { repUid: locationDialogRep.repUid, displayName: locationDialogRep.displayName } : null}
        locations={locations}
        defaultWeekStart={weekStart}
        onSaved={(result) => {
          // Resolution can depend on other assignments beyond this single
          // field, so patch the visible row only when it affects the week
          // currently on screen, then let the background refetch reconcile
          // against the real server-side resolution either way.
          if (result.weekStart === weekStart) {
            setData((current) => current ? {
              ...current,
              reps: current.reps.map((row) => row.repUid === result.repUid ? { ...row, locationName: result.locationName } : row),
            } : current);
          }
          void loadSales({ silent: true });
        }}
      />
    </motion.div>
  );
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

function KnockHoursChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: KnockHoursRow }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const time = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  return (
    <div className="rounded-2xl border border-border/70 bg-popover/95 px-4 py-3 text-popover-foreground shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Representative</p>
      <p className="mt-1 text-sm font-medium text-foreground">{row.displayName}</p>
      <p className="mt-2 text-sm font-semibold text-violet-500">Hours: {formatHoursAsDuration(row.hoursWorked)}</p>
      <p className="text-sm font-semibold text-blue-600">Knocks: {formatNumber(row.knocks)}</p>
      <p className="text-sm font-semibold text-emerald-600">Sales: {formatNumber(row.sales)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{row.daysWorked} {row.daysWorked === 1 ? "day" : "days"} worked</p>
      {row.daysWorked === 1 ? <p className="text-xs text-muted-foreground">{time(row.firstKnockAt)} to {time(row.lastKnockAt)} Eastern</p> : null}
    </div>
  );
}
