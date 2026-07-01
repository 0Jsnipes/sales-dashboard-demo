"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, BarChart3, TableProperties, TrendingUp, Users, FileUp, UserCheck, CalendarDays, Settings, Search, Target } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { visibleAppNav } from "@/src/components/layout/navigation";
import { canAccessRule, type AccessRule } from "@/src/lib/access";
import { useAuth } from "@/src/components/auth-provider";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const actions = [
  { label: "Upload report", href: "/imports", icon: FileUp, shortcut: "I", businessUnit: "fiber", permissions: ["canViewImports", "canEditSales"] },
  { label: "Review unmatched", href: "/imports/unmatched", icon: Search, shortcut: "U", businessUnit: "fiber", permissions: ["canViewImports", "canEditSales"] },
  { label: "Add rep", href: "/roster?add=1", icon: Users, shortcut: "R", businessUnit: "fiber", permissions: ["canViewRoster", "canEditRoster"] },
  { label: "Backfill sale", href: "/backfill", icon: CalendarDays, shortcut: "B", businessUnit: "fiber", permissions: ["canViewBackfill", "canRunBackfill"] },
  { label: "Open onboarding", href: "/onboarding", icon: UserCheck, shortcut: "O", businessUnit: "fiber", permission: "canViewOnboarding" },
  { label: "View performance", href: "/performance", icon: BarChart3, shortcut: "P", businessUnit: "fiber", permission: "canViewPerformance" },
  { label: "Open reporting", href: "/reporting", icon: TableProperties, shortcut: "G", businessUnit: "fiber", permission: "canViewReporting" },
  { label: "Open sales", href: "/sales", icon: TrendingUp, shortcut: "S", businessUnit: "fiber", permission: "canViewSales" },
  { label: "Open dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "D", businessUnit: "fiber", permission: "canViewDashboard" },
  { label: "Open settings", href: "/settings", icon: Settings, shortcut: ",", businessUnit: "all", permission: "canViewSettings" },
  { label: "Open knocks", href: "/knocks", icon: Target, shortcut: "K", businessUnit: "fiber", permission: "canViewKnocks" },
] as const satisfies ReadonlyArray<AccessRule & { label: string; href: string; icon: typeof FileUp; shortcut: string }>;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSearch("");
    onOpenChange(nextOpen);
  };

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const navItems = visibleAppNav(profile).map((item) => ({ ...item, label: item.label, href: item.href }));
    const visibleActions = actions.filter((item) => canAccessRule(profile, item));
    const all = [...navItems, ...visibleActions];
    return all.filter((item) => !term || item.label.toLowerCase().includes(term) || item.href.toLowerCase().includes(term));
  }, [profile, search]);

  const navHrefs = useMemo(() => new Set<string>(visibleAppNav(profile).map((item) => item.href)), [profile]);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search pages and actions..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No matching pages or actions.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {items
            .filter((item) => navHrefs.has(item.href))
            .map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  onSelect={() => {
                    router.push(item.href);
                    onOpenChange(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                  {"shortcut" in item ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
        </CommandGroup>
        <CommandGroup heading="Quick actions">
          {items
            .filter((item) => !navHrefs.has(item.href))
            .map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  onSelect={() => {
                    router.push(item.href);
                    onOpenChange(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                  {"shortcut" in item ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
