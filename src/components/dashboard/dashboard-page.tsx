"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, Download, FileUp, Gauge, Target, Timer, TrendingUp, TriangleAlert, Users, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { normalizePermissions } from "@/src/lib/access";
import { startOfWeek, toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { formatHoursAsDuration } from "@/src/lib/formatters/duration";
import { formatCompact, formatDelta, formatNumber } from "@/src/lib/formatters/number";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { microLabel, StatTile } from "@/components/ui/stat-tile";
import { Panel, FlatEmptyState as EmptyState } from "@/components/ui/data-panel";
import { useAuth } from "@/src/components/auth-provider";
import { OrdersDrilldownSheet } from "@/src/components/performance/orders-drilldown-sheet";
import type { PerformanceOrder } from "@/src/lib/performance/performance-utils";
import { exportOrdersWorkbook } from "@/src/lib/reports/sales-export";

type OrderStatusTotals = {
  total: number;
  installed: number;
  pending: number;
  pastDue: number;
  preorder: number;
  canceled: number;
  churned: number;
  unknown: number;
};

type OverviewResponse = {
  week: { start: string; end: string };
  orderStatusRange?: { start: string; end: string };
  totalSales: number;
  totalSalesGoal: number;
  totalKnocks: number;
  activeReps: number;
  byDay: number[];
  byDayTeams: { manager: string; sales: number }[][];
  byProvider: Record<string, number>;
  topReps: { repUid: string; displayName: string; sales: number }[];
  comparison: { current: number; previous: number; currentStart: string; currentEnd: string; previousStart: string; previousEnd: string };
  alerts: { type: "pace" | "roster" | "upload"; title: string; detail: string }[];
  goalPacing: { repUid: string; displayName: string; sales: number; goal: number; expected: number; remaining: number; neededPerDay: number }[];
  freshness: { companya: { uploadedAt: string | null; rows: number; fileName: string } | null; companyb: { uploadedAt: string | null; rows: number; fileName: string } | null };
  statusFunnel: Record<string, OrderStatusTotals>;
  orderStatusTotals?: OrderStatusTotals;
  teamSnapshot: { manager: string; location: string; sales: number; goal: number }[];
  efficiency: { repUid: string; displayName: string; sales: number; knocks: number; conversion: number }[];
  scope: { mode: "all" | "self" | "managedTeam" | "currentTeam"; restricted: boolean; canFilterReps: boolean; reps: { repUid: string; displayName: string }[] };
};

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

type KnockHoursResponse = { period: string; range: { start: string; end: string }; rows: KnockHoursRow[] };
type DashboardRangeMode = "week" | "mtd" | "ytd" | "custom";

const emptyOrderStatusTotals = (): OrderStatusTotals => ({ total: 0, installed: 0, pending: 0, pastDue: 0, preorder: 0, canceled: 0, churned: 0, unknown: 0 });

// Categorical palette validated with the dataviz six-checks script (all-pairs, light + dark).
const providerColors: Record<string, string> = {
  "Company A": "#2a78d6",
  "Company B": "#d55181",
  Frontier: "#c98500",
  Manual: "#008300",
};

const providerTokenMap: Record<string, string> = { companya: "Company A", companyb: "Company B", manual: "Manual" };

const accent = {
  blue: "var(--primary)",
  sky: "var(--info)",
  green: "var(--success)",
  red: "var(--destructive)",
  amber: "#c98500",
  teal: "#1baf7a",
  magenta: "#b76e8f",
  violet: "#8d7cd8",
};

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function salesSharePercent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function providerColor(name: string) {
  return providerColors[name] ?? "#898781";
}

function addDays(start: string, days: number) {
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

function isDateId(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthEndDateId(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  if (!year || !month) return "";
  return toDateId(new Date(year, month, 0));
}

function dashboardRange(options: {
  mode: DashboardRangeMode;
  weekStart: string;
  currentWeekStart: string;
  month: string;
  year: string;
  customFrom: string;
  customTo: string;
  todayId: string;
}) {
  const clampToToday = (dateId: string) => dateId && dateId > options.todayId ? options.todayId : dateId;
  if (options.mode === "mtd" && /^\d{4}-\d{2}$/.test(options.month)) {
    const from = `${options.month}-01`;
    return { from, to: clampToToday(monthEndDateId(options.month)), key: `mtd:${options.month}` };
  }
  if (options.mode === "ytd" && /^\d{4}$/.test(options.year)) {
    const from = `${options.year}-01-01`;
    return { from, to: clampToToday(`${options.year}-12-31`), key: `ytd:${options.year}` };
  }
  if (options.mode === "custom" && isDateId(options.customFrom) && isDateId(options.customTo) && options.customFrom <= options.customTo) {
    return { from: options.customFrom, to: options.customTo, key: `custom:${options.customFrom}:${options.customTo}` };
  }
  if (options.weekStart && options.weekStart !== options.currentWeekStart) {
    return { from: options.weekStart, to: toDateId(addDays(options.weekStart, 6)), key: `week:${options.weekStart}` };
  }
  return { from: "", to: "", key: `week:${options.currentWeekStart || "current"}` };
}

function inclusiveDays(start: string, end: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(first.valueOf()) || Number.isNaN(last.valueOf()) || first > last) return 1;
  return Math.max(1, Math.round((last.valueOf() - first.valueOf()) / 86400000) + 1);
}

function weekStartOptions(reference = new Date(), count = 53) {
  const currentMonday = startOfWeek(reference);
  return Array.from({ length: count }, (_, index) => {
    const monday = new Date(currentMonday);
    monday.setDate(monday.getDate() - (index * 7));
    return {
      value: toDateId(monday),
      label: monday.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  });
}

function LoadingState() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Skeleton className="h-9 w-full sm:w-96" />
      <Skeleton className="h-28 w-full sm:h-20" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-none" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.9fr]">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit = "sales",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; label?: string; fill?: string } }>;
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const heading = label ?? row?.payload?.label ?? row?.payload?.name ?? row?.name;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{String(heading ?? "")}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(Number(row?.value ?? 0))} <span className="font-normal text-muted-foreground">{unit}</span></p>
    </div>
  );
}

function KnockHoursTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: KnockHoursRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-sm font-medium">{row.displayName}</p>
      <div className="mt-1 space-y-0.5 text-[13px] tabular-nums">
        <p><span className="text-muted-foreground">Hours worked:</span> <span className="font-semibold">{formatHoursAsDuration(row.hoursWorked)}</span></p>
        <p><span className="text-muted-foreground">Knocks:</span> <span className="font-semibold">{formatNumber(row.knocks)}</span></p>
        <p><span className="text-muted-foreground">Sales:</span> <span className="font-semibold">{formatNumber(row.sales)}</span></p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{row.daysWorked} {row.daysWorked === 1 ? "day" : "days"} worked</p>
    </div>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const todayId = useMemo(() => toDateId(new Date()), []);
  const currentMonth = todayId.slice(0, 7);
  const currentYear = todayId.slice(0, 4);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportingYtdPivot, setExportingYtdPivot] = useState(false);
  const [providerFilter, setProviderFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [rangeMode, setRangeMode] = useState<DashboardRangeMode>("week");
  const [weekStartFilter, setWeekStartFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentMonth);
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [customFrom, setCustomFrom] = useState(todayId);
  const [customTo, setCustomTo] = useState(todayId);
  const [knockHours, setKnockHours] = useState<KnockHoursResponse | null>(null);
  const [knockHoursError, setKnockHoursError] = useState<string | null>(null);
  const [knockHoursLoadedKey, setKnockHoursLoadedKey] = useState("");
  const [knockHoursForbidden, setKnockHoursForbidden] = useState(false);
  const [performanceOrders, setPerformanceOrders] = useState<PerformanceOrder[]>([]);
  const [activeDrilldown, setActiveDrilldown] = useState<"total" | "installed" | "pending" | "pastDue" | null>(null);
  const weekOptions = useMemo(() => weekStartOptions(), []);
  const currentWeekStart = weekOptions[0]?.value ?? "";
  const reducedMotion = useReducedMotion();
  const selectedRange = useMemo(() => dashboardRange({ mode: rangeMode, weekStart: weekStartFilter, currentWeekStart, month: monthFilter, year: yearFilter, customFrom, customTo, todayId }), [currentWeekStart, customFrom, customTo, monthFilter, rangeMode, todayId, weekStartFilter, yearFilter]);
  const requestKey = `${profile?.authUid ?? "loading"}|${providerFilter}|${repFilter}|${selectedRange.key}`;
  const loading = loadedRequestKey !== requestKey;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (providerFilter !== "all") params.set("provider", providerFilter);
    if (repFilter !== "all") params.set("repId", repFilter);
    if (selectedRange.from && selectedRange.to) {
      params.set("from", selectedRange.from);
      params.set("to", selectedRange.to);
    }
    void authedJson<OverviewResponse>(`/api/overview${params.size ? `?${params.toString()}` : ""}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        if (repFilter !== "all" && !value.scope.reps.some((rep) => rep.repUid === repFilter)) setRepFilter("all");
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load overview.";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoadedRequestKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [profile?.authUid, providerFilter, repFilter, requestKey, selectedRange.from, selectedRange.to]);

  const performanceStart = data?.orderStatusRange?.start ?? data?.week.start;
  const performanceEnd = data?.orderStatusRange?.end ?? data?.week.end;

  useEffect(() => {
    if (!performanceStart || !performanceEnd) return;
    let active = true;
    const params = new URLSearchParams({ range: "custom", from: performanceStart, to: performanceEnd });
    void authedJson<{ orders: PerformanceOrder[] }>(`/api/performance?${params.toString()}`)
      .then((value) => {
        if (!active) return;
        setPerformanceOrders(value.orders ?? []);
      })
      .catch(() => {
        if (!active) return;
        setPerformanceOrders([]);
      });
    return () => {
      active = false;
    };
  }, [performanceStart, performanceEnd]);

  const canSeeKnockHours = Boolean(
    profile && (profile.role === "superAdmin" || normalizePermissions(profile.permissions ?? {}).canViewKnockHours),
  ) && !knockHoursForbidden;

  const knockHoursRequestKey = `${profile?.authUid ?? "loading"}|${performanceStart ?? ""}|${performanceEnd ?? ""}`;
  const knockHoursLoading = canSeeKnockHours && knockHoursLoadedKey !== knockHoursRequestKey;

  useEffect(() => {
    if (!canSeeKnockHours || !performanceStart || !performanceEnd) return;
    let active = true;
    const params = new URLSearchParams({ period: "custom", anchor: performanceStart, end: performanceEnd, lcp: "all" });
    void authedJson<KnockHoursResponse>(`/api/performance/knock-hours?${params.toString()}`)
      .then((value) => {
        if (!active) return;
        setKnockHours(value);
        setKnockHoursError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load knock hours.";
        if (/forbidden/i.test(message)) {
          setKnockHoursForbidden(true);
          return;
        }
        setKnockHoursError(message);
      })
      .finally(() => {
        if (active) setKnockHoursLoadedKey(knockHoursRequestKey);
      });
    return () => {
      active = false;
    };
  }, [canSeeKnockHours, knockHoursRequestKey, performanceEnd, performanceStart, profile?.authUid]);

  const weekLabel = data ? weekRangeLabel(data.week.start, data.week.end) : "Current week";

  const knockHoursRows = useMemo(
    () => (knockHours?.rows ?? []).filter((row) => repFilter === "all" || row.repUid === repFilter),
    [knockHours, repFilter],
  );

  const totalHoursWorked = useMemo(() => knockHoursRows.reduce((sum, row) => sum + Number(row.hoursWorked || 0), 0), [knockHoursRows]);
  const avgSalesPerHour = totalHoursWorked > 0 ? (data?.totalSales ?? 0) / totalHoursWorked : 0;

  const scopedPerformanceOrders = useMemo(() => {
    const providerName = providerFilter === "all" ? null : providerTokenMap[providerFilter];
    return performanceOrders.filter((order) => {
      if (providerName && order.provider !== providerName) return false;
      if (repFilter !== "all" && order.repUid !== repFilter) return false;
      return true;
    });
  }, [performanceOrders, providerFilter, repFilter]);

  const installedOrderRows = useMemo(() => scopedPerformanceOrders.filter((order) => order.outcome === "installed"), [scopedPerformanceOrders]);
  const pendingOrderRows = useMemo(() => scopedPerformanceOrders.filter((order) => order.outcome === "pending" || order.outcome === "past_due"), [scopedPerformanceOrders]);
  const pastDueOrderRows = useMemo(() => scopedPerformanceOrders.filter((order) => order.pastDue || order.outcome === "past_due"), [scopedPerformanceOrders]);

  const drilldownConfig: Record<Exclude<typeof activeDrilldown, null>, { title: string; description: string; rows: PerformanceOrder[]; emptyTitle: string; emptyDescription: string; exportPrefix: string }> = {
    total: { title: "Total sales", description: "All sales in the selected range", rows: scopedPerformanceOrders, emptyTitle: "No sales", emptyDescription: "No sales orders match the current filters.", exportPrefix: "dashboard-total-sales" },
    installed: { title: "Active installs", description: "Installed orders in the selected range", rows: installedOrderRows, emptyTitle: "No active installs", emptyDescription: "No installed orders match the current filters.", exportPrefix: "dashboard-active-installs" },
    pending: { title: "Pending", description: "Pending installs, including past due", rows: pendingOrderRows, emptyTitle: "No pending installs", emptyDescription: "No pending orders match the current filters.", exportPrefix: "dashboard-pending-installs" },
    pastDue: { title: "Past due installs", description: "Pending installs past the ETA", rows: pastDueOrderRows, emptyTitle: "No past due installs", emptyDescription: "No installs are past their estimated install date.", exportPrefix: "dashboard-past-due-installs" },
  };

  const providerBreakdown = useMemo(
    () => Object.entries(data?.byProvider ?? {})
      .map(([name, value]) => ({ name, value, fill: providerColor(name) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    [data],
  );

  const statusTotals = useMemo(() => {
    if (data?.orderStatusTotals) return data.orderStatusTotals;
    const totals = emptyOrderStatusTotals();
    for (const statuses of Object.values(data?.statusFunnel ?? {})) {
      totals.total += statuses.total ?? 0;
      totals.installed += statuses.installed ?? 0;
      totals.pending += statuses.pending ?? 0;
      totals.pastDue += statuses.pastDue ?? 0;
      totals.preorder += statuses.preorder ?? 0;
      totals.canceled += statuses.canceled ?? 0;
      totals.churned += statuses.churned ?? 0;
      totals.unknown += statuses.unknown ?? 0;
    }
    return totals;
  }, [data]);

  const orderBreakdownData = useMemo(() => {
    const total = statusTotals.total || data?.totalSales || 0;
    return [
      { name: "Active", value: statusTotals.installed, fill: "var(--success)", share: salesSharePercent(statusTotals.installed, total) },
      { name: "Pending", value: statusTotals.pending, fill: "var(--warning)", share: salesSharePercent(statusTotals.pending, total) },
      { name: "Past due", value: statusTotals.pastDue, fill: "var(--destructive)", share: salesSharePercent(statusTotals.pastDue, total) },
      { name: "Preorders", value: statusTotals.preorder, fill: "var(--info)", share: salesSharePercent(statusTotals.preorder, total) },
      { name: "Canceled", value: statusTotals.canceled, fill: "var(--danger)", share: salesSharePercent(statusTotals.canceled, total) },
      { name: "Churned", value: statusTotals.churned, fill: "var(--muted-foreground)", share: salesSharePercent(statusTotals.churned, total) },
      { name: "Unknown", value: statusTotals.unknown, fill: "var(--muted)", share: salesSharePercent(statusTotals.unknown, total) },
    ].filter((item) => item.value > 0);
  }, [data?.totalSales, statusTotals]);

  const topReps = useMemo(
    () => (data?.topReps ?? []).map((rep) => ({ ...rep, share: salesSharePercent(rep.sales, data?.totalSales ?? 0) })),
    [data],
  );

  if (loading) return <LoadingState />;
  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Overview unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  const comparisonDelta = data.comparison.previous ? ((data.comparison.current - data.comparison.previous) / data.comparison.previous) * 100 : 0;
  const rangeDays = inclusiveDays(data.week.start, data.week.end);
  const rangeSalesGoal = Math.round((data.totalSalesGoal * rangeDays) / 7);
  const goalProgress = rangeSalesGoal ? Math.min(100, Math.round((data.totalSales / rangeSalesGoal) * 100)) : 0;
  const conversion = data.totalKnocks ? Math.round((data.totalSales / data.totalKnocks) * 100) : 0;
  const providerTotal = providerBreakdown.reduce((sum, item) => sum + item.value, 0);
  const hasOrderBreakdown = orderBreakdownData.some((item) => item.value > 0);
  const statusRangeLabel = data.orderStatusRange ? weekRangeLabel(data.orderStatusRange.start, data.orderStatusRange.end) : weekLabel;
  const selectedYear = Number(rangeMode === "ytd" ? yearFilter : data.week.start.slice(0, 4)) || new Date().getFullYear();
  const canUseOperationalActions = profile?.role === "superAdmin" || profile?.role === "admin";
  const topRepSales = topReps[0]?.sales || 1;

  async function exportYtdWeeklyPivot() {
    setExportingYtdPivot(true);
    try {
      const response = await authedFetch(`/api/overview/export-ytd-pivot?year=${selectedYear}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: "Unable to export YTD weekly pivot." })) as { error?: string };
        throw new Error(result.error || "Unable to export YTD weekly pivot.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = match?.[1] || `YTD_Weekly_Sales_Pivot_Dashboard_${toDateId(new Date())}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Downloaded the YTD weekly pivot workbook.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to export YTD weekly pivot.");
    } finally {
      setExportingYtdPivot(false);
    }
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", error ? "bg-warning" : "bg-success")} aria-hidden />
            <span className={microLabel}>{error ? "Stale data" : "Live"}</span>
          </span>
          <span className="text-border" aria-hidden>/</span>
          <span className="text-sm text-muted-foreground">{weekLabel}</span>
        </div>
        {canUseOperationalActions ? (
          <div className="hidden gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void exportYtdWeeklyPivot()} disabled={exportingYtdPivot}>
              <Download className="h-4 w-4" />
              {exportingYtdPivot ? "Exporting..." : "Export YTD Pivot"}
            </Button>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href="/performance">
                <ArrowRight className="h-4 w-4" />
                Open performance
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href="/imports">
                <FileUp className="h-4 w-4" />
                Upload report
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      {error ? (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Refresh warning</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="space-y-3">
          <Tabs value={rangeMode} onValueChange={(value) => setRangeMode(value as DashboardRangeMode)}>
            <TabsList className="grid h-auto w-full grid-cols-4">
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="mtd">MTD</TabsTrigger>
              <TabsTrigger value="ytd">YTD</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_auto] xl:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-rep-filter" className={microLabel}>Representative</Label>
            <Select value={repFilter} onValueChange={setRepFilter} disabled={!data.scope.canFilterReps}>
              <SelectTrigger id="dashboard-rep-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{data.scope.restricted ? "Me and my entire team" : "All representatives"}</SelectItem>
                {data.scope.reps.map((rep) => <SelectItem key={rep.repUid} value={rep.repUid}>{rep.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-provider-filter" className={microLabel}>Provider</Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger id="dashboard-provider-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="companya">Company A</SelectItem>
                <SelectItem value="companyb">Company B</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {rangeMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-week-filter" className={microLabel}>Week starting</Label>
              <Select value={weekStartFilter || currentWeekStart} onValueChange={(value) => setWeekStartFilter(value === currentWeekStart ? "" : value)}>
                <SelectTrigger id="dashboard-week-filter"><SelectValue placeholder="Select a Monday" /></SelectTrigger>
                <SelectContent>
                  {weekOptions.map((week, index) => <SelectItem key={week.value} value={week.value}>{week.label}{index === 0 ? " (Current week)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {rangeMode === "mtd" ? (
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-month-filter" className={microLabel}>Month</Label>
              <Input id="dashboard-month-filter" type="month" value={monthFilter} max={currentMonth} onChange={(event) => setMonthFilter(event.target.value)} />
            </div>
          ) : null}
          {rangeMode === "ytd" ? (
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-year-filter" className={microLabel}>Year</Label>
              <Input id="dashboard-year-filter" type="number" min="2020" max={currentYear} value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} />
            </div>
          ) : null}
          {rangeMode === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-custom-from" className={microLabel}>From</Label>
                <Input id="dashboard-custom-from" type="date" value={customFrom} max={customTo || todayId} onChange={(event) => setCustomFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-custom-to" className={microLabel}>To</Label>
                <Input id="dashboard-custom-to" type="date" value={customTo} min={customFrom} max={todayId} onChange={(event) => setCustomTo(event.target.value)} />
              </div>
            </div>
          ) : null}
          <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground sm:col-span-2 xl:col-span-1 xl:justify-self-auto" onClick={() => { setRepFilter("all"); setProviderFilter("all"); setRangeMode("week"); setWeekStartFilter(""); setMonthFilter(currentMonth); setYearFilter(currentYear); setCustomFrom(todayId); setCustomTo(todayId); }}>
            Reset filters
          </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        <button type="button" onClick={() => setActiveDrilldown("total")} className="contents text-left">
          <StatTile label="Total sales" value={formatNumber(data.totalSales)} detail={`vs ${formatNumber(data.comparison.previous)} previous week - click to open the list`} icon={TrendingUp} accentColor={accent.blue} delta={formatDelta(comparisonDelta)} deltaPositive={comparisonDelta >= 0} />
        </button>
        <StatTile label="Goal progress" value={formatPercent(goalProgress)} detail={`${formatNumber(data.totalSales)} of ${formatNumber(rangeSalesGoal)} range goal`} icon={Gauge} accentColor={accent.violet} progress={goalProgress} />
        <StatTile label="Knocks" value={formatNumber(data.totalKnocks)} detail={`${formatCompact(data.activeReps ? data.totalKnocks / data.activeReps : 0)} per active rep`} icon={Target} accentColor={accent.magenta} href={canUseOperationalActions ? "/knocks" : undefined} />
        <StatTile label="Conversion" value={formatPercent(conversion)} detail="Sales divided by knocks" icon={BarChart3} accentColor={accent.teal} />
        <button type="button" onClick={() => setActiveDrilldown("installed")} className="contents text-left">
          <StatTile label="Active installs" value={formatNumber(statusTotals.installed)} detail={`Status range: ${statusRangeLabel} - click to open the list`} icon={CheckCircle2} accentColor={accent.green} />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("pending")} className="contents text-left">
          <StatTile label="Pending" value={formatNumber(statusTotals.pending)} detail={`${formatNumber(statusTotals.pastDue)} past due within pending - click to open the list`} icon={Clock3} accentColor={accent.amber} />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("pastDue")} className="contents text-left">
          <StatTile label="Past due" value={formatNumber(statusTotals.pastDue)} detail="Pending installs past the report date - click to open the list" icon={TriangleAlert} accentColor={accent.red} valueColor={statusTotals.pastDue > 0 ? "var(--destructive)" : undefined} />
        </button>
        <StatTile label="Active reps" value={formatNumber(data.activeReps)} detail="Roster members with active status" icon={Users} accentColor={accent.sky} href={canUseOperationalActions ? "/roster" : undefined} />
      </section>

      {canSeeKnockHours && (providerFilter === "all" || providerFilter === "companyb") ? (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
          <StatTile label="Total hours worked" value={formatHoursAsDuration(totalHoursWorked)} detail="Summed first-to-last knock span, current scope" icon={Timer} accentColor={accent.violet} />
          <StatTile label="Avg sales per hour" value={avgSalesPerHour.toFixed(1)} detail="Total sales divided by total hours worked" icon={Zap} accentColor={accent.teal} />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.9fr]">
        <Panel title="Order status health" description={`Order volume by status for ${statusRangeLabel}. Past due is the subset of pending installs past the report date.`} accentColor={accent.green}>
          {hasOrderBreakdown ? (
            <div style={{ height: Math.max(180, orderBreakdownData.length * 48 + 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderBreakdownData} layout="vertical" margin={{ left: 0, right: 44, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="name" width={82} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "var(--foreground)" }} />
                  <RechartsTooltip content={<ChartTooltip unit="orders" />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                    {orderBreakdownData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(value) => formatNumber(Number(value))} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No order status data" description="Status volume appears here after provider imports are processed." />}
        </Panel>

        <Panel title="Provider mix" description="Sales volume by provider for the selected range." accentColor={accent.magenta} bodyClassName="p-0">
          {providerBreakdown.length ? (
            <>
              <div className="relative h-[200px] p-4 sm:h-[240px] sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={providerBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="68%" outerRadius="96%" startAngle={90} endAngle={-270} paddingAngle={2} stroke="none">
                      {providerBreakdown.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    </Pie>
                    <RechartsTooltip content={<ChartTooltip unit="sales" />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className={microLabel}>Total</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">{formatNumber(providerTotal)}</p>
                </div>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {providerBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0" style={{ backgroundColor: item.fill }} aria-hidden />
                      <span className="truncate text-sm font-medium">{item.name}</span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-3">
                      <span className="text-sm font-semibold tabular-nums">{formatNumber(item.value)}</span>
                      <span className="w-10 text-right text-[13px] tabular-nums text-muted-foreground">{formatPercent(salesSharePercent(item.value, providerTotal))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-5">
              <EmptyState title="No provider data" description="Provider totals appear after sales imports are loaded." />
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Rep leaderboard" description="Top reps by sales for the selected range." meta={`${topReps.length} reps`} accentColor={accent.blue} bodyClassName="max-h-[480px] overflow-auto p-0">
          {topReps.length ? (
            <div className="divide-y divide-border">
              {topReps.map((rep, index) => (
                <div key={rep.repUid} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={cn("w-6 shrink-0 text-right text-sm font-semibold tabular-nums", index < 3 ? "text-primary" : "text-muted-foreground")}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">{rep.displayName}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatNumber(rep.sales)}
                        <span className="ml-2 text-[13px] font-normal text-muted-foreground">{formatPercent(rep.share)}</span>
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.max(2, (rep.sales / topRepSales) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No reps in scope" description="Sales will appear here after imports are matched to reps." />
            </div>
          )}
        </Panel>

        <Panel title="Goal pacing" description="Reps currently behind expected weekly pace." meta={`${data.goalPacing.length} reps`} accentColor={accent.amber} bodyClassName="p-0">
          {data.goalPacing.length ? (
            <div className="divide-y divide-border">
              {data.goalPacing.slice(0, 6).map((rep) => {
                const percent = rep.goal ? Math.min(100, Math.round((rep.sales / rep.goal) * 100)) : 0;
                const barColor = percent >= 100 ? "var(--success)" : percent >= 70 ? accent.amber : "var(--destructive)";
                return (
                  <div key={rep.repUid} className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="min-w-0 truncate text-sm font-medium">{rep.displayName}</p>
                      <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatNumber(rep.sales)} / {formatNumber(rep.goal)} · <span className="font-semibold text-foreground">{formatPercent(percent)}</span>
                      </p>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full bg-muted">
                      <div className="h-full" style={{ width: `${percent}%`, backgroundColor: barColor }} />
                    </div>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {rep.remaining > 0 ? `${formatNumber(rep.remaining)} remaining · ${formatCompact(rep.neededPerDay)} needed per day` : "Goal completed"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No goal pacing issues" description="Active reps are not behind expected weekly goal pace." />
            </div>
          )}
        </Panel>
      </section>

      {canSeeKnockHours && (providerFilter === "all" || providerFilter === "companyb") ? (
        <Panel
          title="Knock hours worked"
          description={`Each rep's first-to-last knock span per day, summed for ${weekLabel}. Based on Company B knock activity.`}
          meta={`${knockHoursRows.length} reps`}
          accentColor={accent.violet}
          bodyClassName="max-h-[560px] overflow-y-auto"
        >
          {knockHoursLoading ? (
            <Skeleton className="h-[280px] rounded-none" />
          ) : knockHoursError ? (
            <EmptyState title="Hours unavailable" description={knockHoursError} />
          ) : knockHoursRows.length ? (
            <div style={{ height: Math.max(160, knockHoursRows.length * 44 + 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={knockHoursRows} layout="vertical" margin={{ left: 0, right: 64, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value) => formatHoursAsDuration(Number(value))} />
                  <YAxis type="category" dataKey="displayName" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "var(--foreground)" }} />
                  <RechartsTooltip content={<KnockHoursTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="hoursWorked" barSize={20} radius={[0, 4, 4, 0]} fill={accent.violet}>
                    <LabelList dataKey="hoursWorked" position="right" formatter={(value) => formatHoursAsDuration(Number(value))} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No knock hours yet" description="Hours appear after Company B knock exports are processed for this range." />
          )}
        </Panel>
      ) : null}

      {activeDrilldown ? (
        <OrdersDrilldownSheet
          open={Boolean(activeDrilldown)}
          onOpenChange={(open) => { if (!open) setActiveDrilldown(null); }}
          title={drilldownConfig[activeDrilldown].title}
          description={drilldownConfig[activeDrilldown].description}
          emptyTitle={drilldownConfig[activeDrilldown].emptyTitle}
          emptyDescription={drilldownConfig[activeDrilldown].emptyDescription}
          rows={drilldownConfig[activeDrilldown].rows}
          onExport={() => void exportOrdersWorkbook(drilldownConfig[activeDrilldown].rows, drilldownConfig[activeDrilldown].exportPrefix)}
        />
      ) : null}
    </motion.div>
  );
}
