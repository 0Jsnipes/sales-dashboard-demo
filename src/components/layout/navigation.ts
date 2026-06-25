import { LayoutDashboard, BarChart3, TrendingUp, Target, Users, UserCheck, FileUp, CalendarDays, Settings } from "lucide-react";
import type { AppUser } from "@/src/types/user";
import { canAccessRule, type AccessRule } from "@/src/lib/access";

export const appNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, businessUnit: "fiber", permission: "canViewPerformance" },
  { label: "Performance", href: "/performance", icon: BarChart3, businessUnit: "fiber", permission: "canViewPerformance" },
  { label: "Sales", href: "/sales", icon: TrendingUp, businessUnit: "fiber", permission: "canEditSales" },
  { label: "Knocks", href: "/knocks", icon: Target, businessUnit: "fiber", permission: "canEditKnocks" },
  { label: "Roster", href: "/roster", icon: Users, businessUnit: "fiber", permission: "canEditRoster" },
  { label: "Onboarding", href: "/onboarding", icon: UserCheck, businessUnit: "fiber", permission: "canEditOnboarding" },
  { label: "Imports", href: "/imports", icon: FileUp, businessUnit: "fiber", permission: "canEditSales" },
  { label: "Backfill", href: "/backfill", icon: CalendarDays, businessUnit: "fiber", permission: "canRunBackfill" },
  { label: "Settings", href: "/settings", icon: Settings, businessUnit: "all", superAdminOnly: true },
] as const;

export type AppNavItem = (typeof appNav)[number];

export function canAccessNavItem(profile: AppUser | null | undefined, item: AccessRule) {
  return canAccessRule(profile, item);
}

export function visibleAppNav(profile: AppUser | null | undefined) {
  return appNav.filter((item) => canAccessNavItem(profile, item));
}
