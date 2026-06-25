"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, FileUp, Gauge, Target, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authedJson } from "@/src/lib/api/client";
import { toDateId, weekRangeLabel } from "@/src/lib/date/week";
import { formatDateTime } from "@/src/lib/formatters/date";
import { formatCompact, formatDelta, formatNumber } from "@/src/lib/formatters/number";

type OverviewResponse = {
  week: { start: string; end: string };
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
  freshness: { att: { uploadedAt: string | null; rows: number; fileName: string } | null; tfiber: { uploadedAt: string | null; rows: number; fileName: string } | null };
  statusFunnel: Record<string, Record<string, number>>;
  teamSnapshot: { manager: string; location: string; sales: number; goal: number }[];
  efficiency: { repUid: string; displayName: string; sales: number; knocks: number; conversion: number }[];
};

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const providerColors: Record<string, string> = {
  ATT: "#2563eb",
  "T-Fiber": "#d946ef",
  Frontier: "#f97316",
  Manual: "#94a3b8",
};

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function salesSharePercent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function providerColor(name: string) {
  return providerColors[name] ?? "#94a3b8";
}

function addDays(start: string, days: number) {
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
          </div>
        </CardHeader>
      </Card>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <Skeleton className="h-[520px] rounded-2xl" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </section>
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

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  badgeLabel = "Live",
  badgeVariant = "outline" as const,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  badgeLabel?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-2xl bg-muted/35 p-3">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      <Badge variant={badgeVariant} className="mt-5 w-fit">
        {badgeLabel}
      </Badge>
    </>
  );
  const className = cn(
    "flex h-full w-full flex-col rounded-2xl border border-border/70 bg-card p-5 text-left shadow-sm transition",
    href ? "hover:-translate-y-0.5 hover:shadow-md" : "",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : <div className={className}>{body}</div>;
}

function ChartCard({ title, description, badge, children, className }: { title: string; description: string; badge?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden border-border/70", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ProviderGaugeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; value?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = String(row?.name ?? row?.payload?.name ?? "Provider");
  const value = Number(row?.value ?? row?.payload?.value ?? 0);
  return (
    <div className="rounded-2xl border border-border/70 bg-popover/95 px-4 py-3 text-popover-foreground shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Provider</p>
      <p className="mt-1 text-sm font-medium">{name}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color: providerColor(name) }}>{formatNumber(value)} sales</p>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    void authedJson<OverviewResponse>("/api/overview")
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load overview.";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const weekLabel = data ? weekRangeLabel(data.week.start, data.week.end) : "Current week";
  const dayChartData = useMemo(
    () =>
      data?.byDay.map((value, index) => {
        const date = addDays(data.week.start, index);
        return {
          dateId: toDateId(date),
          label: `${weekDays[index] ?? `Day ${index + 1}`} ${date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}`,
          sales: value,
        };
      }) ?? [],
    [data],
  );

  const providerBreakdown = useMemo(
    () => Object.entries(data?.byProvider ?? {})
      .map(([name, value]) => ({ name, value, fill: providerColor(name) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    [data],
  );

  const statusTotals = useMemo(() => {
    const totals = { installed: 0, pending: 0, cancelled: 0, other: 0 };
    for (const statuses of Object.values(data?.statusFunnel ?? {})) {
      totals.installed += statuses["Installed / Active"] ?? 0;
      totals.pending += statuses.Pending ?? 0;
      totals.cancelled += statuses.Cancelled ?? 0;
      totals.other += statuses.Other ?? 0;
    }
    return totals;
  }, [data]);

  const orderBreakdownData = useMemo(() => {
    const total = statusTotals.installed + statusTotals.pending + statusTotals.cancelled + statusTotals.other;
    return [
      { name: "Installed", value: statusTotals.installed, fill: "var(--success)", share: salesSharePercent(statusTotals.installed, total) },
      { name: "Pending", value: statusTotals.pending, fill: "var(--warning)", share: salesSharePercent(statusTotals.pending, total) },
      { name: "Cancelled", value: statusTotals.cancelled, fill: "var(--danger)", share: salesSharePercent(statusTotals.cancelled, total) },
      { name: "Other", value: statusTotals.other, fill: "var(--info)", share: salesSharePercent(statusTotals.other, total) },
    ];
  }, [statusTotals]);

  const topReps = useMemo(
    () => (data?.topReps ?? []).map((rep) => ({ ...rep, share: salesSharePercent(rep.sales, data?.totalSales ?? 0) })),
    [data],
  );

  if (loading && !data) return <LoadingState />;
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
  const goalProgress = data.totalSalesGoal ? Math.min(100, Math.round((data.totalSales / data.totalSalesGoal) * 100)) : 0;
  const conversion = data.totalKnocks ? Math.round((data.totalSales / data.totalKnocks) * 100) : 0;
  const providerTotal = providerBreakdown.reduce((sum, item) => sum + item.value, 0);
  const hasTrendData = dayChartData.some((item) => item.sales > 0);
  const hasOrderBreakdown = orderBreakdownData.some((item) => item.value > 0);
  const freshnessRows = [
    { label: "ATT", source: data.freshness.att },
    { label: "T-Fiber", source: data.freshness.tfiber },
  ];

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-3xl">Dashboard</CardTitle>
                <Badge variant={error ? "warning" : "success"}>{error ? "Stale" : "Live"}</Badge>
              </div>
              <CardDescription className="mt-2">Current sales pulse, roster health, provider mix, and follow-up priorities.</CardDescription>
              <p className="mt-2 text-sm text-muted-foreground">Overview data from salesOrders, uploadRuns, reps, and weekly goals.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/performance">
                  <ArrowRight className="h-4 w-4" />
                  Open performance
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/imports">
                  <FileUp className="h-4 w-4" />
                  Upload report
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium">{weekLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Current dashboard window</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Goal progress</p>
                <span className="text-sm font-semibold">{formatPercent(goalProgress)}</span>
              </div>
              <Progress className="mt-3" value={goalProgress} />
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium">{formatDelta(comparisonDelta)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(data.comparison.current)} current / {formatNumber(data.comparison.previous)} previous
              </p>
            </div>
          </div>
          {error ? (
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Refresh warning</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <KpiCard label="Total sales" value={formatNumber(data.totalSales)} detail={weekLabel} icon={TrendingUp} badgeLabel={formatDelta(comparisonDelta)} badgeVariant={comparisonDelta >= 0 ? "success" : "warning"} href="/sales" />
        <KpiCard label="Goal progress" value={formatPercent(goalProgress)} detail={`${formatNumber(data.totalSales)} of ${formatNumber(data.totalSalesGoal)} goal`} icon={Gauge} badgeLabel="Weekly goal" />
        <KpiCard label="Total knocks" value={formatNumber(data.totalKnocks)} detail={`${formatCompact(data.activeReps ? data.totalKnocks / data.activeReps : 0)} per active rep`} icon={Target} href="/knocks" />
        <KpiCard label="Conversion" value={formatPercent(conversion)} detail="Sales divided by knocks" icon={BarChart3} />
        <KpiCard label="Installed" value={formatNumber(statusTotals.installed)} detail="Installed or active orders" icon={CheckCircle2} badgeVariant="success" />
        <KpiCard label="Pending" value={formatNumber(statusTotals.pending)} detail="Open installs and follow-up" icon={Clock3} badgeVariant="warning" />
        <KpiCard label="Active reps" value={formatNumber(data.activeReps)} detail="Roster members with active status" icon={Users} href="/roster" />
        <KpiCard label="Alerts" value={formatNumber(data.alerts.length)} detail="Pacing, roster, and upload items" icon={TriangleAlert} badgeVariant={data.alerts.length ? "danger" : "success"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <ChartCard title="Sales trend" description="Units sold by day for the current dashboard week." badge={weekLabel}>
          <div className="h-[420px]">
            {hasTrendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayChartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip formatter={(value) => [formatNumber(Number(value)), "Sales"]} labelFormatter={(value) => String(value)} />
                  <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No trend data" description="There are no sales in the current dashboard window yet." />}
          </div>
        </ChartCard>

        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Rep leaderboard</CardTitle>
              <CardDescription>Top reps by current-week sales.</CardDescription>
            </div>
            <Badge variant="outline">{topReps.length} reps</Badge>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-auto p-0">
            {topReps.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead>Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topReps.map((rep) => (
                    <TableRow key={rep.repUid}>
                      <TableCell className="font-medium">{rep.displayName}</TableCell>
                      <TableCell>{formatNumber(rep.sales)}</TableCell>
                      <TableCell>{formatPercent(rep.share)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6">
                <EmptyState title="No reps in scope" description="Sales will appear here after imports are matched to reps." />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.9fr]">
        <ChartCard title="Order breakdown" description="Installed, pending, cancelled, and other order volume.">
          <div className="h-[320px]">
            {hasOrderBreakdown ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderBreakdownData} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip formatter={(value) => [formatNumber(Number(value)), "Sales"]} />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {orderBreakdownData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No order status data" description="Status volume appears here after provider imports are processed." />}
          </div>
        </ChartCard>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Provider gauge</CardTitle>
            <CardDescription>Sales volume by provider for the current week.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providerBreakdown.length ? (
              <>
                <div className="relative h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={providerBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={82} outerRadius={116} startAngle={90} endAngle={-270} paddingAngle={3}>
                        {providerBreakdown.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                      <RechartsTooltip content={<ProviderGaugeTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                    <p className="mt-1 text-3xl font-semibold">{formatNumber(providerTotal)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {providerBreakdown.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{formatNumber(item.value)} sales</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState title="No provider data" description="Provider totals appear after sales imports are loaded." />}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Attention needed</CardTitle>
            <CardDescription>Pacing, roster, and upload items that need review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.length ? data.alerts.map((alert) => (
              <div key={`${alert.type}-${alert.title}`} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{alert.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
                  </div>
                  <Badge variant={alert.type === "upload" ? "warning" : alert.type === "roster" ? "info" : "danger"}>{alert.type}</Badge>
                </div>
              </div>
            )) : <EmptyState title="No active alerts" description="No dashboard alert requires attention right now." />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" asChild>
                <Link href="/imports/unmatched">Review unmatched</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/performance">
                  Performance
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Data freshness</CardTitle>
            <CardDescription>Most recent source uploads and processed rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {freshnessRows.map(({ label, source }) => (
              <div key={label} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{source?.fileName || "No upload yet"}</p>
                  </div>
                  <Badge variant={source?.uploadedAt ? "success" : "warning"}>{source?.uploadedAt ? "Fresh" : "Waiting"}</Badge>
                </div>
                <Progress className="mt-4" value={source?.uploadedAt ? 100 : 8} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {source?.uploadedAt ? `Uploaded ${formatDateTime(source.uploadedAt)} with ${formatNumber(source.rows)} rows` : "No recent upload has been processed."}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Goal pacing</CardTitle>
              <CardDescription>Reps currently behind expected weekly pace.</CardDescription>
            </div>
            <Badge variant="outline">{data.goalPacing.length} reps</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.goalPacing.length ? data.goalPacing.slice(0, 6).map((rep) => {
              const percent = rep.goal ? Math.min(100, Math.round((rep.sales / rep.goal) * 100)) : 0;
              return (
                <div key={rep.repUid} className="rounded-2xl border border-border/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{rep.displayName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatNumber(rep.sales)} of {formatNumber(rep.goal)} goal</p>
                    </div>
                    <Badge variant={percent >= 100 ? "success" : percent >= 70 ? "warning" : "outline"}>{formatPercent(percent)}</Badge>
                  </div>
                  <Progress className="mt-4" value={percent} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {rep.remaining > 0 ? `${formatNumber(rep.remaining)} remaining, ${formatCompact(rep.neededPerDay)} needed per day` : "Goal completed"}
                  </p>
                </div>
              );
            }) : <EmptyState title="No goal pacing issues" description="Active reps are not behind expected weekly goal pace." />}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Team snapshot</CardTitle>
              <CardDescription>Sales and goal totals by manager and location.</CardDescription>
            </div>
            <Badge variant="outline">{data.teamSnapshot.length} groups</Badge>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-auto p-0">
            {data.teamSnapshot.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manager</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead>Goal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.teamSnapshot.slice(0, 10).map((team) => (
                    <TableRow key={`${team.manager}-${team.location}`}>
                      <TableCell className="font-medium">{team.manager}</TableCell>
                      <TableCell>{team.location}</TableCell>
                      <TableCell>{formatNumber(team.sales)}</TableCell>
                      <TableCell>{formatNumber(team.goal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6">
                <EmptyState title="No team data" description="Team pacing appears after roster and sales data are available." />
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </motion.div>
  );
}
