"use client";

import { RequireAuth } from "./require-auth";
import { useAuth } from "@/src/components/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { appNav, canAccessNavItem } from "@/src/components/layout/navigation";
import { DashboardPage } from "@/src/components/dashboard/dashboard-page";
import { PerformancePage } from "@/src/components/performance/performance-page";
import { ReportingPage } from "@/src/components/reporting/reporting-page";
import { SalesPage } from "@/src/components/sales/sales-page";
import { KnocksPage } from "@/src/components/knocks/knocks-page";
import { RosterPage } from "@/src/components/roster/roster-page";
import { TeamsPage } from "@/src/components/teams/teams-page";
import { OnboardingPage } from "@/src/components/onboarding/onboarding-page";
import { ImportsPage } from "@/src/components/imports/imports-page";
import { ImportsUnmatchedPage } from "@/src/components/imports/imports-unmatched-page";
import { BackfillPage } from "@/src/components/backfill/backfill-page";
import { SettingsPage } from "@/src/components/settings/settings-page";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

type OperationsView = "dashboard" | "performance" | "reporting" | "sales" | "knocks" | "roster" | "teams" | "onboarding" | "imports" | "unmatched" | "backfill" | "settings";

export function OperationsApp({ view }: { view: OperationsView }) {
  return (
    <RequireAuth>
      <OperationsShell view={view} />
    </RequireAuth>
  );
}

function OperationsShell({ view }: { view: OperationsView }) {
  const { profile } = useAuth();
  const screen =
    view === "dashboard" ? <DashboardPage /> :
    view === "performance" ? <PerformancePage /> :
    view === "reporting" ? <ReportingPage /> :
    view === "sales" ? <SalesPage /> :
    view === "knocks" ? <KnocksPage /> :
    view === "roster" ? <RosterPage /> :
    view === "teams" ? <TeamsPage /> :
    view === "onboarding" ? <OnboardingPage /> :
    view === "imports" ? <ImportsPage /> :
    view === "unmatched" ? <ImportsUnmatchedPage /> :
    view === "backfill" ? <BackfillPage /> :
    <SettingsPage />;

  const title =
    view === "dashboard" ? "Dashboard" :
    view === "performance" ? "Performance" :
    view === "reporting" ? "Reporting" :
    view === "sales" ? "Sales" :
    view === "knocks" ? "Knocks" :
    view === "roster" ? "Roster" :
    view === "teams" ? "Teams" :
    view === "onboarding" ? "Tools" :
    view === "imports" ? "Imports" :
    view === "unmatched" ? "Unmatched review" :
    view === "backfill" ? "Backfill" :
    "Settings";

  const href = view === "unmatched" ? "/imports" : `/${view}`;
  const navItem = appNav.find((item) => item.href === href);
  const canAccess = navItem ? canAccessNavItem(profile, navItem) : false;

  return (
    <AppShell title={title}>
      {canAccess ? screen : <AccessDenied title={title} />}
    </AppShell>
  );
}

function AccessDenied({ title }: { title: string }) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="flex items-start gap-3 p-6 text-sm">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-warning" />
        <div>
          <p className="font-medium">{title} is not available for this account.</p>
          <p className="mt-1 text-muted-foreground">Ask the super admin to update your permissions or business side if you need access.</p>
        </div>
      </CardContent>
    </Card>
  );
}
