"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Monitor, MoonStar, Search, Shield, SunMedium, Trash2, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { businessUnitLabel, DEFAULT_ADMIN_PERMISSIONS, normalizeBusinessUnit, normalizePermissions } from "@/src/lib/access";
import type { BusinessUnit } from "@/src/types/user";

type UserRow = {
  authUid: string;
  email: string;
  role: "superAdmin" | "admin" | "manager" | "user";
  businessUnit: BusinessUnit;
  mustChangePassword?: boolean;
  repUid: string | null;
  managerUid: string | null;
  locationIds: string[];
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  permissions: {
    canViewDashboard: boolean;
    canViewPerformance: boolean;
    canViewReporting: boolean;
    canViewSales: boolean;
    canViewKnocks: boolean;
    canViewRoster: boolean;
    canViewOnboarding: boolean;
    canViewImports: boolean;
    canViewBackfill: boolean;
    canViewSettings: boolean;
    canEditSales: boolean;
    canEditKnocks: boolean;
    canEditRoster: boolean;
    canEditOnboarding: boolean;
    canCreateUsers: boolean;
    canRunBackfill: boolean;
    canReassignSales: boolean;
    canFilterZeroSalesOnly: boolean;
  };
};

type CreateAdminDraft = {
  email: string;
  password: string;
  confirmPassword: string;
  businessUnit: Exclude<BusinessUnit, "all">;
  permissions: UserRow["permissions"];
};

const defaultAdminPermissions: UserRow["permissions"] = DEFAULT_ADMIN_PERMISSIONS;

const pagePermissionGroups = [
  { key: "canViewDashboard", label: "Dashboard", group: "Page access" },
  { key: "canViewPerformance", label: "Performance", group: "Page access" },
  { key: "canViewReporting", label: "Reporting", group: "Page access" },
  { key: "canViewSales", label: "Sales", group: "Page access" },
  { key: "canViewKnocks", label: "Knocks", group: "Page access" },
  { key: "canViewRoster", label: "Roster", group: "Page access" },
  { key: "canViewOnboarding", label: "Onboarding", group: "Page access" },
  { key: "canViewImports", label: "Imports", group: "Page access" },
  { key: "canViewBackfill", label: "Backfill", group: "Page access" },
  { key: "canViewSettings", label: "Settings", group: "Page access" },
] as const;

const actionPermissionGroups = [
  { key: "canEditSales", label: "Edit sales and imports", group: "Actions" },
  { key: "canEditRoster", label: "Edit roster", group: "Actions" },
  { key: "canEditKnocks", label: "Edit knocks", group: "Actions" },
  { key: "canEditOnboarding", label: "Edit onboarding", group: "Actions" },
  { key: "canRunBackfill", label: "Run backfill", group: "Actions" },
  { key: "canReassignSales", label: "Reassign sales", group: "Actions" },
  { key: "canFilterZeroSalesOnly", label: "Exit Hold", group: "Actions" },
  { key: "canCreateUsers", label: "Create users", group: "Actions" },
] as const;

const permissionSections = [
  { title: "Page access", description: "Controls which pages appear in navigation and can be opened.", items: pagePermissionGroups },
  { title: "Action permissions", description: "Controls editing, importing, backfill, and admin operations inside pages.", items: actionPermissionGroups },
] as const;

const roleDescriptions: Record<UserRow["role"], string> = {
  superAdmin: "Full workspace control, including user and permission management.",
  admin: "Broad operational access with configurable permissions.",
  manager: "Manager-level operational access based on assigned permissions.",
  user: "Limited access based on explicitly granted permissions.",
};

const roleFilterOptions = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "user", label: "Rep / User" },
  { value: "superAdmin", label: "Super admin" },
] as const;

function blankCreateDraft(): CreateAdminDraft {
  return { email: "", password: "", confirmPassword: "", businessUnit: "fiber", permissions: defaultAdminPermissions };
}

function permissionsSummary(permissions: UserRow["permissions"]) {
  return pagePermissionGroups
    .filter((item) => permissions[item.key])
    .map((item) => item.label)
    .slice(0, 3)
    .join(", ") || "No page access";
}

function normalizeUserRow(user: UserRow): UserRow {
  return {
    ...user,
    businessUnit: normalizeBusinessUnit(user.businessUnit),
    permissions: normalizePermissions(user.permissions),
    locationIds: Array.isArray(user.locationIds) ? user.locationIds : [],
    repUid: user.repUid ?? null,
    managerUid: user.managerUid ?? null,
  };
}

function formatValue(value?: string | Date | { toDate?: () => Date; seconds?: number; nanoseconds?: number } | null) {
  if (!value) return "—";
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "—";
    }
    if (typeof value.seconds === "number") {
      const date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000));
      return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
    }
  }
  return typeof value === "string" ? value.trim() || "—" : "—";
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
      </Card>
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("users");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof roleFilterOptions)[number]["value"]>("all");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editDraft, setEditDraft] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateAdminDraft>(blankCreateDraft);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  const profilePermissions = normalizePermissions(profile?.permissions);
  const canManageAccess = profile?.role === "superAdmin";
  const canViewSettings = canManageAccess || (profile?.role === "admin" && profilePermissions.canViewSettings);
  const currentUser = profile;
  const visibleTabs = useMemo(() => canManageAccess
    ? [
      { value: "users", label: "Users & Roles" },
      { value: "permissions", label: "Permissions" },
      { value: "profile", label: "Profile" },
      { value: "appearance", label: "Appearance" },
      { value: "system", label: "System" },
    ]
    : [
      { value: "profile", label: "Profile" },
      { value: "appearance", label: "Appearance" },
      { value: "system", label: "System" },
    ], [canManageAccess]);
  const selectedTab = visibleTabs.some((tab) => tab.value === activeTab) ? activeTab : visibleTabs[0]?.value ?? "profile";

  useEffect(() => {
    if (!canManageAccess) return;
    let active = true;
    authedJson<{ users: UserRow[] }>("/api/users")
      .then((value) => {
        if (!active) return;
        setUsers((value.users ?? []).map(normalizeUserRow));
        setError(null);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load users.";
        setError(message);
        toast.error(message);
        setLoading(false);
      })
    return () => {
      active = false;
    };
  }, [canManageAccess]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !term || [user.email, user.authUid, user.repUid, user.managerUid, user.role, businessUnitLabel(user.businessUnit)].join(" ").toLowerCase().includes(term);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, users]);

  const summaryCards = [
    { label: "Users", value: users.length, note: "All workspace accounts" },
    { label: "Admins", value: users.filter((user) => user.role === "admin").length, note: "Operational admins" },
    { label: "Fiber", value: users.filter((user) => user.businessUnit !== "energy").length, note: "Fiber-side accounts" },
    { label: "Energy", value: users.filter((user) => user.businessUnit === "energy").length, note: "Energy-side accounts" },
  ];

  async function save(user: UserRow, next: Partial<UserRow>) {
    setSaving(user.authUid);
    try {
      const payload = {
        authUid: user.authUid,
        role: next.role ?? user.role,
        businessUnit: next.businessUnit ?? user.businessUnit,
        permissions: next.permissions ?? user.permissions,
        repUid: next.repUid ?? user.repUid,
        managerUid: next.managerUid ?? user.managerUid,
        locationIds: next.locationIds ?? user.locationIds,
      };
      const response = await authedFetch("/api/users", { method: "PATCH", body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save user.");
      setUsers((current) => current.map((item) => item.authUid === user.authUid ? normalizeUserRow({ ...item, ...payload } as UserRow) : item));
      toast.success("User settings saved.");
      setEditUser(null);
      setEditDraft(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save user.");
    } finally {
      setSaving(null);
    }
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = createDraft.email.trim().toLowerCase();
    if (!email) {
      toast.error("Admin email is required.");
      return;
    }
    if (createDraft.password.length < 8) {
      toast.error("Temporary password must be at least 8 characters.");
      return;
    }
    if (createDraft.password !== createDraft.confirmPassword) {
      toast.error("Temporary passwords do not match.");
      return;
    }
    setCreatingAdmin(true);
    try {
      const response = await authedFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, password: createDraft.password, role: "admin", businessUnit: createDraft.businessUnit, permissions: createDraft.permissions }),
      });
      const result = await response.json() as { user?: UserRow; error?: unknown };
      if (!response.ok || !result.user) throw new Error(String(result.error || "Unable to create admin user."));
      setUsers((current) => [...current.filter((item) => item.authUid !== result.user!.authUid), normalizeUserRow(result.user!)].sort((a, b) => a.email.localeCompare(b.email)));
      setCreateOpen(false);
      setCreateDraft(blankCreateDraft());
      toast.success("Admin user created. They will be required to change the temporary password on first login.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create admin user.");
    } finally {
      setCreatingAdmin(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      const response = await authedFetch("/api/users", {
        method: "DELETE",
        body: JSON.stringify({ authUid: deleteTarget.authUid }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete user.");
      setUsers((current) => current.filter((user) => user.authUid !== deleteTarget.authUid));
      if (editUser?.authUid === deleteTarget.authUid) {
        setEditUser(null);
        setEditDraft(null);
      }
      toast.success("Admin user deleted.");
      setDeleteTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to delete user.");
    } finally {
      setDeletingUser(false);
    }
  }

  function openEdit(user: UserRow) {
    const normalized = normalizeUserRow(user);
    setEditUser(normalized);
    setEditDraft(normalized);
  }

  function updateDraft(changes: Partial<UserRow>) {
    setEditDraft((current) => current ? { ...current, ...changes } : current);
  }

  function updateCreatePermission(key: keyof UserRow["permissions"], value: boolean) {
    setCreateDraft((current) => ({ ...current, permissions: { ...current.permissions, [key]: value } }));
  }

  if (!canViewSettings) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          <Shield className="h-4 w-4 text-warning" />
          Settings are not available for this account.
        </CardContent>
      </Card>
    );
  }

  if (canManageAccess && loading) return <SettingsSkeleton />;
  if (error && !users.length && canManageAccess) return (
    <Card className="border-border/70">
      <CardContent className="p-6">
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
      </CardContent>
    </Card>
  );

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Manage users, permissions, preferences, and system controls.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Admin control center</Badge>
              {canManageAccess ? (
                <Button onClick={() => { setCreateDraft(blankCreateDraft()); setCreateOpen(true); }}>
                  <UserPlus className="h-4 w-4" />
                  Add admin
                </Button>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {canManageAccess ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <Card key={item.label} className="border-border/70">
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-3xl">{item.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">{item.note}</CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        <Tabs value={selectedTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 overflow-x-auto md:grid-cols-5">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card className="border-border/70">
              <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as typeof roleFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleFilterOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {canManageAccess ? (
                  <Button onClick={() => { setCreateDraft(blankCreateDraft()); setCreateOpen(true); }}>
                    <UserPlus className="h-4 w-4" />
                    Add admin
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            {!canManageAccess ? (
              <Card className="border-warning/30 bg-warning/5">
                <CardContent className="flex items-center gap-3 p-4 text-sm">
                  <Shield className="h-4 w-4 text-warning" />
                  Only the super admin can manage workspace access.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Card className="overflow-hidden border-border/70">
                    <CardContent className="p-0">
                      <table className="w-full">
                        <thead className="border-b border-border/70 bg-muted/30 text-left text-sm">
                          <tr>
                            <th className="px-4 py-3">User</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Business</th>
                            <th className="px-4 py-3">Permissions summary</th>
                            <th className="px-4 py-3">Updated</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => (
                            <tr key={user.authUid} className="border-b border-border/60 last:border-0">
                              <td className="px-4 py-4">
                                <div>
                                  <p className="font-medium">{user.email}</p>
                                  <p className="text-xs text-muted-foreground">{user.authUid}</p>
                                  {user.mustChangePassword ? <Badge variant="warning" className="mt-2">Temporary password</Badge> : null}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Badge variant={user.role === "superAdmin" ? "danger" : "outline"}>{user.role}</Badge>
                              </td>
                              <td className="px-4 py-4">
                                <Badge variant="secondary">{businessUnitLabel(user.businessUnit)}</Badge>
                              </td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{permissionsSummary(user.permissions)}</td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{formatValue(user.updatedAt ?? user.lastLoginAt)}</td>
                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                                    <UserCog className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  {user.role !== "superAdmin" ? (
                                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(user)}>
                                      <Trash2 className="h-4 w-4" />
                                      Delete
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3 lg:hidden">
                  {filteredUsers.map((user) => (
                    <Card key={user.authUid} className="border-border/70">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{user.email}</p>
                            <p className="text-xs text-muted-foreground">{user.authUid}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={user.role === "superAdmin" ? "danger" : "outline"}>{user.role}</Badge>
                            <Badge variant="secondary">{businessUnitLabel(user.businessUnit)}</Badge>
                          </div>
                        </div>
                        {user.mustChangePassword ? <Badge variant="warning">Temporary password</Badge> : null}
                        <p className="text-sm text-muted-foreground">{permissionsSummary(user.permissions)}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Updated: {formatValue(user.updatedAt ?? user.lastLoginAt)}</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(user)}>Edit</Button>
                            {user.role !== "superAdmin" ? (
                              <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(user)}>Delete</Button>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {!filteredUsers.length && (
                    <Card className="border-dashed border-border/70 bg-muted/20">
                      <CardContent className="p-6 text-sm text-muted-foreground">No users match the current filters.</CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
                <CardDescription>Permission groups are preserved as the current backend shape and edited in one save action.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AlertBlock />
                {permissionSections.map((section) => (
                  <div key={section.title} className="space-y-3">
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {section.items.map((item) => (
                        <Card key={item.key} className="border-border/70">
                          <CardContent className="p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.group}</p>
                            <p className="mt-1 font-medium">{item.label}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-4">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Read-only authenticated user details.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Name" value={currentUser?.email?.split("@")[0] ?? "—"} />
                <InfoCard label="Email" value={currentUser?.email ?? "—"} />
                <InfoCard label="Role" value={profile?.role ?? "member"} />
                <InfoCard label="Business" value={businessUnitLabel(profile?.businessUnit)} />
                <InfoCard label="Permissions" value={profile?.permissions ? permissionsSummary(profile.permissions) : "—"} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Theme controls mirror the global app shell.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Light", value: "light", icon: SunMedium },
                  { label: "Dark", value: "dark", icon: MoonStar },
                  { label: "System", value: "system", icon: Monitor },
                ].map(({ label, value, icon: Icon }) => (
                  <Button key={value} variant={theme === value ? "default" : "outline"} className="justify-start" onClick={() => setTheme(value)}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>System</CardTitle>
                <CardDescription>Safe workspace details and future placeholders.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="App version" value="v1" />
                <InfoCard label="Environment" value={process.env.NEXT_PUBLIC_APP_ENV ?? "Production"} />
                <InfoCard label="Firebase project" value="Available via client config only" />
                <InfoCard label="Audit logs" value="Coming soon" />
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {["Import settings", "Reporting settings", "Data retention", "Audit logs"].map((item) => (
                <Card key={item} className="border-dashed border-border/70 bg-muted/20">
                  <CardContent className="p-4">
                    <p className="font-medium">{item}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Coming soon</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateDraft(blankCreateDraft()); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add admin user</DialogTitle>
              <DialogDescription>
                Create a Firebase Auth account with a temporary password. The admin must change it on first login.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(event) => void createAdmin(event)}>
              <div className="space-y-2">
                <Label htmlFor="new-admin-email">Email</Label>
                <Input
                  id="new-admin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  value={createDraft.email}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-admin-password">Temporary password</Label>
                  <Input
                    id="new-admin-password"
                    type="password"
                    autoComplete="new-password"
                    value={createDraft.password}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-admin-password-confirm">Confirm password</Label>
                  <Input
                    id="new-admin-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={createDraft.confirmPassword}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Business side</Label>
                <Select value={createDraft.businessUnit} onValueChange={(value) => setCreateDraft((current) => ({ ...current, businessUnit: value as CreateAdminDraft["businessUnit"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fiber">Fiber</SelectItem>
                    <SelectItem value="energy">Energy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Admin permissions</Label>
                <div className="space-y-4">
                  {permissionSections.map((section) => (
                    <div key={section.title} className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">{section.title}</p>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {section.items.map((item) => (
                          <label key={item.key} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 text-sm">
                            <Checkbox
                              checked={Boolean(createDraft.permissions[item.key])}
                              onCheckedChange={(checked) => updateCreatePermission(item.key, !!checked)}
                            />
                            <span className="flex-1">
                              <span className="block font-medium">{item.label}</span>
                              <span className="block text-xs text-muted-foreground">{item.group}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  <p className="text-muted-foreground">
                    This creates an admin, not a super admin. Super admin access remains protected and must be handled separately.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={creatingAdmin || !createDraft.email.trim() || !createDraft.password.trim() || !createDraft.confirmPassword.trim()}>
                  {creatingAdmin ? "Creating..." : "Create admin"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(editUser)} onOpenChange={(open) => !open && setEditUser(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>Update role and permissions with an explicit save action.</DialogDescription>
            </DialogHeader>
            {editDraft ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>User</Label>
                  <Input value={editDraft.email} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={editDraft.role} onValueChange={(value) => updateDraft({ role: value as UserRow["role"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="user">Rep / User</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{roleDescriptions[editDraft.role]}</p>
                </div>
                <div className="space-y-2">
                  <Label>Business side</Label>
                  <Select value={editDraft.businessUnit} onValueChange={(value) => updateDraft({ businessUnit: value as BusinessUnit })} disabled={editDraft.role === "superAdmin"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fiber">Fiber</SelectItem>
                      <SelectItem value="energy">Energy</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Current Fiber pages are hidden from Energy-only admins.</p>
                </div>
                {editDraft.role === "superAdmin" && (
                  <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
                    Super admin access is protected and cannot be edited here.
                  </div>
                )}
                <div className="space-y-4">
                  {permissionSections.map((section) => (
                    <div key={section.title} className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">{section.title}</p>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {section.items.map((item) => (
                          <label key={item.key} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 text-sm">
                            <Checkbox
                              checked={Boolean(editDraft.permissions[item.key])}
                              onCheckedChange={(checked) => updateDraft({ permissions: { ...editDraft.permissions, [item.key]: !!checked } })}
                              disabled={editDraft.role === "superAdmin"}
                            />
                            <span className="flex-1">
                              <span className="block font-medium">{item.label}</span>
                              <span className="block text-xs text-muted-foreground">{item.group}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard label="Rep UID" value={formatValue(editDraft.repUid)} />
                  <InfoCard label="Manager UID" value={formatValue(editDraft.managerUid)} />
                  <InfoCard label="Locations" value={String(editDraft.locationIds.length)} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                {editUser?.role !== "superAdmin" ? (
                  <Button variant="destructive" onClick={() => editUser && setDeleteTarget(editUser)} disabled={!editUser || saving === editUser?.authUid}>
                    <Trash2 className="h-4 w-4" />
                    Delete user
                  </Button>
                ) : <span />}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!editUser || !editDraft) return;
                      void save(editUser, editDraft);
                    }}
                    disabled={!editUser || !editDraft || saving === editUser?.authUid}
                  >
                    {saving === editUser?.authUid ? "Saving..." : "Save user"}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingUser) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete admin user</DialogTitle>
              <DialogDescription>
                This removes the Firebase Auth account and workspace profile for this user. This does not remove historical sales, knocks, roster, or import data.
              </DialogDescription>
            </DialogHeader>
            {deleteTarget ? (
              <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" />
                  <div>
                    <p className="font-medium text-danger">Delete {deleteTarget.email}?</p>
                    <p className="mt-1 text-muted-foreground">They will no longer be able to sign in after this is deleted.</p>
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletingUser}>Cancel</Button>
              <Button variant="destructive" onClick={() => void deleteUser()} disabled={deletingUser || !deleteTarget}>
                {deletingUser ? "Deleting..." : "Delete user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function AlertBlock() {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
        <div>
          <p className="font-medium">Security note</p>
          <p className="text-muted-foreground">Frontend permission grouping is for clarity only. Server-side enforcement remains authoritative and should continue to be verified when adding new controls.</p>
        </div>
      </div>
    </div>
  );
}
