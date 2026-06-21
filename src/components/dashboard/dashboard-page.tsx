"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, FileUp, Gauge, Target, TrendingUp, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authedJson } from "@/src/lib/api/client";
import { formatCompact, formatDelta, formatNumber } from "@/src/lib/formatters/number";
import { formatDateTime } from "@/src/lib/formatters/date";
import { weekRangeLabel } from "@/src/lib/date/week";
import { toast } from "sonner";

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

const colors = ["var(--primary)", "var(--info)", "var(--warning)", "var(--success)", "var(--danger)"];
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function ChartShell({ title, description, children, badge }: { title: string; description: string; children: React.ReactNode; badge?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {badge ? <Badge variant="outline" className="rounded-full">{badge}</Badge> : null}
      </CardHeader>
      <CardContent className="h-[320px]">{children}</CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  delta,
  sublabel,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  delta?: string;
  sublabel?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
            {sublabel ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{sublabel}</p> : null}
            {delta ? (
              <Badge variant={delta.startsWith("+") ? "success" : "warning"} className="mt-3 rounded-full">
                {delta}
              </Badge>
            ) : null}
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-11 w-11 rounded-2xl" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="h-[320px]">
        <Skeleton className="h-full w-full rounded-2xl" />
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/25 px-6 text-center">
      <div className="rounded-full bg-primary/10 p-3 text-primary">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SectionEmpty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    authedJson<OverviewResponse>("/api/overview")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "Unable to load overview.";
        setError(message);
        toast.error(message);
      });
    return () => {
      active = false;
    };
  }, []);

  const weekLabel = data ? weekRangeLabel(data.week.start, data.week.end) : "Current week";

  const dayChartData = useMemo(
    () =>
      data?.byDay.map((value, index) => ({
        day: weekDays[index] ?? `Day ${index + 1}`,
        sales: value,
        teams: data.byDayTeams[index] ?? [],
      })) ?? [],
    [data],
  );

  const providerData = useMemo(
    () => Object.entries(data?.byProvider ?? {}).map(([name, value]) => ({ name, value })).filter((item) => item.value > 0),
    [data],
  );

  const statusData = useMemo(
    () =>
      data
        ? Object.entries(data.statusFunnel).map(([provider, statuses]) => ({
            provider,
            active: statuses["Installed / Active"] ?? 0,
            pending: statuses.Pending ?? 0,
            cancelled: statuses.Cancelled ?? 0,
            other: statuses.Other ?? 0,
          }))
        : [],
    [data],
  );

  const goalPacingData = useMemo(
    () =>
      data?.goalPacing.map((rep) => ({
        name: rep.displayName,
        value: rep.sales,
        goal: rep.goal,
        remaining: rep.remaining,
      })) ?? [],
    [data],
  );

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Overview unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </section>
        <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-52" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </CardContent>
          </Card>
        </section>
      </motion.div>
    );
  }

  const comparisonDelta = data.comparison.previous ? Math.round(((data.comparison.current - data.comparison.previous) / data.comparison.previous) * 100) : 0;
  const goalProgress = data.totalSalesGoal ? Math.min(100, Math.round((data.totalSales / data.totalSalesGoal) * 100)) : 0;
  const knocksPerRep = data.activeReps ? data.totalKnocks / data.activeReps : 0;

  const hasDayData = dayChartData.some((item) => item.sales > 0);
  const hasProviderData = providerData.length > 0;
  const hasStatusData = statusData.some((item) => item.active || item.pending || item.cancelled || item.other);
  const hasGoalData = goalPacingData.length > 0;

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total sales" value={formatNumber(data.totalSales)} detail={weekLabel} sublabel={`${formatNumber(data.comparison.current)} current / ${formatNumber(data.comparison.previous)} prior`} icon={TrendingUp} delta={formatDelta(comparisonDelta)} />
        <MetricCard label="Goal progress" value={formatPercent(goalProgress)} detail={`${formatNumber(data.totalSales)} of ${formatNumber(data.totalSalesGoal)} goal`} sublabel="Weekly pacing" icon={Gauge} />
        <MetricCard label="Total knocks" value={formatNumber(data.totalKnocks)} detail="Current week field activity" sublabel={`${formatCompact(knocksPerRep)} per rep`} icon={Target} delta={data.activeReps ? `+${formatCompact(knocksPerRep)} per rep` : undefined} />
        <MetricCard label="Active reps" value={formatNumber(data.activeReps)} detail="Roster members with active status" sublabel="Currently reporting" icon={Users} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.9fr]">
        <ChartShell title="Sales trend" description="Daily sales across the current reporting window." badge={weekLabel}>
          {hasDayData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dayChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 16, border: "1px solid var(--border)", background: "var(--popover)" }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Area type="monotone" dataKey="sales" stroke="var(--primary)" fill="url(#salesTrendFill)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No daily sales yet" description="The overview has loaded, but there are no sales values for the current week." />
          )}
        </ChartShell>

        <ChartShell title="Provider mix" description="Share of volume by source." badge={hasProviderData ? `${providerData.length} providers` : "No data"}>
          {hasProviderData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={providerData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={112} paddingAngle={3}>
                  {providerData.map((_, index) => (
                    <Cell key={index} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No provider mix yet" description="There are no provider counts in the current overview response." />
          )}
        </ChartShell>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Status funnel</CardTitle>
              <CardDescription>Order statuses grouped by provider.</CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">Realtime snapshot</Badge>
          </CardHeader>
          <CardContent className="h-[320px]">
            {hasStatusData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="provider" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="active" stackId="a" fill="var(--success)" name="Installed / Active" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pending" stackId="a" fill="var(--warning)" name="Pending" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="cancelled" stackId="a" fill="var(--danger)" name="Cancelled" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="other" stackId="a" fill="var(--info)" name="Other" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No status data" description="The overview response did not include any status funnel values." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attention needed</CardTitle>
            <CardDescription>Items that need review before they slip further behind.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.length ? (
              data.alerts.map((alert) => (
                <div key={alert.title} className="rounded-2xl border border-border/70 bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
                    </div>
                    <Badge variant={alert.type === "upload" ? "warning" : alert.type === "roster" ? "info" : "danger"} className="rounded-full">
                      {alert.type}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <SectionEmpty title="No active alerts" description="Reporting is healthy and nothing needs immediate attention." />
            )}
            <Separator className="my-1" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link href="/imports">
                  <FileUp className="h-4 w-4" />
                  Upload report
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/imports/unmatched">
                  <ArrowRight className="h-4 w-4" />
                  Review unmatched
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/roster?add=1">
                  <Users className="h-4 w-4" />
                  Add rep
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/backfill">
                  <TrendingUp className="h-4 w-4" />
                  Backfill sale
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Data freshness</CardTitle>
            <CardDescription>Most recent source uploads and row counts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "ATT", source: data.freshness.att },
              { label: "T-Fiber", source: data.freshness.tfiber },
            ].map(({ label, source }) => (
              <div key={label} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{source?.fileName || "No upload yet"}</p>
                  </div>
                  <Badge variant={source?.uploadedAt ? "success" : "warning"} className="rounded-full">
                    {source?.uploadedAt ? "Fresh" : "Waiting"}
                  </Badge>
                </div>
                <div className="mt-4">
                  <Progress value={source?.uploadedAt ? 100 : 8} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {source?.uploadedAt ? `Uploaded ${formatDateTime(source.uploadedAt)}` : "No recent upload has been processed."}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Goal pacing</CardTitle>
            <CardDescription>Rep-by-rep performance against weekly goals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasGoalData ? (
              data.goalPacing.slice(0, 5).map((rep) => {
                const percent = rep.goal ? Math.min(100, Math.round((rep.sales / rep.goal) * 100)) : 0;
                return (
                  <div key={rep.repUid} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{rep.displayName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatNumber(rep.sales)} of {formatNumber(rep.goal)} goal
                        </p>
                      </div>
                      <Badge variant={percent >= 100 ? "success" : percent >= 70 ? "warning" : "outline"} className="rounded-full">
                        {formatPercent(percent)}
                      </Badge>
                    </div>
                    <div className="mt-4">
                      <Progress value={percent} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {rep.remaining > 0 ? `${formatNumber(rep.remaining)} remaining, ${formatCompact(rep.neededPerDay)} needed per day` : "Goal completed"}
                    </p>
                  </div>
                );
              })
            ) : (
              <SectionEmpty title="No goal pacing data" description="The overview did not return any rep goal pacing rows." />
            )}
          </CardContent>
        </Card>
      </section>
    </motion.div>
  );
}
