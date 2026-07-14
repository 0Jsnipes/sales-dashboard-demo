import { LayoutDashboard, BarChart3, TableProperties, TrendingUp, Target, Users, UsersRound, UserCheck, FileUp, CalendarDays, Settings } from "lucide-react";
import type { AppUser } from "@/src/types/user";
import { canAccessRule, type AccessRule } from "@/src/lib/access";

export const appNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, businessUnit: "fiber", permission: "canViewDashboard", hideOnMobile: false },
  { label: "Performance", href: "/performance", icon: BarChart3, businessUnit: "fiber", permission: "canViewPerformance", hideOnMobile: false },
  { label: "Reporting", href: "/reporting", icon: TableProperties, businessUnit: "fiber", permission: "canViewReporting", hideOnMobile: true },
  { label: "Sales", href: "/sales", icon: TrendingUp, businessUnit: "fiber", permission: "canViewSales", hideOnMobile: true },
  { label: "Knocks", href: "/knocks", icon: Target, businessUnit: "fiber", permission: "canViewKnocks", hideOnMobile: true },
  { label: "Roster", href: "/roster", icon: Users, businessUnit: "fiber", permission: "canViewRoster", hideOnMobile: false },
  { label: "Teams", href: "/teams", icon: UsersRound, businessUnit: "fiber", permission: "canViewTeams", hideOnMobile: false },
  { label: "Tools", href: "/onboarding", icon: UserCheck, businessUnit: "fiber", permission: "canViewOnboarding", hideOnMobile: false },
  { label: "Imports", href: "/imports", icon: FileUp, businessUnit: "fiber", permission: "canViewImports", hideOnMobile: false },
  { label: "Backfill", href: "/backfill", icon: CalendarDays, businessUnit: "fiber", permission: "canViewBackfill", hideOnMobile: false },
  { label: "Settings", href: "/settings", icon: Settings, businessUnit: "all", permission: "canViewSettings", hideOnMobile: false },
] as const;

export type AppNavItem = (typeof appNav)[number];

export function canAccessNavItem(profile: AppUser | null | undefined, item: AccessRule) {
  return canAccessRule(profile, item);
}

export function visibleAppNav(profile: AppUser | null | undefined) {
  return appNav.filter((item) => canAccessNavItem(profile, item));
}

export function visibleMobileNav(profile: AppUser | null | undefined) {
  return visibleAppNav(profile).filter((item) => !item.hideOnMobile);
}
