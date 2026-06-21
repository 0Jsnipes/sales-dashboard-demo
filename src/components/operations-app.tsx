"use client";

import { RequireAuth } from "./require-auth";
import { AppShell } from "@/src/components/layout/app-shell";
import { DashboardPage } from "@/src/components/dashboard/dashboard-page";
import { PerformancePage } from "@/src/components/performance/performance-page";
import { SalesPage } from "@/src/components/sales/sales-page";
import { KnocksPage } from "@/src/components/knocks/knocks-page";
import { RosterPage } from "@/src/components/roster/roster-page";
import { OnboardingPage } from "@/src/components/onboarding/onboarding-page";
import { ImportsPage } from "@/src/components/imports/imports-page";
import { ImportsUnmatchedPage } from "@/src/components/imports/imports-unmatched-page";
import { BackfillPage } from "@/src/components/backfill/backfill-page";
import { SettingsPage } from "@/src/components/settings/settings-page";

export function OperationsApp({ view }: { view: "dashboard" | "performance" | "sales" | "knocks" | "roster" | "onboarding" | "imports" | "unmatched" | "backfill" | "settings" }) {
  const screen =
    view === "dashboard" ? <DashboardPage /> :
    view === "performance" ? <PerformancePage /> :
    view === "sales" ? <SalesPage /> :
    view === "knocks" ? <KnocksPage /> :
    view === "roster" ? <RosterPage /> :
    view === "onboarding" ? <OnboardingPage /> :
    view === "imports" ? <ImportsPage /> :
    view === "unmatched" ? <ImportsUnmatchedPage /> :
    view === "backfill" ? <BackfillPage /> :
    <SettingsPage />;

  const meta =
    view === "dashboard" ? { title: "Dashboard", subtitle: "Live sales performance for the current week." } :
    view === "performance" ? { title: "Performance", subtitle: "Executive analytics for sales, installs, and order status." } :
    view === "sales" ? { title: "Sales", subtitle: "Weekly sales rows, filters, and goal management." } :
    view === "knocks" ? { title: "Knocks", subtitle: "Knock reporting workspace and intake landing zone." } :
    view === "roster" ? { title: "Roster", subtitle: "Reps, managers, locations, and identity management." } :
    view === "onboarding" ? { title: "Onboarding", subtitle: "Checklist-driven rep onboarding workflow." } :
    view === "imports" ? { title: "Imports", subtitle: "Upload, validate, and review incoming operational files." } :
    view === "unmatched" ? { title: "Unmatched review", subtitle: "Resolve ambiguous import matches safely." } :
    view === "backfill" ? { title: "Backfill", subtitle: "Create audited historical sales records." } :
    { title: "Settings", subtitle: "Roles and permission controls for the workspace." };

  return (
    <RequireAuth>
      <AppShell title={meta.title} subtitle={meta.subtitle}>
        {screen}
      </AppShell>
    </RequireAuth>
  );
}
