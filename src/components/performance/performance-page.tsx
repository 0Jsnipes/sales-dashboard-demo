"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState, parseAsString } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, CalendarRange, CheckCircle2, Clock3, Download, Filter, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authedJson } from "@/src/lib/api/client";
import { endOfWeek, startOfWeek, toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { formatNumber } from "@/src/lib/formatters/number";
import { formatDate } from "@/src/lib/formatters/date";
import { calculateCancellationRate, calculateInstallRate, normalizeSaleOutcome, outcomeBadgeVariant, type PerformanceOrder } from "@/src/lib/performance/performance-utils";

type PerformanceResponse = {
  mode: string;
  metrics: {
    totalSales: number;
    orderCount: number;
    attSales: number;
    tfiberSales: number;
    frontierSales: number;
    cancellations: number;
    active: number;
    pending: number;
    activeReps: number;
  };
  installTracker: { pastDue: number; eligible: number; pastDuePercent: number };
  comparisons: {
    week: { sales: number; change: number | null; start: string; end: string };
    month: { sales: number; change: number | null; start: string; end: string };
    year: { sales: number; change: number | null; start: string; end: string };
  };
  roster: { repUid: string; displayName: string }[];
  reps: { repUid: string; displayName: string; managerName: string; locationName: string; sales: number; goal: number; pending: number; active: number; cancelled: number }[];
  orders: { id: string; providerKey: string; orderDateId: string; orderId: string; provider: string; repName: string; status: string; customer: string }[];
  filters: { managers: string[]; locations: string[]; providers?: string[] };
};

type RangeMode = "wtd" | "mtd" | "last30" | "custom";

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-[420px] w-full rounded-2xl" />
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

function Kpi({ label, value, detail, icon: Icon, variant = "outline" as const }: { label: string; value: string | number; detail: string; icon: React.ComponentType<{ className?: string }>; variant?: "outline" | "success" | "warning" | "danger" | "secondary" }) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-2xl bg-muted/40 p-3">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
      <CardContent className="pt-0">
        <Badge variant={variant}>Live</Badge>
      </CardContent>
    </Card>
  );
}

function rangeLabel(mode: RangeMode, start: string, end: string) {
  if (mode === "mtd") return `${format(new Date(), "MMMM yyyy")} MTD`;
  if (mode === "last30") return "Last 30 days";
  if (mode === "custom") return "Custom range";
  return weekRangeLabel(start, end);
}

function countByOutcome(orders: PerformanceOrder[]) {
  const totals = { installed: 0, pending: 0, past_due: 0, canceled: 0, churned: 0, unknown: 0 };
  for (const order of orders) {
    const outcome = normalizeSaleOutcome(order);
    if (order.rawData?.["pastDue"] === true) totals.past_due += 1;
    else if (order.accountStatus?.toLowerCase?.().includes("past due")) totals.past_due += 1;
    else totals[outcome] += 1;
  }
  return totals;
}

export function PerformancePage() {
  const reducedMotion = useReducedMotion();
  const [range, setRange] = useQueryState("period", parseAsString.withDefault("wtd"));
  const [weekStart] = useQueryState("weekStart", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [start, setStart] = useQueryState("start", parseAsString.withDefault(toDateId(startOfWeek(new Date()))));
  const [end, setEnd] = useQueryState("end", parseAsString.withDefault(toDateId(endOfWeek(new Date()))));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [manager, setManager] = useQueryState("manager", parseAsString.withDefault("all"));
  const [location, setLocation] = useQueryState("location", parseAsString.withDefault("all"));
  const [rep, setRep] = useQueryState("rep", parseAsString.withDefault("all"));
  const [provider, setProvider] = useQueryState("provider", parseAsString.withDefault("all"));
  const [outcome, setOutcome] = useQueryState("outcome", parseAsString.withDefault("all"));
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const mode = (range as RangeMode) || "wtd";

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      start: mode === "custom" ? start : mode === "last30" ? toDateId(subDays(new Date(), 29)) : weekStart,
      end: mode === "custom" ? end : mode === "last30" ? toDateId(new Date()) : toDateId(endOfWeek(new Date(`${weekStart}T12:00:00`))),
      mode: mode === "custom" ? "wtd" : mode === "last30" ? "mtd" : mode,
      manager,
      location,
      rep,
      provider,
      includeOrders: "true",
    });
    authedJson<PerformanceResponse>(`/api/performance?${params.toString()}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load performance.";
        setError(message);
        toast.error(message);
      });
    return () => {
      active = false;
    };
  }, [end, location, manager, mode, provider, rep, start, weekStart]);

  const orders = useMemo<PerformanceOrder[]>(() => (data?.orders ?? []).map((order) => ({
    ...order,
    orderUid: order.id,
    customer: order.customer || "—",
    repName: order.repName || "—",
    status: order.status || "unknown",
  })), [data]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const outcomeValue = normalizeSaleOutcome(order);
      return (!term || [order.orderId, order.repName, order.customer, order.provider, order.status].join(" ").toLowerCase().includes(term))
        && (provider === "all" || order.providerKey === provider || order.provider === provider)
        && (outcome === "all" || outcomeValue === outcome)
        && (manager === "all" || true)
        && (location === "all" || true)
        && (rep === "all" || true);
    });
  }, [location, manager, outcome, orders, provider, rep, search]);

  const outcomeTotals = useMemo(() => countByOutcome(filteredOrders), [filteredOrders]);
  const totalSales = data?.metrics.totalSales ?? filteredOrders.length;
  const installed = outcomeTotals.installed + outcomeTotals.past_due;
  const installRate = calculateInstallRate(totalSales, installed);
  const cancellationRate = calculateCancellationRate(totalSales, outcomeTotals.canceled);

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of filteredOrders) {
      const key = order.orderDateId || "unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOrders]);

  const providerMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of filteredOrders) map.set(order.provider, (map.get(order.provider) ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const attentionOrders = useMemo(() => filteredOrders.filter((order) => {
    const outcomeValue = normalizeSaleOutcome(order);
    return outcomeValue === "past_due" || outcomeValue === "canceled" || outcomeValue === "churned" || outcomeValue === "unknown";
  }).slice(0, 12), [filteredOrders]);

  const currentRangeLabel = rangeLabel(mode, data?.comparisons?.week?.start ?? weekStart, data?.comparisons?.week?.end ?? toDateId(endOfWeek(new Date(`${weekStart}T12:00:00`))));
  const hasNoData = !filteredOrders.length && !error;

  if (!data && !error) return <LoadingState />;
  if (error && !data) return <EmptyState title="Performance unavailable" description={error} />;

  const statusChips = [
    { label: "Installed", value: outcomeTotals.installed, variant: "success" as const },
    { label: "Pending", value: outcomeTotals.pending, variant: "outline" as const },
    { label: "Past Due", value: outcomeTotals.past_due, variant: "warning" as const },
    { label: "Canceled", value: outcomeTotals.canceled, variant: "danger" as const },
    { label: "Churned", value: outcomeTotals.churned, variant: "secondary" as const },
    { label: "Unknown", value: outcomeTotals.unknown, variant: "outline" as const },
  ];

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Performance</CardTitle>
              <CardDescription>Sales outcomes, install tracking, provider mix, and rep performance.</CardDescription>
              <p className="mt-2 text-sm text-muted-foreground">{currentRangeLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDetailsOpen(true)}>
                <Filter className="h-4 w-4" />
                Export / report
              </Button>
              <Button variant="outline" asChild>
                <Link href="/imports/unmatched">Review unmatched</Link>
              </Button>
            </div>
          </div>

          <Tabs value={mode} onValueChange={(value) => void setRange(value)}>
            <TabsList className="grid w-full max-w-xl grid-cols-4">
              <TabsTrigger value="wtd">WTD</TabsTrigger>
              <TabsTrigger value="mtd">MTD</TabsTrigger>
              <TabsTrigger value="last30">Last 30 days</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input placeholder="Search order, rep, customer, status" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={manager} onValueChange={setManager}>
              <SelectTrigger><SelectValue placeholder="Manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {(data?.filters.managers ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(data?.filters.locations ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {(data?.filters.providers ?? ["AT&T", "T-Fiber", "Frontier", "Vivint", "DIRECTV", "Wireless"]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger><SelectValue placeholder="Rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {data?.roster.map((item) => <SelectItem key={item.repUid} value={item.repUid}>{item.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue placeholder="Outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="installed">Installed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 xl:col-span-2">
              <p className="text-sm font-medium">{currentRangeLabel}</p>
              <p className="text-xs text-muted-foreground">TODO: connect full backend date-range support for custom periods if needed.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:col-span-2">
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} disabled={mode !== "custom"} />
              <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} disabled={mode !== "custom"} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total sales" value={formatNumber(totalSales)} detail="Source of truth for the selected view" icon={TrendingUp} />
        <Kpi label="Installed" value={formatNumber(installed)} detail={`Install rate ${installRate}%`} icon={CheckCircle2} variant="success" />
        <Kpi label="Pending" value={formatNumber(outcomeTotals.pending)} detail="Needs follow-up" icon={Clock3} variant="outline" />
        <Kpi label="Past due" value={formatNumber(outcomeTotals.past_due)} detail={`${data?.installTracker.pastDuePercent ?? 0}% of eligible`} icon={CalendarRange} variant="warning" />
        <Kpi label="Canceled" value={formatNumber(outcomeTotals.canceled)} detail={`Cancellation rate ${cancellationRate}%`} icon={TriangleAlert} variant="danger" />
        <Kpi label="Churned" value={formatNumber(outcomeTotals.churned)} detail="Separated from cancellations" icon={TriangleAlert} variant="secondary" />
        <Kpi label="Provider mix" value={providerMix.length} detail="Active providers in view" icon={BarChart3} />
        <Kpi label="Active reps" value={formatNumber(data?.metrics.activeReps ?? 0)} detail="Roster members in scope" icon={Users} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.9fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Sales trend</CardTitle>
            <CardDescription>Sales by day for the current view.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No trend data" description="Try clearing filters or switching range." />
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Comparison</CardTitle>
            <CardDescription>Week-over-week, month-over-month, and year-over-year.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Week", data: data?.comparisons.week },
              { label: "Month", data: data?.comparisons.month },
              { label: "Year", data: data?.comparisons.year },
            ].map(({ label, data: comparison }) => (
              <div key={label} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{label} comparison</p>
                    <p className="mt-1 text-2xl font-semibold">{formatNumber(comparison?.sales ?? 0)}</p>
                  </div>
                  <Badge variant={comparison?.change === null || (comparison?.change ?? 0) >= 0 ? "success" : "warning"}>
                    {comparison?.change == null ? "n/a" : `${comparison.change > 0 ? "+" : ""}${comparison.change}`}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{comparison ? `${comparison.start} to ${comparison.end}` : "No comparison available"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_.9fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Outcome breakdown</CardTitle>
            <CardDescription>Installed, pending, past due, canceled, churned, and unknown.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChips.map((item) => ({ name: item.label, value: item.value }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip />
                <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                  {statusChips.map((entry) => <Cell key={entry.label} fill={entry.variant === "success" ? "var(--success)" : entry.variant === "warning" ? "var(--warning)" : entry.variant === "danger" ? "var(--danger)" : entry.variant === "secondary" ? "var(--secondary)" : "var(--primary)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Provider mix</CardTitle>
            <CardDescription>Current sales volume by provider/program.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {providerMix.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providerMix} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={90} />
                  <RechartsTooltip />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} fill="var(--info)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No provider data" description="Clear filters to see the provider mix." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_.9fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Rep leaderboard</CardTitle>
              <CardDescription>Top reps by sales volume and their install rate.</CardDescription>
            </div>
            <Badge variant="outline">{data?.reps.length ?? 0} reps</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.reps ?? []).slice(0, 8).map((row) => {
                  const rate = calculateInstallRate(row.sales, row.active);
                  return (
                    <TableRow key={row.repUid}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.displayName}</p>
                          <p className="text-xs text-muted-foreground">{row.managerName} · {row.locationName}</p>
                        </div>
                      </TableCell>
                      <TableCell>{formatNumber(row.sales)}</TableCell>
                      <TableCell>{formatNumber(row.active)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{formatNumber(row.pending)}</span>
                          <Badge variant="outline">{rate}%</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Manager and location performance</CardTitle>
            <CardDescription>Use the current filter state to review the team view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.filters.managers ?? []).slice(0, 4).map((item) => (
              <div key={item} className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Manager</p>
                <p className="mt-1 text-base font-semibold">{item}</p>
              </div>
            ))}
            <Separator />
            {(data?.filters.locations ?? []).slice(0, 4).map((item) => (
              <div key={item} className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="mt-1 text-base font-semibold">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Performance orders</CardTitle>
              <CardDescription>Sortable table of the current filtered dataset.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.message("Export behavior remains on the existing API/export flow.")}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {hasNoData ? (
              <div className="p-6">
                <EmptyState title="No matching orders" description="Try clearing filters or switching range." />
              </div>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sale date</TableHead>
                        <TableHead>Rep</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Customer / order</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const outcomeValue = normalizeSaleOutcome(order);
                        const estimatedInstall = order.estimatedInstallationDateId || "—";
                        return (
                          <TableRow key={order.id}>
                            <TableCell>{formatDate(order.orderDateId)}</TableCell>
                            <TableCell>{order.repName}</TableCell>
                            <TableCell><Badge variant="outline">{order.provider}</Badge></TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{order.customer}</p>
                                <p className="text-xs text-muted-foreground">{order.orderId}</p>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant={outcomeBadgeVariant(outcomeValue)}>{outcomeValue}</Badge></TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p>{order.status || "—"}</p>
                                <p className="text-xs text-muted-foreground">ETA: {estimatedInstall}</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 p-4 lg:hidden">
                  {filteredOrders.map((order) => {
                    const outcomeValue = normalizeSaleOutcome(order);
                    return (
                      <Card key={order.id} className="border-border/70">
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{order.customer}</p>
                              <p className="text-sm text-muted-foreground">{order.orderId}</p>
                            </div>
                            <Badge variant={outcomeBadgeVariant(outcomeValue)}>{outcomeValue}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{order.repName} · {order.provider}</p>
                          <p className="text-sm text-muted-foreground">Sale date: {formatDate(order.orderDateId)}</p>
                          <p className="text-sm text-muted-foreground">Status: {order.status || "—"}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Attention needed</CardTitle>
            <CardDescription>Past due installs, cancellations, churn, and unknown statuses needing review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionOrders.length ? attentionOrders.map((order) => {
              const outcomeValue = normalizeSaleOutcome(order);
              const pastDue = outcomeValue === "past_due";
              return (
                <div key={order.id} className="rounded-2xl border border-border/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{order.customer}</p>
                      <p className="text-sm text-muted-foreground">{order.repName} · {order.provider}</p>
                    </div>
                    <Badge variant={outcomeBadgeVariant(outcomeValue)}>{outcomeValue}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    <p>Sale date: {formatDate(order.orderDateId)}</p>
                    <p>Order: {order.orderId}</p>
                    <p>Estimated install: {order.estimatedInstallationDateId || "—"}</p>
                    {pastDue ? <p>Days past due: TODO requires install ETA from backend</p> : null}
                  </div>
                </div>
              );
            }) : (
              <EmptyState title="No issues found" description="There are no attention-needed rows for the current filter set." />
            )}
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Backend limitation</AlertTitle>
              <AlertDescription>Past-due and install-date drilldowns are constrained by the current /api/performance payload. The page uses available order status fields and leaves TODOs where ETA detail is not exposed.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Export / report</SheetTitle>
            <SheetDescription>Use the existing reporting contract and current filters to drive exports.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p>Current range: {currentRangeLabel}</p>
            <p>Managers: {manager}</p>
            <p>Locations: {location}</p>
            <p>Reps: {rep}</p>
            <p>Provider: {provider}</p>
            <Separator />
            <Button className="w-full" onClick={() => toast.message("Wire this to the existing export/report action if a dedicated API exists.")}>Placeholder report action</Button>
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
