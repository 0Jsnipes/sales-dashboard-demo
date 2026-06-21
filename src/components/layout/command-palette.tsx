"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, BarChart3, TrendingUp, Users, FileUp, UserCheck, CalendarDays, Settings, Search, Target } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { appNav } from "@/src/components/layout/navigation";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const actions = [
  { label: "Upload report", href: "/imports", icon: FileUp, shortcut: "I" },
  { label: "Review unmatched", href: "/imports/unmatched", icon: Search, shortcut: "U" },
  { label: "Add rep", href: "/roster?add=1", icon: Users, shortcut: "R" },
  { label: "Backfill sale", href: "/backfill", icon: CalendarDays, shortcut: "B" },
  { label: "Open onboarding", href: "/onboarding", icon: UserCheck, shortcut: "O" },
  { label: "View performance", href: "/performance", icon: BarChart3, shortcut: "P" },
  { label: "Open sales", href: "/sales", icon: TrendingUp, shortcut: "S" },
  { label: "Open dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "D" },
  { label: "Open settings", href: "/settings", icon: Settings, shortcut: "," },
  { label: "Open knocks", href: "/knocks", icon: Target, shortcut: "K" },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSearch("");
    onOpenChange(nextOpen);
  };

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const navItems = appNav.map((item) => ({ ...item, label: item.label, href: item.href }));
    const all = [...navItems, ...actions];
    return all.filter((item) => !term || item.label.toLowerCase().includes(term) || item.href.toLowerCase().includes(term));
  }, [search]);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search pages and actions..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No matching pages or actions.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {items
            .filter((item) => appNav.some((nav) => nav.href === item.href))
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
            .filter((item) => !appNav.some((nav) => nav.href === item.href))
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
