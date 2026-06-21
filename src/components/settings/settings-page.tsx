"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Monitor, MoonStar, Search, Shield, SunMedium, UserCog } from "lucide-react";
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

type UserRow = {
  authUid: string;
  email: string;
  role: "superAdmin" | "admin" | "manager" | "user";
  repUid: string | null;
  managerUid: string | null;
  locationIds: string[];
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  permissions: {
    canEditSales: boolean;
    canEditKnocks: boolean;
    canEditRoster: boolean;
    canEditOnboarding: boolean;
    canCreateUsers: boolean;
    canViewPerformance: boolean;
    canRunBackfill: boolean;
    canReassignSales: boolean;
  };
};

const permissionGroups = [
  { key: "canViewPerformance", label: "View performance", group: "Dashboard" },
  { key: "canEditSales", label: "Edit sales", group: "Sales" },
  { key: "canEditRoster", label: "Edit roster", group: "Roster" },
  { key: "canEditKnocks", label: "Edit knocks", group: "Imports" },
  { key: "canEditOnboarding", label: "Edit onboarding", group: "Onboarding" },
  { key: "canRunBackfill", label: "Run backfill", group: "Backfill" },
  { key: "canReassignSales", label: "Reassign sales", group: "Settings/Admin" },
  { key: "canCreateUsers", label: "Create users", group: "Settings/Admin" },
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

function permissionsSummary(permissions: UserRow["permissions"]) {
  return permissionGroups
    .filter((item) => permissions[item.key])
    .map((item) => item.label)
    .slice(0, 3)
    .join(", ") || "No extra permissions";
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

  const allowed = profile?.role === "superAdmin";
  const currentUser = profile;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    authedJson<{ users: UserRow[] }>("/api/users")
      .then((value) => {
        if (!active) return;
        setUsers(value.users ?? []);
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
  }, [allowed]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !term || [user.email, user.authUid, user.repUid, user.managerUid, user.role].join(" ").toLowerCase().includes(term);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, users]);

  const summaryCards = [
    { label: "Users", value: users.length, note: "All workspace accounts" },
    { label: "Admins", value: users.filter((user) => user.role === "admin").length, note: "Operational admins" },
    { label: "Managers", value: users.filter((user) => user.role === "manager").length, note: "Manager accounts" },
    { label: "Super admins", value: users.filter((user) => user.role === "superAdmin").length, note: "Highest privilege" },
  ];

  async function save(user: UserRow, next: Partial<UserRow>) {
    setSaving(user.authUid);
    try {
      const payload = {
        authUid: user.authUid,
        role: next.role ?? user.role,
        permissions: next.permissions ?? user.permissions,
        repUid: next.repUid ?? user.repUid,
        managerUid: next.managerUid ?? user.managerUid,
        locationIds: next.locationIds ?? user.locationIds,
      };
      const response = await authedFetch("/api/users", { method: "PATCH", body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save user.");
      setUsers((current) => current.map((item) => item.authUid === user.authUid ? { ...item, ...payload } as UserRow : item));
      toast.success("User settings saved.");
      setEditUser(null);
      setEditDraft(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save user.");
    } finally {
      setSaving(null);
    }
  }

  function openEdit(user: UserRow) {
    setEditUser(user);
    setEditDraft(user);
  }

  function updateDraft(changes: Partial<UserRow>) {
    setEditDraft((current) => current ? { ...current, ...changes } : current);
  }

  if (!allowed) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          <Shield className="h-4 w-4 text-warning" />
          Only the super admin can manage workspace access.
        </CardContent>
      </Card>
    );
  }

  if (loading) return <SettingsSkeleton />;
  if (error && !users.length && allowed) return (
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
            <Badge variant="outline">Admin control center</Badge>
          </CardHeader>
        </Card>

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 overflow-x-auto md:grid-cols-5">
            <TabsTrigger value="users">Users & Roles</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card className="border-border/70">
              <CardContent className="grid gap-3 p-4 md:grid-cols-2">
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
              </CardContent>
            </Card>

            {!allowed ? (
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
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Badge variant={user.role === "superAdmin" ? "danger" : "outline"}>{user.role}</Badge>
                              </td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{permissionsSummary(user.permissions)}</td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{formatValue(user.updatedAt ?? user.lastLoginAt)}</td>
                              <td className="px-4 py-4 text-right">
                                <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                                  <UserCog className="h-4 w-4" />
                                  Edit
                                </Button>
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
                          <Badge variant={user.role === "superAdmin" ? "danger" : "outline"}>{user.role}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{permissionsSummary(user.permissions)}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Updated: {formatValue(user.updatedAt ?? user.lastLoginAt)}</span>
                          <Button size="sm" variant="outline" onClick={() => openEdit(user)}>Edit</Button>
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {permissionGroups.map((item) => (
                    <Card key={item.key} className="border-border/70">
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.group}</p>
                        <p className="mt-1 font-medium">{item.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                {editDraft.role === "superAdmin" && (
                  <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
                    Super admin access is protected and cannot be edited here.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {permissionGroups.map((item) => (
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
                <Separator />
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard label="Rep UID" value={formatValue(editDraft.repUid)} />
                  <InfoCard label="Manager UID" value={formatValue(editDraft.managerUid)} />
                  <InfoCard label="Locations" value={String(editDraft.locationIds.length)} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
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
