import { LayoutDashboard, BarChart3, TrendingUp, Target, Users, UserCheck, FileUp, CalendarDays, Settings } from "lucide-react";
import type { AppUser } from "@/src/types/user";
import { canAccessRule, type AccessRule } from "@/src/lib/access";

export const appNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, businessUnit: "fiber", permission: "canViewDashboard" },
  { label: "Performance", href: "/performance", icon: BarChart3, businessUnit: "fiber", permission: "canViewPerformance" },
  { label: "Sales", href: "/sales", icon: TrendingUp, businessUnit: "fiber", permission: "canViewSales" },
  { label: "Knocks", href: "/knocks", icon: Target, businessUnit: "fiber", permission: "canViewKnocks" },
  { label: "Roster", href: "/roster", icon: Users, businessUnit: "fiber", permission: "canViewRoster" },
  { label: "Onboarding", href: "/onboarding", icon: UserCheck, businessUnit: "fiber", permission: "canViewOnboarding" },
  { label: "Imports", href: "/imports", icon: FileUp, businessUnit: "fiber", permission: "canViewImports" },
  { label: "Backfill", href: "/backfill", icon: CalendarDays, businessUnit: "fiber", permission: "canViewBackfill" },
  { label: "Settings", href: "/settings", icon: Settings, businessUnit: "all", permission: "canViewSettings" },
] as const;

export type AppNavItem = (typeof appNav)[number];

export function canAccessNavItem(profile: AppUser | null | undefined, item: AccessRule) {
  return canAccessRule(profile, item);
}

export function visibleAppNav(profile: AppUser | null | undefined) {
  return appNav.filter((item) => canAccessNavItem(profile, item));
}
