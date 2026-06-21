import { LayoutDashboard, BarChart3, TrendingUp, Target, Users, UserCheck, FileUp, CalendarDays, Settings } from "lucide-react";

export const appNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Performance", href: "/performance", icon: BarChart3 },
  { label: "Sales", href: "/sales", icon: TrendingUp },
  { label: "Knocks", href: "/knocks", icon: Target },
  { label: "Roster", href: "/roster", icon: Users },
  { label: "Onboarding", href: "/onboarding", icon: UserCheck },
  { label: "Imports", href: "/imports", icon: FileUp },
  { label: "Backfill", href: "/backfill", icon: CalendarDays },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;
