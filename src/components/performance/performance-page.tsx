"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { format, parseISO } from "date-fns";
import { BarChart3, CalendarRange, CheckCircle2, ChevronDown, Clock3, Download, Filter, Gauge, Search, Timer, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { normalizePermissions } from "@/src/lib/access";
import { endOfWeek, startOfWeek, toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { formatDate } from "@/src/lib/formatters/date";
import { formatHoursAsDuration } from "@/src/lib/formatters/duration";
import { formatNumber, formatPercent } from "@/src/lib/formatters/number";
import { calculateCancellationRate, calculateInstallRate, etaDateId, etaValue, outcomeBadgeVariant, unitsFor, type PerformanceOrder } from "@/src/lib/performance/performance-utils";
import { exportOrdersWorkbook } from "@/src/lib/reports/sales-export";
import { OrdersDrilldownSheet } from "@/src/components/performance/orders-drilldown-sheet";
import { saleOutcomeLabel, sanitizeOrderId } from "@/src/lib/sales/outcomes";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RangeMode = "lastWeek" | "wtd" | "mtd" | "last30" | "custom";
type TeamRow = {
  name: string;
  sales: number;
  knocks: number;
  reps: number;
  conversion: number;
};

type PerformanceResponse = {
  range: { start: string; end: string; mode: string };
  totals: {
    sales: number;
    knocks: number;
    companyAKnocks: number;
    companyBKnocks: number;
    conversion: number;
    installed: number;
    pending: number;
    pastDue: number;
    preorder: number;
    canceled: number;
    churned: number;
    unknown: number;
    activeReps: number;
    orderCount: number;
  };
  trend: Array<{ dateId: string; sales: number; knocks: number }>;
  reps: Array<{
    repUid: string | null;
    displayName: string;
    managerName: string;
    locationName: string;
    vendorType: string;
    sales: number;
    knocks: number;
    companyAKnocks: number;
    companyBKnocks: number;
    installed: number;
    pending: number;
    pastDue: number;
    preorder: number;
    canceled: number;
    churned: number;
    unknown: number;
    total: number;
    goal: number;
    conversion: number;
    matchStatus: "matched" | "unmatched";
  }>;
  teams: {
    managers: TeamRow[];
    locations: TeamRow[];
  };
  orders: PerformanceOrder[];
  filters: {
    managers: string[];
    locations: string[];
    providers: string[];
    reps: { repUid: string; displayName: string }[];
  };
};

type PerformanceRep = PerformanceResponse["reps"][number];

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

type OrderFilterState = {
  search: string;
  manager: string;
  location: string;
  rep: string;
  provider: string;
  outcome: string;
  status: string;
};

type ReassignRepOption = {
  repUid: string;
  displayName: string;
  managerName: string;
  locationName: string;
  vendorType: string;
};

const outcomeOptions = [
  { label: "All outcomes", value: "all" },
  { label: "Installed", value: "installed" },
  { label: "Pending", value: "pending" },
  { label: "Past due", value: "past_due" },
  { label: "Preorder", value: "preorder" },
  { label: "Canceled", value: "canceled" },
  { label: "Churned", value: "churned" },
  { label: "Unknown", value: "unknown" },
];

const vendorOptions = [
  { label: "All vendor types", value: "all" },
  { label: "Organic", value: "organic" },
  { label: "Subvendors", value: "subVendor" },
  { label: "Unassigned", value: "unassigned" },
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function statusLabel(order: PerformanceOrder) {
  if (order.pastDue) return "Past due";
  const value = text(order.status);
  if (!value || normalize(value) === "unknown") {
    if (order.outcome === "preorder") return "Preorder";
    return "Unknown";
  }
  return value;
}

function etaLabel(order: PerformanceOrder) {
  const value = etaValue(order);
  return value ? `ETA: ${value}` : "ETA: -";
}

function matchesSelected(value: unknown, selected: string) {
  return selected === "all" || normalize(value) === normalize(selected);
}

function matchesRepSelection(order: PerformanceOrder, selected: string) {
  if (selected === "all") return true;
  return normalize(order.repUid ?? "") === normalize(selected) || normalize(order.repName) === normalize(selected);
}

function matchesRepSelectionValue(repUid: string | null | undefined, displayName: string, selected: string) {
  if (selected === "all") return true;
  return normalize(repUid ?? "") === normalize(selected) || normalize(displayName) === normalize(selected);
}

function matchesVendorSelection(value: unknown, selected: string) {
  return selected === "all" || normalize(value) === normalize(selected);
}

function vendorTypeLabel(value: unknown) {
  const normalized = normalize(value);
  if (normalized === "organic") return "Organic";
  if (normalized === "subvendor") return "Subvendors";
  if (normalized === "unassigned") return "Unassigned";
  return text(value) || "Unassigned";
}

function labelForRepFilter(reps: PerformanceResponse["filters"]["reps"], selected: string) {
  if (selected === "all") return "All reps";
  return reps.find((item) => normalize(item.repUid) === normalize(selected) || normalize(item.displayName) === normalize(selected))?.displayName ?? selected;
}

function buildDailyTrend(orders: PerformanceOrder[], start: string, end: string) {
  const map = new Map<string, number>();
  for (const order of orders) {
    map.set(order.orderDateId, (map.get(order.orderDateId) ?? 0) + unitsFor(order));
  }

  const rows: Array<{ dateId: string; sales: number }> = [];
  const cursor = parseISO(`${start}T12:00:00`);
  const last = parseISO(`${end}T12:00:00`);
  while (cursor <= last) {
    const dateId = toDateId(cursor);
    rows.push({ dateId, sales: map.get(dateId) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function countOutcomes(orders: PerformanceOrder[]) {
  const totals = { installed: 0, pending: 0, past_due: 0, preorder: 0, canceled: 0, churned: 0, unknown: 0 };
  for (const order of orders) {
    const units = unitsFor(order);
    const outcome = order.outcome ?? "unknown";
    if (outcome === "installed") totals.installed += units;
    else if (outcome === "pending") totals.pending += units;
    else if (outcome === "past_due") { totals.pending += units; totals.past_due += units; }
    else if (outcome === "preorder") totals.preorder += units;
    else if (outcome === "canceled") totals.canceled += units;
    else if (outcome === "churned") totals.churned += units;
    else totals.unknown += units;
  }
  return totals;
}

function groupTeamRows(rows: Array<{ managerName: string; locationName: string; repUid: string | null; displayName: string; sales: number; knocks: number }>, key: "managerName" | "locationName"): TeamRow[] {
  const map = new Map<string, { name: string; sales: number; knocks: number; reps: Set<string> }>();
  for (const row of rows) {
    const name = text(row[key]) || (key === "managerName" ? "No manager" : "Not assigned");
    const current = map.get(name) ?? { name, sales: 0, knocks: 0, reps: new Set<string>() };
    current.sales += Number(row.sales || 0);
    current.knocks += Number(row.knocks || 0);
    current.reps.add(row.repUid ? row.repUid : row.displayName);
    map.set(name, current);
  }

  return [...map.values()]
    .map((row) => ({
      name: row.name,
      sales: row.sales,
      knocks: row.knocks,
      reps: row.reps.size,
      conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0,
    }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}

function rangeLabel(mode: RangeMode) {
  if (mode === "lastWeek") return "Last week";
  if (mode === "wtd") return "WTD";
  if (mode === "mtd") return "MTD";
  if (mode === "last30") return "Last 30 days";
  return "Custom range";
}

const PROVIDER_COLORS: Record<string, string> = {
  "Company A": "#2563eb",
  "Company B": "#d946ef",
  "Company C": "#f97316",
  Manual: "#94a3b8",
};

function salesSharePercent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function providerColor(name: string) {
  return PROVIDER_COLORS[name] ?? "#94a3b8";
}

function orderProviderKey(order: PerformanceOrder) {
  const source = normalize(order.providerKey ?? order.provider);
  if (source === "companya" || source === "company a") return "companya";
  if (source === "companyb" || source === "company b") return "companyb";
  if (source === "manual") return "manual";
  return source;
}

function orderDocumentId(order: PerformanceOrder) {
  const provider = orderProviderKey(order);
  const prefix = `${provider}:`;
  if (order.id.startsWith(prefix)) return order.id.slice(prefix.length);
  return order.orderUid;
}

function OrderBreakdownLabel({
  x,
  y,
  width,
  value,
  payload,
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  payload?: { share?: number };
}) {
  const count = Number(value ?? 0);
  if (!count || x == null || y == null || width == null) return null;
  const centerX = x + width / 2;
  const share = payload?.share ?? 0;

  return (
    <g>
      <text x={centerX} y={y - 8} textAnchor="middle" fill="var(--foreground)" className="text-[11px] font-medium">
        <tspan x={centerX} dy="0">
          {formatNumber(count)}
        </tspan>
        <tspan x={centerX} dy="1.1em">
          {formatPercent(share, 0)}
        </tspan>
      </text>
    </g>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="space-y-2">
            <div className="h-6 w-40 rounded bg-muted" />
            <div className="h-4 w-72 rounded bg-muted/80" />
            <div className="h-4 w-64 rounded bg-muted/70" />
          </div>
          <div className="grid gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 rounded-xl border border-border/70 bg-muted/40" />
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl border border-border/70 bg-muted/30" />
            ))}
          </div>
          <div className="h-[320px] rounded-2xl border border-border/70 bg-muted/30" />
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

function TeamSummaryCard({
  title,
  description,
  rows,
  totalSales,
}: {
  title: string;
  description: string;
  rows: TeamRow[];
  totalSales: number;
}) {
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge variant="outline">{rows.length} groups</Badge>
      </CardHeader>
      <CardContent className="max-h-[460px] space-y-3 overflow-auto">
        {rows.length ? (
          rows.map((row) => {
            const share = salesSharePercent(row.sales, totalSales);
            return (
              <div key={row.name} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{row.reps} reps</p>
                    <p className="mt-1 font-semibold">{row.name}</p>
                  </div>
                  <Badge variant={share >= 50 ? "success" : share >= 20 ? "info" : "outline"}>{formatPercent(share, 0)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Sales</p>
                    <p className="mt-1 font-medium">{formatNumber(row.sales)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Knocks</p>
                    <p className="mt-1 font-medium">{formatNumber(row.knocks)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reps</p>
                    <p className="mt-1 font-medium">{formatNumber(row.reps)}</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState title="No team data" description="Adjust the current scope filters to surface team performance." />
        )}
      </CardContent>
    </Card>
  );
}

function ProviderGaugeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: { name?: string; value?: number };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = String(row?.name ?? row?.payload?.name ?? "Provider");
  const value = Number(row?.value ?? row?.payload?.value ?? 0);

  return (
    <div className="rounded-2xl border border-border/70 bg-popover/95 px-4 py-3 text-popover-foreground shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Provider</p>
      <p className="mt-1 text-sm font-medium">{name}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color: providerColor(name) }}>
        {formatNumber(value)} sales
      </p>
    </div>
  );
}

export function PerformancePage() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const [range, setRange] = useQueryState("period", parseAsString.withDefault("lastWeek"));
  const [start, setStart] = useQueryState("start", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [end, setEnd] = useQueryState("end", parseAsString.withDefault(toDateId(endOfWeek(new Date()))));
  const [managerFilter, setManagerFilter] = useQueryState("manager", parseAsString.withDefault("all"));
  const [locationFilter, setLocationFilter] = useQueryState("location", parseAsString.withDefault("all"));
  const [repFilter, setRepFilter] = useQueryState("rep", parseAsString.withDefault("all"));
  const [providerFilter, setProviderFilter] = useQueryState("provider", parseAsString.withDefault("all"));
  const [vendorFilter, setVendorFilter] = useQueryState("vendor", parseAsString.withDefault("all"));

  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [activeDrilldown, setActiveDrilldown] = useState<"total" | "installed" | "pending" | "canceled" | "churned" | "pastDue" | null>(null);
  const [knockHours, setKnockHours] = useState<KnockHoursRow[]>([]);
  const [knockHoursForbidden, setKnockHoursForbidden] = useState(false);
  const [reassignOrder, setReassignOrder] = useState<PerformanceOrder | null>(null);
  const [reassignRepUid, setReassignRepUid] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [orderFilters, setOrderFilters] = useState<OrderFilterState>({
    search: "",
    manager: "all",
    location: "all",
    rep: "all",
    provider: "all",
    outcome: "all",
    status: "all",
  });

  const mode = (range as RangeMode) || "lastWeek";
  const canReassignOrders = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canReassignSales);
  const canSeeKnockHours = Boolean(
    profile && (profile.role === "superAdmin" || normalizePermissions(profile.permissions ?? {}).canViewKnockHours),
  ) && !knockHoursForbidden;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ range: mode });
      if (mode === "custom") {
        params.set("from", start);
        params.set("to", end);
      }

      const request = `/api/performance?${params.toString()}`;
      setLoading(true);

      void authedJson<PerformanceResponse>(request)
        .then((value) => {
          if (!active) return;
          setData(value);
          setError(null);
          if (process.env.NODE_ENV !== "production") {
            console.log("[performance] loaded", {
              range: value.range,
              totals: value.totals,
              reps: value.reps.length,
              orders: value.orders.length,
            });
          }
        })
        .catch((cause) => {
          if (!active) return;
          const message = cause instanceof Error ? cause.message : "Unable to load performance data.";
          setError(message);
          toast.error(message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [end, mode, start]);

  const currentRange = data?.range ?? { start, end, mode };
  const currentRangeLabel = rangeLabel(mode);
  const currentRangeDates = data ? weekRangeLabel(data.range.start, data.range.end) : weekRangeLabel(start, end);

  useEffect(() => {
    if (!canSeeKnockHours) return;
    let active = true;
    const params = new URLSearchParams({ period: "custom", anchor: currentRange.start, end: currentRange.end, lcp: "all" });
    void authedJson<KnockHoursResponse>(`/api/performance/knock-hours?${params.toString()}`)
      .then((value) => {
        if (!active) return;
        setKnockHours(value.rows ?? []);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "";
        if (/forbidden/i.test(message)) setKnockHoursForbidden(true);
      });
    return () => {
      active = false;
    };
  }, [canSeeKnockHours, currentRange.end, currentRange.start]);
  const scopedOrders = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((order) => {
      if (!matchesSelected(order.managerName, managerFilter)) return false;
      if (!matchesSelected(order.locationName, locationFilter)) return false;
      if (!matchesRepSelection(order, repFilter)) return false;
      if (!matchesSelected(order.provider, providerFilter)) return false;
      if (!matchesVendorSelection(order.vendorType ?? "unassigned", vendorFilter)) return false;
      return true;
    });
  }, [data, locationFilter, managerFilter, providerFilter, repFilter, vendorFilter]);

  const scopedReps = useMemo(() => {
    if (!data) return [];
    const rows = new Map<string, PerformanceRep>();

    for (const rep of data.reps) {
      if (!matchesSelected(rep.managerName, managerFilter)) continue;
      if (!matchesSelected(rep.locationName, locationFilter)) continue;
      if (!matchesVendorSelection(rep.vendorType, vendorFilter)) continue;
      if (!matchesRepSelectionValue(rep.repUid, rep.displayName, repFilter)) continue;
      const key = normalize(rep.repUid ?? rep.displayName);
      rows.set(key, {
        ...rep,
        sales: 0,
        installed: 0,
        pending: 0,
        pastDue: 0,
        preorder: 0,
        canceled: 0,
        churned: 0,
        unknown: 0,
        total: 0,
      });
    }

    for (const order of scopedOrders) {
      const key = normalize(order.repUid ?? order.repName);
      const row = rows.get(key);
      if (!row) continue;
      const units = unitsFor(order);
      row.sales += units;
      row.total += units;
      if (order.outcome === "installed") row.installed += units;
      else if (order.outcome === "pending") row.pending += units;
      else if (order.outcome === "past_due") { row.pending += units; row.pastDue += units; }
      else if (order.outcome === "preorder") row.preorder += units;
      else if (order.outcome === "canceled") row.canceled += units;
      else if (order.outcome === "churned") row.churned += units;
      else row.unknown += units;
    }

    return [...rows.values()]
      .map((row) => ({
        ...row,
        total: row.sales + row.knocks,
        conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0,
      }))
      .sort((a, b) => b.sales - a.sales || b.knocks - a.knocks || a.displayName.localeCompare(b.displayName));
  }, [data, locationFilter, managerFilter, repFilter, scopedOrders, vendorFilter]);

  const activeScopeReps = useMemo(() => scopedReps.filter((rep) => rep.sales > 0 || rep.knocks > 0), [scopedReps]);

  const scopedTotals = useMemo(() => {
    const sales = scopedOrders.reduce((sum, order) => sum + unitsFor(order), 0);
    const outcomeTotals = countOutcomes(scopedOrders);
    const knocks = activeScopeReps.reduce((sum, rep) => sum + Number(rep.knocks || 0), 0);
    const companyAKnocks = activeScopeReps.reduce((sum, rep) => sum + Number(rep.companyAKnocks || 0), 0);
    const companyBKnocks = activeScopeReps.reduce((sum, rep) => sum + Number(rep.companyBKnocks || 0), 0);
    return {
      sales,
      knocks,
      companyAKnocks,
      companyBKnocks,
      conversion: knocks ? Math.round((sales / knocks) * 100) : 0,
      installed: outcomeTotals.installed,
      pending: outcomeTotals.pending,
      pastDue: outcomeTotals.past_due,
      preorder: outcomeTotals.preorder,
      canceled: outcomeTotals.canceled,
      churned: outcomeTotals.churned,
      unknown: outcomeTotals.unknown,
      activeReps: activeScopeReps.length,
      orderCount: scopedOrders.length,
    };
  }, [activeScopeReps, scopedOrders]);

  const trendData = useMemo(() => buildDailyTrend(scopedOrders, currentRange.start, currentRange.end), [currentRange.end, currentRange.start, scopedOrders]);

  const orderBreakdownData = useMemo(
    () => [
      { name: "Installed", value: scopedTotals.installed, fill: "var(--success)", share: salesSharePercent(scopedTotals.installed, scopedTotals.sales) },
      { name: "Pending", value: scopedTotals.pending, fill: "var(--primary)", share: salesSharePercent(scopedTotals.pending, scopedTotals.sales) },
      { name: "Past due", value: scopedTotals.pastDue, fill: "var(--warning)", share: salesSharePercent(scopedTotals.pastDue, scopedTotals.sales) },
      { name: "Preorder", value: scopedTotals.preorder, fill: "var(--info)", share: salesSharePercent(scopedTotals.preorder, scopedTotals.sales) },
      { name: "Canceled", value: scopedTotals.canceled, fill: "var(--danger)", share: salesSharePercent(scopedTotals.canceled, scopedTotals.sales) },
      { name: "Churned", value: scopedTotals.churned, fill: "var(--secondary)", share: salesSharePercent(scopedTotals.churned, scopedTotals.sales) },
    ],
    [scopedTotals.canceled, scopedTotals.churned, scopedTotals.installed, scopedTotals.pending, scopedTotals.pastDue, scopedTotals.preorder, scopedTotals.sales],
  );

  const providerBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of scopedOrders) {
      const providerName = order.provider || "Manual";
      totals.set(providerName, (totals.get(providerName) ?? 0) + unitsFor(order));
    }
    return [...totals.entries()]
      .map(([name, value]) => ({ name, value, fill: providerColor(name) }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [scopedOrders]);

  const leaderboardRows = useMemo(
    () => [...activeScopeReps].sort((a, b) => b.sales - a.sales || b.knocks - a.knocks || a.displayName.localeCompare(b.displayName)),
    [activeScopeReps],
  );

  const managerRows = useMemo(() => groupTeamRows(activeScopeReps, "managerName"), [activeScopeReps]);
  const locationRows = useMemo(() => groupTeamRows(activeScopeReps, "locationName"), [activeScopeReps]);

  const pastDueRows = useMemo(
    () =>
      scopedOrders
        .filter((order) => order.pastDue || order.outcome === "past_due")
        .sort((a, b) => (etaDateId(a) || a.orderDateId).localeCompare(etaDateId(b) || b.orderDateId) || a.orderDateId.localeCompare(b.orderDateId)),
    [scopedOrders],
  );


  const installedRows = useMemo(() => scopedOrders.filter((order) => order.outcome === "installed"), [scopedOrders]);
  const pendingRows = useMemo(() => scopedOrders.filter((order) => order.outcome === "pending" || order.outcome === "past_due"), [scopedOrders]);
  const canceledRows = useMemo(() => scopedOrders.filter((order) => order.outcome === "canceled"), [scopedOrders]);
  const churnedRows = useMemo(() => scopedOrders.filter((order) => order.outcome === "churned"), [scopedOrders]);

  const totalHoursWorked = useMemo(() => knockHours.reduce((sum, row) => sum + Number(row.hoursWorked || 0), 0), [knockHours]);
  const avgSalesPerHour = totalHoursWorked > 0 ? scopedTotals.sales / totalHoursWorked : 0;

  const drilldownConfig: Record<Exclude<typeof activeDrilldown, null>, { title: string; description: string; rows: PerformanceOrder[]; emptyTitle: string; emptyDescription: string; exportPrefix: string; reassign?: boolean }> = {
    total: { title: "Total sales", description: "All sales in the current scope", rows: scopedOrders, emptyTitle: "No sales", emptyDescription: "No sales orders match the current scope.", exportPrefix: "total-sales" },
    installed: { title: "Active installs", description: "Installed orders in the current scope", rows: installedRows, emptyTitle: "No active installs", emptyDescription: "No installed orders match the current scope.", exportPrefix: "active-installs" },
    pending: { title: "Pending", description: "Pending installs, including past due", rows: pendingRows, emptyTitle: "No pending installs", emptyDescription: "No pending orders match the current scope.", exportPrefix: "pending-installs" },
    canceled: { title: "Canceled", description: "Canceled orders in the current scope", rows: canceledRows, emptyTitle: "No canceled orders", emptyDescription: "No canceled orders match the current scope.", exportPrefix: "canceled-orders" },
    churned: { title: "Churned", description: "Churned orders in the current scope", rows: churnedRows, emptyTitle: "No churned orders", emptyDescription: "No churned orders match the current scope.", exportPrefix: "churned-orders" },
    pastDue: { title: "Past due installs", description: "Pending installs past the ETA", rows: pastDueRows, emptyTitle: "No past due installs", emptyDescription: "The current scope has no installs past their estimated install date.", exportPrefix: "past-due-installs", reassign: true },
  };
  const displayOrders = useMemo(() => {
    const term = orderFilters.search.trim().toLowerCase();
    return scopedOrders.filter((order) => {
      const status = statusLabel(order);
      const haystack = [
        order.orderId,
        order.customer,
        order.repName,
        order.managerName,
        order.locationName,
        order.provider,
        order.outcome,
        status,
      ]
        .join(" ")
        .toLowerCase();

      if (term && !haystack.includes(term)) return false;
      if (!matchesSelected(order.managerName, orderFilters.manager)) return false;
      if (!matchesSelected(order.locationName, orderFilters.location)) return false;
      if (!matchesRepSelection(order, orderFilters.rep)) return false;
      if (!matchesSelected(order.provider, orderFilters.provider)) return false;
      if (!matchesSelected(order.outcome ?? "unknown", orderFilters.outcome)) return false;
      if (orderFilters.status !== "all") {
        const selected = normalize(orderFilters.status);
        const current = normalize(status);
        if (selected === "past due") {
          if (!order.pastDue) return false;
        } else if (current !== selected) {
          return false;
        }
      }
      return true;
    });
  }, [orderFilters.location, orderFilters.manager, orderFilters.outcome, orderFilters.provider, orderFilters.rep, orderFilters.search, orderFilters.status, scopedOrders]);

  const orderStatusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const order of scopedOrders) {
      statuses.add(statusLabel(order));
    }
    return [...statuses].sort((a, b) => a.localeCompare(b));
  }, [scopedOrders]);

  const reassignRepOptions = useMemo<ReassignRepOption[]>(() => {
    if (!data) return [];
    return data.reps
      .filter((rep): rep is PerformanceRep & { repUid: string } => Boolean(rep.repUid) && rep.matchStatus === "matched")
      .map((rep) => ({
        repUid: rep.repUid,
        displayName: rep.displayName,
        managerName: rep.managerName,
        locationName: rep.locationName,
        vendorType: rep.vendorType,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data]);

  const selectedRepLabel = labelForRepFilter(data?.filters.reps ?? [], repFilter);
  const selectedProviderLabel = providerFilter === "all" ? "All providers" : providerFilter;
  const selectedVendorLabel = vendorFilter === "all" ? "All vendor types" : vendorTypeLabel(vendorFilter);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <EmptyState title="Performance unavailable" description={error} />;
  if (!data) return null;

  const topFiltersLabel =
    [
      managerFilter === "all" ? "All managers" : managerFilter,
      locationFilter === "all" ? "All locations" : locationFilter,
      selectedRepLabel,
      selectedProviderLabel,
      selectedVendorLabel,
    ].join(" / ");

  const installRate = calculateInstallRate(scopedTotals.sales, scopedTotals.installed);
  const cancellationRate = calculateCancellationRate(scopedTotals.sales, scopedTotals.canceled);

  const exportOrders = async (orders: PerformanceOrder[], prefix: string) => {
    await exportOrdersWorkbook(orders, prefix);
    toast.message("Downloaded the report workbook.");
  };

  function openReassign(order: PerformanceOrder) {
    setReassignOrder(order);
    setReassignRepUid(order.repUid ?? "");
  }

  async function saveReassignment() {
    if (!reassignOrder || !reassignRepUid) return;
    const provider = orderProviderKey(reassignOrder);
    const documentId = orderDocumentId(reassignOrder);
    if (!["companya", "companyb", "manual"].includes(provider) || !documentId) {
      toast.error("This order cannot be reassigned from the performance table.");
      return;
    }
    setReassigning(true);
    try {
      const response = await authedFetch(`/api/performance/orders/${encodeURIComponent(provider)}/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ repUid: reassignRepUid }),
      });
      const result = await response.json() as { rep?: ReassignRepOption; error?: unknown };
      if (!response.ok || !result.rep) throw new Error(String(result.error || "Unable to reassign sale."));
      const rep = result.rep;
      setData((current) => current ? {
        ...current,
        orders: current.orders.map((order) => order.id === reassignOrder.id ? {
          ...order,
          matchedRepUid: rep.repUid,
          repUid: rep.repUid,
          repName: rep.displayName,
          managerName: rep.managerName || "",
          locationName: rep.locationName || "",
          vendorType: rep.vendorType === "organic" || rep.vendorType === "subVendor" ? rep.vendorType : "unassigned",
        } : order),
      } : current);
      setReassignOrder(null);
      setReassignRepUid("");
      toast.success(`Sale reassigned to ${rep.displayName}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to reassign sale.");
    } finally {
      setReassigning(false);
    }
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-3xl">Performance</CardTitle>
                <Badge variant={loading ? "outline" : "success"}>{loading ? "Refreshing" : "Live"}</Badge>
              </div>
              <CardDescription className="mt-2">Sales outcomes, install tracking, provider mix, and rep performance.</CardDescription>
              <p className="mt-2 text-sm text-muted-foreground">Live demo data across sales, knocks, and reps.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/imports/unmatched">Review unmatched</Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(value) => void setRange(value)}>
            <TabsList className="flex w-full max-w-2xl gap-1 overflow-x-auto sm:grid sm:grid-cols-5 sm:overflow-visible">
              <TabsTrigger value="lastWeek" className="shrink-0">Last week</TabsTrigger>
              <TabsTrigger value="wtd" className="shrink-0">WTD</TabsTrigger>
              <TabsTrigger value="mtd" className="shrink-0">MTD</TabsTrigger>
              <TabsTrigger value="last30" className="shrink-0">Last 30 days</TabsTrigger>
              <TabsTrigger value="custom" className="shrink-0">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1.5fr]">
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {data.filters.managers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {data.filters.locations.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Rep" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {data.filters.reps.map((item) => (
                  <SelectItem key={item.repUid} value={item.repUid}>
                    {item.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {data.filters.providers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Vendor type" />
              </SelectTrigger>
              <SelectContent>
                {vendorOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium">{currentRangeLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{currentRangeDates}</p>
              <p className="mt-2 text-xs text-muted-foreground">{topFiltersLabel}</p>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Input type="date" value={data.range.start} onChange={(event) => setStart(event.target.value)} disabled={mode !== "custom"} />
            <Input type="date" value={data.range.end} onChange={(event) => setEnd(event.target.value)} disabled={mode !== "custom"} />
          </div>

          {error ? (
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Refresh failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-4">
        <button type="button" onClick={() => setActiveDrilldown("total")} className="contents text-left">
          <StatTile label="Total sales" value={formatNumber(scopedTotals.sales)} detail="Units sold in the current scope - click to open the list" icon={TrendingUp} accentColor="var(--primary)" />
        </button>
        <StatTile
          label="Total knocks"
          value={formatNumber(scopedTotals.knocks)}
          detail={`Company A ${formatNumber(scopedTotals.companyAKnocks)} / Company B ${formatNumber(scopedTotals.companyBKnocks)}`}
          icon={BarChart3}
          accentColor="var(--info)"
        />
        <StatTile label="Conversion" value={`${scopedTotals.conversion}%`} detail="Sales divided by knocks" icon={TrendingUp} accentColor="#1baf7a" />
        <button type="button" onClick={() => setActiveDrilldown("installed")} className="contents text-left">
          <StatTile label="Installed" value={formatNumber(scopedTotals.installed)} detail={`Install rate ${installRate}% - click to open the list`} icon={CheckCircle2} accentColor="var(--success)" />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("pending")} className="contents text-left">
          <StatTile label="Pending" value={formatNumber(scopedTotals.pending)} detail="Needs follow-up - click to open the list" icon={Clock3} accentColor="#c98500" />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("pastDue")} className="contents text-left">
          <StatTile
            label="Past due"
            value={formatNumber(scopedTotals.pastDue)}
            detail="Pending installs past the ETA - click to open the list"
            icon={CalendarRange}
            accentColor="var(--warning)"
          />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("canceled")} className="contents text-left">
          <StatTile label="Canceled" value={formatNumber(scopedTotals.canceled)} detail={`Cancellation rate ${cancellationRate}% - click to open the list`} icon={TriangleAlert} accentColor="var(--destructive)" />
        </button>
        <button type="button" onClick={() => setActiveDrilldown("churned")} className="contents text-left">
          <StatTile label="Churned" value={formatNumber(scopedTotals.churned)} detail="Separated from cancellations - click to open the list" icon={TriangleAlert} accentColor="#b76e8f" />
        </button>
        <StatTile label="Active reps" value={formatNumber(scopedTotals.activeReps)} detail="Roster members in the current scope" icon={Users} accentColor="#8d7cd8" />
      </div>

      {canSeeKnockHours ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
          <StatTile label="Total hours worked" value={formatHoursAsDuration(totalHoursWorked)} detail="Summed first-to-last knock span, current scope" icon={Timer} accentColor="#8d7cd8" />
          <StatTile label="Avg sales per hour" value={avgSalesPerHour.toFixed(1)} detail="Total sales divided by total hours worked" icon={Gauge} accentColor="#1baf7a" />
        </div>
      ) : null}

      <Alert>
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Live data note</AlertTitle>
        <AlertDescription>Pending installs stay pending until the estimated install date passes. After that they are counted as past due and appear in the drilldown sheet.</AlertDescription>
      </Alert>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Sales trend</CardTitle>
            <CardDescription>Units sold by day for the current scope.</CardDescription>
          </CardHeader>
          <CardContent className="h-[420px]">
            {trendData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="dateId"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => format(new Date(`${value}T12:00:00`), "MMM d")}
                  />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.96)", border: "1px solid rgba(148, 163, 184, 0.35)", borderRadius: "16px", boxShadow: "0 20px 45px -24px rgba(15, 23, 42, 0.85)" }}
                    labelStyle={{ color: "rgba(241, 245, 249, 0.92)", fontWeight: 600 }}
                    itemStyle={{ color: "rgb(96, 165, 250)", fontWeight: 600 }}
                    labelFormatter={(value) => format(new Date(`${value as string}T12:00:00`), "MMM d, yyyy")}
                  />
                  <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No trend data" description="Try clearing filters or switching the date range." />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Rep leaderboard</CardTitle>
              <CardDescription>Top reps by sales volume and install quality.</CardDescription>
            </div>
            <Badge variant="outline">{leaderboardRows.length} reps</Badge>
          </CardHeader>
          <CardContent className="max-h-[580px] overflow-auto p-0">
            {leaderboardRows.length ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rep</TableHead>
                        <TableHead>Sales</TableHead>
                        <TableHead>Knocks</TableHead>
                        <TableHead>Installed</TableHead>
                        <TableHead>Pending</TableHead>
                        <TableHead>Past due</TableHead>
                        <TableHead>Sales share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboardRows.map((row) => (
                        <TableRow key={row.repUid ?? row.displayName}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{row.displayName}</p>
                                {row.matchStatus === "unmatched" ? <Badge variant="outline">Unmatched</Badge> : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {row.managerName || "No manager"} - {row.locationName || "Not assigned"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{formatNumber(row.sales)}</TableCell>
                          <TableCell>{formatNumber(row.knocks)}</TableCell>
                          <TableCell>{formatNumber(row.installed)}</TableCell>
                          <TableCell>{formatNumber(row.pending)}</TableCell>
                          <TableCell>{formatNumber(row.pastDue)}</TableCell>
                          <TableCell>{formatPercent(salesSharePercent(row.sales, scopedTotals.sales), 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {leaderboardRows.map((row, index) => {
                    const share = salesSharePercent(row.sales, scopedTotals.sales);
                    return (
                      <div key={row.repUid ?? row.displayName} className="flex items-center gap-3 px-4 py-3">
                        <span className={cn("w-5 shrink-0 text-right text-sm font-semibold tabular-nums", index < 3 ? "text-primary" : "text-muted-foreground")}>
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{row.displayName}</p>
                            {row.matchStatus === "unmatched" ? <Badge variant="outline">Unmatched</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatNumber(row.sales)} sales - {formatNumber(row.knocks)} knocks - {formatPercent(share, 0)} of total
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-6">
                <EmptyState title="No reps in scope" description="Change the scope filters to surface rep performance." />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.9fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Order breakdown</CardTitle>
            <CardDescription>Installed, pending, past due, preorder, canceled, and churned sales volume.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            {orderBreakdownData.some((item) => item.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderBreakdownData} margin={{ left: 0, right: 0, top: 28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.96)", border: "1px solid rgba(148, 163, 184, 0.35)", borderRadius: "16px", boxShadow: "0 20px 45px -24px rgba(15, 23, 42, 0.85)" }}
                    labelStyle={{ color: "rgba(241, 245, 249, 0.92)", fontWeight: 600 }}
                    itemStyle={{ color: "rgb(96, 165, 250)", fontWeight: 600 }}
                    formatter={(value) => [formatNumber(Number(value)), "Sales"]}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {orderBreakdownData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <LabelList position="top" content={<OrderBreakdownLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No order data" description="Adjust filters to surface order status volume." />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Provider gauge</CardTitle>
            <CardDescription>Sales volume by provider in the current scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providerBreakdown.length ? (
              <>
                <div className="relative h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={providerBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={82}
                        outerRadius={116}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={3}
                      >
                        {providerBreakdown.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={<ProviderGaugeTooltip />}
                        allowEscapeViewBox={{ x: true, y: true }}
                        wrapperStyle={{ zIndex: 40 }}
                        cursor={false}
                        isAnimationActive={false}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Sales</p>
                    <p className="text-4xl font-semibold tracking-tight">{formatNumber(scopedTotals.sales)}</p>
                    <p className="text-xs text-muted-foreground">{providerBreakdown.length} providers in view</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {providerBreakdown.map((item) => {
                    const share = salesSharePercent(item.value, scopedTotals.sales);
                    return (
                      <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(item.value)} sales</p>
                          </div>
                        </div>
                        <Badge variant="outline">{formatPercent(share, 0)}</Badge>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState title="No provider data" description="Adjust filters to surface provider sales." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TeamSummaryCard title="Manager performance" description="Sales and knocks by manager within the current scope." rows={managerRows} totalSales={scopedTotals.sales} />
        <TeamSummaryCard title="Location performance" description="Sales and knocks by location within the current scope." rows={locationRows} totalSales={scopedTotals.sales} />
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Performance orders</CardTitle>
            <CardDescription>Collapsible table with its own search and column filters.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportOrders(displayOrders, "performance-orders")}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOrdersOpen((value) => !value)}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", ordersOpen ? "rotate-180" : "rotate-0")} />
              {ordersOpen ? "Collapse" : "Expand"}
            </Button>
          </div>
        </CardHeader>

        {ordersOpen ? (
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <div className="relative 2xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search order, customer, rep, manager, location"
                  value={orderFilters.search}
                  onChange={(event) => setOrderFilters((current) => ({ ...current, search: event.target.value }))}
                />
              </div>

              <Select value={orderFilters.manager} onValueChange={(value) => setOrderFilters((current) => ({ ...current, manager: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All managers</SelectItem>
                  {data.filters.managers.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilters.location} onValueChange={(value) => setOrderFilters((current) => ({ ...current, location: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {data.filters.locations.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilters.rep} onValueChange={(value) => setOrderFilters((current) => ({ ...current, rep: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Rep" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {data.filters.reps.map((item) => (
                    <SelectItem key={item.repUid} value={item.repUid}>
                      {item.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilters.provider} onValueChange={(value) => setOrderFilters((current) => ({ ...current, provider: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Order provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {data.filters.providers.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilters.outcome} onValueChange={(value) => setOrderFilters((current) => ({ ...current, outcome: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Outcome" />
                </SelectTrigger>
                <SelectContent>
                  {outcomeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilters.status} onValueChange={(value) => setOrderFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {orderStatusOptions.includes("Past due") ? <SelectItem value="Past due">Past due</SelectItem> : null}
                  {orderStatusOptions.map((item) =>
                    item === "Past due" ? null : (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                {formatNumber(displayOrders.length)} rows shown - {formatNumber(displayOrders.reduce((sum, order) => sum + unitsFor(order), 0))} units
              </p>
              <Button variant="ghost" size="sm" onClick={() => setOrderFilters({ search: "", manager: "all", location: "all", rep: "all", provider: "all", outcome: "all", status: "all" })}>
                <Filter className="h-4 w-4" />
                Reset filters
              </Button>
            </div>

            {displayOrders.length ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sale date</TableHead>
                        <TableHead>Rep</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Customer / order</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Status</TableHead>
                        {canReassignOrders ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayOrders.map((order) => {
                        const units = unitsFor(order);
                        const outcomeValue = order.outcome ?? "unknown";
                        const status = statusLabel(order);
                        return (
                          <TableRow key={order.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{formatDate(order.orderDateId)}</span>
                                {units > 1 ? <Badge variant="outline">x{units}</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>{order.repName}</TableCell>
                            <TableCell>{order.managerName || "No manager"}</TableCell>
                            <TableCell>{order.locationName || "Not assigned"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{order.provider}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{order.customer}</p>
                                <p className="text-xs text-muted-foreground">{order.orderId}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={outcomeBadgeVariant(outcomeValue)}>{saleOutcomeLabel(outcomeValue)}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p>{status}</p>
                                <p className="text-xs text-muted-foreground">{etaLabel(order)}</p>
                              </div>
                            </TableCell>
                            {canReassignOrders ? (
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" onClick={() => openReassign(order)}>
                                  Reassign
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 lg:hidden">
                  {displayOrders.map((order) => {
                    const units = unitsFor(order);
                    const outcomeValue = order.outcome ?? "unknown";
                    const status = statusLabel(order);
                    return (
                      <Card key={order.id} className="border-border/70">
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{order.customer}</p>
                              <p className="text-sm text-muted-foreground">{order.orderId}</p>
                            </div>
                            <Badge variant={outcomeBadgeVariant(outcomeValue)}>{saleOutcomeLabel(outcomeValue)}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatDate(order.orderDateId)}</span>
                            {units > 1 ? <Badge variant="outline">x{units}</Badge> : null}
                            <span>{order.repName}</span>
                            <span>{order.provider}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {order.managerName || "No manager"} - {order.locationName || "Not assigned"}
                          </p>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{status}</p>
                            <p>{etaLabel(order)}</p>
                          </div>
                          {canReassignOrders ? (
                            <Button size="sm" variant="outline" onClick={() => openReassign(order)}>
                              Reassign sale
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState title="No matching orders" description="Adjust the search or column filters to surface orders." />
            )}
          </CardContent>
        ) : (
          <CardContent>
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              {formatNumber(displayOrders.length)} matching rows in the current scope.
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={Boolean(reassignOrder)} onOpenChange={(open) => { if (!open) { setReassignOrder(null); setReassignRepUid(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign sale</DialogTitle>
            <DialogDescription>
              Lock this order to a different representative. Future imports will keep this manual assignment.
            </DialogDescription>
          </DialogHeader>
          {reassignOrder ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="font-medium">{reassignOrder.customer}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sanitizeOrderId(reassignOrder.orderId)} / {reassignOrder.provider} / {formatDate(reassignOrder.orderDateId)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Current rep: {reassignOrder.repName || "Unassigned"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">New representative</p>
                <Select value={reassignRepUid} onValueChange={setReassignRepUid}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reassignRepOptions.map((rep) => (
                      <SelectItem key={rep.repUid} value={rep.repUid}>
                        {rep.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only active roster reps in the current performance dataset are shown.</p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignOrder(null); setReassignRepUid(""); }}>Cancel</Button>
            <Button onClick={() => void saveReassignment()} disabled={reassigning || !reassignRepUid || !reassignRepOptions.length}>
              {reassigning ? "Reassigning..." : "Reassign sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeDrilldown ? (
        <OrdersDrilldownSheet
          open={Boolean(activeDrilldown)}
          onOpenChange={(open) => { if (!open) setActiveDrilldown(null); }}
          title={drilldownConfig[activeDrilldown].title}
          description={drilldownConfig[activeDrilldown].description}
          emptyTitle={drilldownConfig[activeDrilldown].emptyTitle}
          emptyDescription={drilldownConfig[activeDrilldown].emptyDescription}
          rows={drilldownConfig[activeDrilldown].rows}
          onExport={() => exportOrders(drilldownConfig[activeDrilldown].rows, drilldownConfig[activeDrilldown].exportPrefix)}
          onReassign={canReassignOrders && drilldownConfig[activeDrilldown].reassign ? openReassign : undefined}
        />
      ) : null}
    </motion.div>
  );
}
