"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Bell, ChevronDown, Eye, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { signOut } from "firebase/auth";
import { useAuth } from "@/src/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/src/components/layout/theme-toggle";
import { CommandPalette } from "@/src/components/layout/command-palette";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getFirebaseAuth } from "@/src/lib/firebase/client";
import { visibleAppNav, visibleMobileNav } from "@/src/components/layout/navigation";
import { businessUnitLabel } from "@/src/lib/access";
import { authedJsonAsActualUser } from "@/src/lib/api/client";
import type { AppUser } from "@/src/types/user";
import { repAccessRoleLabel } from "@/src/lib/reps/access-role";

type AppShellProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

function initialsFrom(value: string) {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function ShellNav({ collapsed, onNavigate, mobile = false }: { collapsed: boolean; onNavigate?: () => void; mobile?: boolean }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const navItems = mobile ? visibleMobileNav(profile) : visibleAppNav(profile);

  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
      {navItems.map((item) => {
        const active = isRouteActive(pathname, item.href);
        const Icon = item.icon;
        const navLink = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
            {active && !collapsed ? <Badge variant="secondary" className="ml-auto h-5 rounded-full px-2 text-[10px] uppercase tracking-wide">Active</Badge> : null}
          </Link>
        );

        return collapsed ? (
          <TooltipProvider key={item.href} delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>{navLink}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={12}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          navLink
        );
      })}
    </nav>
  );
}

function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const navItems = visibleMobileNav(profile);
  const primary = navItems.slice(0, 4);
  const hasOverflow = navItems.length > primary.length;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around">
        {primary.map((item) => {
          const active = isRouteActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full transition-colors", active && "bg-primary/12")}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        {hasOverflow ? (
          <button
            type="button"
            onClick={onMore}
            className="flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full">
              <MoreHorizontal className="h-5 w-5" />
            </span>
            <span>More</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}

function ViewAsControl() {
  const { actualProfile, isViewingAs, viewAsProfile, startViewingAs, stopViewingAs } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Array<AppUser & { previewSource: "account" | "roster" }>>([]);

  async function openPicker() {
    setOpen(true);
    if (users.length || loading || actualProfile?.role !== "superAdmin") return;
    setLoading(true);
    setError(null);
    try {
      const result = await authedJsonAsActualUser<{ users: AppUser[]; rosterTargets: AppUser[] }>("/api/users");
      setUsers([
        ...(result.users ?? []).map((profile) => ({ ...profile, previewSource: "account" as const })),
        ...(result.rosterTargets ?? []).map((profile) => ({ ...profile, previewSource: "roster" as const })),
      ].sort((left, right) => left.email.localeCompare(right.email)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  if (actualProfile?.role !== "superAdmin") return null;
  const term = query.trim().toLowerCase();
  const filteredUsers = users.filter((profile) => !term || [profile.email, profile.role, profile.repAccessRole, profile.authUid].join(" ").toLowerCase().includes(term));

  return (
    <>
      <Button variant={isViewingAs ? "secondary" : "outline"} size="sm" onClick={() => void openPicker()}>
        <Eye className="h-4 w-4" />
        <span className="hidden xl:inline">{isViewingAs ? `Viewing ${viewAsProfile?.email ?? "user"}` : "View as user"}</span>
        <span className="xl:hidden">View as</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>View workspace as a user</DialogTitle>
            <DialogDescription>Preview an account or any roster representative, including people who do not have a login. Changes are disabled until you exit preview mode.</DialogDescription>
          </DialogHeader>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or role" />
          <ScrollArea className="max-h-[52vh] rounded-xl border">
            <div className="divide-y">
              {loading ? <p className="p-4 text-sm text-muted-foreground">Loading users…</p> : null}
              {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
              {!loading && !error && filteredUsers.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No users match this search.</p> : null}
              {filteredUsers.map((target) => (
                <button
                  type="button"
                  key={target.authUid}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50"
                  onClick={() => {
                    startViewingAs(target);
                    setOpen(false);
                    setQuery("");
                    router.replace(visibleAppNav(target)[0]?.href ?? "/dashboard");
                    router.refresh();
                  }}
                >
                  <span className="min-w-0"><span className="block truncate font-medium">{target.email}</span><span className="text-xs text-muted-foreground">{target.previewSource === "roster" ? `${repAccessRoleLabel(target.repAccessRole)} · roster preview` : `${target.role} · ${businessUnitLabel(target.businessUnit)}`}</span></span>
                  <div className="flex items-center gap-2"><Badge variant="secondary">{target.previewSource === "roster" ? "Roster" : "Account"}</Badge><Badge variant={target.authUid === viewAsProfile?.authUid ? "success" : "outline"}>{target.authUid === viewAsProfile?.authUid ? "Viewing" : "Preview"}</Badge></div>
                </button>
              ))}
            </div>
          </ScrollArea>
          {isViewingAs ? <Button variant="outline" onClick={() => { stopViewingAs(); setOpen(false); router.replace("/dashboard"); router.refresh(); }}><X className="h-4 w-4" />Exit current preview</Button> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const { user, profile, isViewingAs, viewAsProfile, stopViewingAs } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => (typeof window !== "undefined" ? window.localStorage.getItem("ab-sidebar-collapsed") === "true" : false));
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("ab-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!profile) return;
    const allowed = visibleAppNav(profile);
    if (allowed.some((item) => isRouteActive(pathname, item.href))) return;
    router.replace(allowed[0]?.href ?? "/dashboard");
  }, [pathname, profile, router]);

  const displayName = isViewingAs ? profile?.email?.split("@")[0] || "Preview user" : user?.displayName?.trim() || profile?.email?.split("@")[0] || "Workspace user";
  const name = displayName;
  const role = profile?.role ?? "member";
  const avatarText = initialsFrom(user?.displayName || profile?.email || "AB");
  const avatarImage = user?.photoURL ?? undefined;
  const subtitleParts = [
    subtitle,
    profile?.locationIds?.length ? `${profile.locationIds.length} location${profile.locationIds.length === 1 ? "" : "s"}` : null,
    profile?.email ?? user?.email ?? "Authenticated workspace",
  ].filter(Boolean);

  const topActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <ViewAsControl />
        <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="hidden lg:inline-flex">
          <Search className="h-4 w-4" />
          Search
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Open search" className="lg:hidden" onClick={() => setCommandOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Notifications" title="Notifications coming soon">
                <Bell className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notifications coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 max-w-[220px] rounded-full px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={avatarImage} alt={name} />
                <AvatarFallback>{avatarText || "AB"}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left md:flex md:flex-col">
                <span className="text-sm font-medium leading-none">{name}</span>
                <span className="mt-1 text-xs text-muted-foreground">{role}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium normal-case tracking-normal text-foreground">{name}</span>
                <span className="text-xs font-normal text-muted-foreground">{profile?.role ?? "member"}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>Workspace settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>Dashboard</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await signOut(getFirebaseAuth());
                router.replace("/sign-in");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [avatarImage, avatarText, name, profile?.role, router, role],
  );

  return (
    <div className="dashboard-shell min-h-screen bg-background text-foreground">
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-[88vw] flex-col gap-0 p-0 sm:w-[330px]">
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
            <Image src="/legacy-assets/ab-logo.png" alt="AB Marketing" width={40} height={40} className="rounded-xl" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">AB Marketing</p>
              <p className="mt-1 text-xs text-muted-foreground">Sales operations workspace</p>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-2">
              <div className="px-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p>
              </div>
              <ShellNav collapsed={false} onNavigate={() => setMobileOpen(false)} mobile />
            </div>
          </ScrollArea>
          <div className="border-t border-border/70 p-4">
            <Card className="border-border/70 bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={avatarImage} alt={name} />
                  <AvatarFallback>{avatarText || "AB"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile?.email ?? "Authenticated user"}</p>
                </div>
              </div>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen w-full">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen flex-col border-r border-border/70 bg-card/85 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex",
            collapsed ? "w-[92px]" : "w-[284px]",
          )}
        >
          <div className={cn("flex items-center gap-3 border-b border-border/70 px-4 py-4", collapsed && "justify-center px-3")}>
            <Image src="/legacy-assets/ab-logo.png" alt="AB Marketing" width={40} height={40} className="rounded-xl" />
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none">AB Marketing</p>
                <p className="mt-1 text-xs text-muted-foreground">Sales operations workspace</p>
              </div>
            ) : null}
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-2">
              {!collapsed ? (
                <div className="px-2 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      {profile?.role ?? "member"}
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      {businessUnitLabel(profile?.businessUnit)}
                    </Badge>
                  </div>
                </div>
              ) : null}
              {!collapsed ? <Separator className="my-1" /> : null}
              <div className={cn("px-2", collapsed && "pt-2")}>
                {!collapsed ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p> : null}
                <ShellNav collapsed={collapsed} />
              </div>
            </div>
          </ScrollArea>
          <div className="border-t border-border/70 p-3">
            <Card className={cn("border-border/70 bg-muted/40 p-4", collapsed && "p-3")}>
              <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                <Avatar className="h-10 w-10">
                  <AvatarImage src={avatarImage} alt={name} />
                  <AvatarFallback>{avatarText || "AB"}</AvatarFallback>
                </Avatar>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{profile?.email ?? user?.email ?? "Authenticated user"}</p>
                  </div>
                ) : null}
                {!collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : null}
              </div>
            </Card>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="hidden lg:inline-flex"
                      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                      onClick={() => setCollapsed((value) => !value)}
                    >
                      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  <Badge variant="outline" className="rounded-full">
                    {title}
                  </Badge>
                  <span className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground md:inline">AB Marketing</span>
                </div>
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {subtitleParts.map((part, index) => (
                    <span key={`${part}-${index}`}>
                      {index > 0 ? <span className="mx-2 text-border">/</span> : null}
                      {part}
                    </span>
                  ))}
                </div>
              </div>
              {actions}
              {topActions}
            </div>
            <div className="hidden px-4 pb-4 sm:px-6 lg:block lg:px-8">
              <Separator />
            </div>
          </header>

          {isViewingAs ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
              <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-amber-600" /><span><strong>Preview mode:</strong> viewing the workspace as {viewAsProfile?.email}. This mode is read-only.</span></div>
              <Button size="sm" variant="outline" onClick={() => { stopViewingAs(); router.replace("/dashboard"); router.refresh(); }}><X className="h-4 w-4" />Exit preview</Button>
            </div>
          ) : null}

          <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-6">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      <MobileBottomNav onMore={() => setMobileOpen(true)} />
    </div>
  );
}
