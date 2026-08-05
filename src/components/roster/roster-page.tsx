"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertTriangle, BadgeCheck, CircleAlert, Download, Link2, MapPin, Pencil, Plus, RotateCcw, Search, ShieldAlert, UserMinus, UserRoundX, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import { AssignLocationDialog } from "@/src/components/roster/assign-location-dialog";
import type { Rep } from "@/src/types/rep";
import type { Location } from "@/src/types/location";
import type { ManagerOption } from "@/src/types/manager";
import type { Team } from "@/src/types/team";
import { useAuth } from "@/src/components/auth-provider";
import { normalizePermissions } from "@/src/lib/access";
import { formatDate, formatDateTime } from "@/src/lib/formatters/date";
import { REP_ACCESS_ROLE_OPTIONS, normalizeRepAccessRole, repAccessRoleLabel, repRolePermissions, type RepAccessRole } from "@/src/lib/reps/access-role";

type RepForm = {
  displayName: string;
  email: string;
  phone: string;
  managerUid: string;
  managerName: string;
  teamId: string;
  locationId: string;
  locationName: string;
  salesIds: string;
  aliases: string;
  programIds: string;
  vendorType: "organic" | "subVendor";
  accessRole: RepAccessRole;
  weeklySalesGoal: string;
  weeklyKnocksGoal: string;
};

type Readiness = "ready" | "missing_email" | "missing_manager" | "missing_location" | "missing_sales_id" | "unknown";
type RosterStatus = Rep["status"] | "all";
type RosterFilters = { manager?: string; location?: string; vendor?: string; search?: string };
type LocationCreateTarget = "editor";

const blankForm: RepForm = {
  displayName: "",
  email: "",
  phone: "",
  managerUid: "",
  managerName: "",
  teamId: "",
  locationId: "",
  locationName: "",
  salesIds: "",
  aliases: "",
  programIds: "",
  vendorType: "organic",
  accessRole: "rep",
  weeklySalesGoal: "0",
  weeklyKnocksGoal: "0",
};

function split(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function formatApiError(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error !== "object") return fallback;
  const candidate = error as { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
  const fieldMessages = Object.entries(candidate.fieldErrors ?? {})
    .flatMap(([field, messages]) => (messages ?? []).filter(Boolean).map((message) => `${field}: ${message}`));
  const formMessages = (candidate.formErrors ?? []).filter(Boolean);
  return [...formMessages, ...fieldMessages][0] ?? fallback;
}

function currentWeekStart() {
  return toDateId(startOfWeek(new Date()));
}

function initials(value: string) {
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function readiness(rep: Rep): Readiness {
  const hasName = Boolean(rep.displayName.trim());
  const hasEmail = Boolean(rep.email.trim());
  const hasManager = Boolean(rep.managerName.trim() || rep.managerUid);
  const hasLocation = Boolean(rep.locationName.trim() || rep.locationId);
  const hasSales = rep.salesIds.length > 0 || rep.aliases.length > 0;
  if (hasName && hasEmail && hasManager && hasLocation && hasSales) return "ready";
  if (!hasEmail) return "missing_email";
  if (!hasManager) return "missing_manager";
  if (!hasLocation) return "missing_location";
  if (!hasSales) return "missing_sales_id";
  return "unknown";
}

function readinessLabel(value: Readiness) {
  switch (value) {
    case "ready": return "Ready";
    case "missing_email": return "Missing email";
    case "missing_manager": return "Missing manager";
    case "missing_location": return "Missing location";
    case "missing_sales_id": return "Missing sales ID";
    default: return "Needs review";
  }
}

function readinessVariant(value: Readiness): "success" | "warning" | "danger" | "secondary" | "outline" {
  switch (value) {
    case "ready": return "success";
    case "missing_email":
    case "missing_manager":
    case "missing_location":
    case "missing_sales_id":
      return "warning";
    default:
      return "secondary";
  }
}

function statusLabel(value: RosterStatus) {
  switch (value) {
    case "active": return "Active";
    case "inactive": return "Purgatory";
    case "terminated": return "Terminated";
    case "all": return "All";
  }
}

function statusVariant(value: Rep["status"]): "success" | "warning" | "danger" | "secondary" | "outline" {
  if (value === "active") return "success";
  if (value === "terminated") return "danger";
  return "warning";
}

function hasMissingSalesId(rep: Rep) {
  return rep.salesIds.length === 0;
}

function hasMissingLocation(rep: Rep) {
  return !rep.locationName.trim();
}

function hasMissingManager(rep: Rep) {
  return !rep.managerName.trim();
}

function duplicateValues(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.toLowerCase().trim(), (counts.get(item.toLowerCase().trim()) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([item]) => item);
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-2xl" />)}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function RosterPage() {
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<RosterStatus>("active");
  const [query, setQuery] = useState("");
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "displayName", desc: false }]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Rep | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingAccountRepUid, setCreatingAccountRepUid] = useState<string | null>(null);
  const [removeRep, setRemoveRep] = useState<Rep | null>(null);
  const [terminateRep, setTerminateRep] = useState<Rep | null>(null);
  const [restoreRep, setRestoreRep] = useState<Rep | null>(null);
  const [sendTerminationEmail, setSendTerminationEmail] = useState(true);
  const [aliasDraft, setAliasDraft] = useState("");
  const [addAliasTarget, setAddAliasTarget] = useState<Rep | null>(null);
  const [locationDialogRep, setLocationDialogRep] = useState<Rep | null>(null);
  const [managerDraft, setManagerDraft] = useState("");
  const [managerCreating, setManagerCreating] = useState(false);
  const [managerCreateOpen, setManagerCreateOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationCreating, setLocationCreating] = useState(false);
  const [locationCreateTarget, setLocationCreateTarget] = useState<LocationCreateTarget | null>(null);
  const [form, setForm] = useState<RepForm>(blankForm);
  const [managerFilter, setManagerFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [exportingRoster, setExportingRoster] = useState(false);

  const permissions = normalizePermissions(profile?.permissions);
  const canEdit = profile?.role === "superAdmin" || (profile?.role === "admin" && permissions.canEditRoster);
  const canManageRosterOptions = profile?.role === "superAdmin" || permissions.canManageRosterOptions;
  const canManageRepRoles = profile?.role === "superAdmin" || permissions.canManageRepRoles;
  const canCreateAccounts = profile?.role === "superAdmin" || (profile?.role === "admin" && permissions.canCreateUsers);
  const canAddAlias = profile?.role === "superAdmin";

  const request = useCallback((path: string, init?: RequestInit) => authedFetch(path, init), []);

  const loadRoster = useCallback(async (nextStatus: RosterStatus, nextFilters?: RosterFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", nextStatus);
      if (nextFilters?.manager && nextFilters.manager !== "all") params.set("manager", nextFilters.manager);
      if (nextFilters?.location && nextFilters.location !== "all") params.set("location", nextFilters.location);
      if (nextFilters?.vendor && nextFilters.vendor !== "all") params.set("vendor", nextFilters.vendor);
      if (nextFilters?.search?.trim()) params.set("search", nextFilters.search.trim());
      const response = await authedJson<{ reps: Rep[] }>(`/api/reps?${params.toString()}`);
      setReps(response.reps ?? []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load roster.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const currentRosterFilters = useCallback((): RosterFilters => ({ manager: managerFilter, location: locationFilter, vendor: vendorFilter, search: query }), [managerFilter, locationFilter, vendorFilter, query]);

  const refreshRoster = useCallback(async (nextStatus: RosterStatus = status) => {
    await loadRoster(nextStatus, currentRosterFilters());
  }, [currentRosterFilters, loadRoster, status]);

  useEffect(() => { void refreshRoster(status); }, [refreshRoster, status]);

  useEffect(() => {
    if (!selectedRep) return;
    const current = reps.find((rep) => rep.repUid === selectedRep.repUid);
    if (current) setSelectedRep(current);
    else setSelectedRep(null);
  }, [reps, selectedRep]);

  useEffect(() => {
    Promise.all([
      authedJson<{ locations: Location[] }>("/api/locations"),
      authedJson<{ managers: ManagerOption[] }>("/api/managers"),
      authedJson<{ teams: Team[] }>("/api/teams"),
    ]).then(([locationData, managerData, teamData]) => {
      setLocations(locationData.locations ?? []);
      setManagers(managerData.managers ?? []);
      setTeams((teamData.teams ?? []).filter((team) => team.active));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (searchParams.get("add") !== "1") return;
    setEditing(null);
    setForm({
      ...blankForm,
      displayName: searchParams.get("name") ?? "",
      salesIds: searchParams.get("salesId") ?? "",
      programIds: searchParams.get("program") ?? "",
    });
    setEditorOpen(true);
  }, [searchParams]);

  const repsSorted = useMemo(() => [...reps].sort((a, b) => a.displayName.localeCompare(b.displayName)), [reps]);
  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return repsSorted.filter((rep) => {
      const quality = readiness(rep);
      const matchesQuality = qualityFilter === "all"
        || (qualityFilter === "ready" && quality === "ready")
        || (qualityFilter === "missing_email" && !rep.email.trim())
        || (qualityFilter === "missing_manager" && hasMissingManager(rep))
        || (qualityFilter === "missing_location" && hasMissingLocation(rep))
        || (qualityFilter === "missing_sales_id" && hasMissingSalesId(rep));
      return (status === "all" || rep.status === status)
        && (!term || [rep.displayName, rep.email, rep.phone, rep.managerName, rep.locationName, rep.vendorType, ...rep.salesIds, ...rep.aliases].join(" ").toLowerCase().includes(term))
        && matchesQuality;
    });
  }, [repsSorted, query, status, qualityFilter]);

  const columns = useMemo<ColumnDef<Rep>[]>(() => [
    {
      accessorKey: "displayName",
      header: "Rep name",
      cell: ({ row }) => (
        <button className="flex items-center gap-3 text-left" onClick={() => setSelectedRep(row.original)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(row.original.displayName) || "AB"}</div>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email || "No email"} · {row.original.phone || "No phone"}</p>
          </div>
        </button>
      ),
    },
    { accessorKey: "managerName", header: "Manager", cell: ({ row }) => row.original.managerName || "—" },
    { accessorKey: "accessRole", header: "Role", cell: ({ row }) => <Badge variant="outline">{repAccessRoleLabel(row.original.accessRole)}</Badge> },
    { accessorKey: "locationName", header: "Location", cell: ({ row }) => row.original.locationName || "—" },
    { accessorKey: "vendorType", header: "Program / vendor", cell: ({ row }) => <Badge variant="outline">{row.original.vendorType}</Badge> },
    { accessorKey: "salesIds", header: "IDs / aliases", cell: ({ row }) => <span>{row.original.salesIds.length} / {row.original.aliases.length}</span> },
    { accessorKey: "weeklySalesGoal", header: "Sales goal", cell: ({ row }) => <span>{row.original.weeklySalesGoal || 0}</span> },
    { accessorKey: "weeklyKnocksGoal", header: "Knocks goal", cell: ({ row }) => <span>{(row.original as Rep & { weeklyKnocksGoal?: number }).weeklyKnocksGoal || 0}</span> },
    { accessorKey: "lastSaleDateId", header: "Last sale", cell: ({ row }) => row.original.status === "inactive" ? <span>{formatDate(row.original.lastSaleDateId) || "—"}</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{statusLabel(row.original.status)}</Badge> },
    { id: "readiness", header: "Account readiness", cell: ({ row }) => <Badge variant={readinessVariant(readiness(row.original))}>{readinessLabel(readiness(row.original))}</Badge> },
    { accessorKey: "updatedAt", header: "Last updated", cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateTime(row.original.updatedAt as string | Date | null | undefined)}</span> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setEditing(row.original); setForm(repToForm(row.original)); setEditorOpen(true); }}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button size="xs" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setLocationDialogRep(row.original); }}>
            <MapPin className="h-4 w-4" />
            Assign location
          </Button>
          <Button size="xs" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setSelectedRep(row.original); }}>
            Details
          </Button>
          {row.original.status === "active" ? (
            <>
              <Button size="xs" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setRemoveRep(row.original); }}>
                <UserMinus className="h-4 w-4" />
                Remove
              </Button>
              <Button size="xs" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setTerminateRep(row.original); }}>
                <UserRoundX className="h-4 w-4" />
                Terminate
              </Button>
            </>
          ) : (
            <Button size="xs" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); setRestoreRep(row.original); }}>
              <RotateCcw className="h-4 w-4" />
              Restore
            </Button>
          )}
        </div>
      ),
    },
  ], []);

  // TanStack Table's hook is intentionally left non-memoized for React Compiler compatibility.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function repToForm(rep: Rep): RepForm {
    return {
      displayName: rep.displayName,
      email: rep.email,
      phone: rep.phone ?? "",
      managerUid: rep.managerUid ?? "",
      managerName: rep.managerName ?? "",
      teamId: rep.teamId ?? "",
      locationId: rep.locationId ?? "",
      locationName: rep.locationName ?? "",
      salesIds: rep.salesIds.join(", "),
      aliases: rep.aliases.join(", "),
      programIds: rep.programIds.join(", "),
      vendorType: rep.vendorType ?? "organic",
      accessRole: normalizeRepAccessRole(rep.accessRole),
      weeklySalesGoal: String(rep.weeklySalesGoal ?? 0),
      weeklyKnocksGoal: String((rep as Rep & { weeklyKnocksGoal?: number }).weeklyKnocksGoal ?? 0),
    };
  }

  function correspondingTeam(managerUid: string, managerName: string) {
    const normalizedName = managerName.trim().toLowerCase().replace(/\s+/g, " ");
    const matches = teams.filter((team) => {
      if (!team.active) return false;
      const teamName = team.name.trim().toLowerCase().replace(/\s+/g, " ");
      const assignedManagerName = team.managerDetails?.displayName.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
      return team.managerRepUid === managerUid
        || (normalizedName && assignedManagerName === normalizedName)
        || (normalizedName && (teamName === normalizedName || teamName === `${normalizedName} team`));
    });
    return matches.length === 1 ? matches[0] : null;
  }

  async function downloadRoster() {
    setExportingRoster(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("quality", qualityFilter);
      if (managerFilter !== "all") params.set("manager", managerFilter);
      if (locationFilter !== "all") params.set("location", locationFilter);
      if (vendorFilter !== "all") params.set("vendor", vendorFilter);
      if (query.trim()) params.set("search", query.trim());
      const response = await request(`/api/reps/export?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(result?.error ? String(result.error) : "Unable to export roster.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `roster-export-${status}.xlsx`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success("Roster export downloaded.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to export roster.");
    } finally {
      setExportingRoster(false);
    }
  }

  async function saveRep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.displayName.trim()) {
      toast.error("Rep name is required.");
      return;
    }
    if (!form.locationId.trim() || !form.locationName.trim()) {
      toast.error("Location is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        managerUid: form.managerUid || null,
        managerName: form.managerName.trim(),
        teamId: form.teamId || null,
        locationId: form.locationId.trim(),
        locationName: form.locationName.trim(),
        programIds: split(form.programIds),
        vendorType: form.vendorType,
        accessRole: form.accessRole,
        weeklySalesGoal: Number(form.weeklySalesGoal || 0),
        weeklyKnocksGoal: Number(form.weeklyKnocksGoal || 0),
        salesIds: split(form.salesIds),
        aliases: split(form.aliases),
      };
      const response = await request(editing ? `/api/reps/${editing.repUid}` : "/api/reps", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(editing ? { action: "update", rep: payload } : payload),
      });
      const result = await response.json() as { error?: unknown; rep?: Rep };
      if (!response.ok) throw new Error(formatApiError(result.error, "Unable to save representative."));
      const savedRepUid = editing?.repUid ?? result.rep?.repUid;
      if (editing && savedRepUid && form.teamId !== (editing.teamId ?? "")) {
        await authedJson(`/api/reps/${savedRepUid}/team`, {
          method: "PATCH",
          body: JSON.stringify({ teamId: form.teamId || null }),
        });
      }
      toast.success(editing ? "Representative saved." : "Representative created.");
      setEditorOpen(false);
      setEditing(null);
      setForm(blankForm);
      await refreshRoster();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save representative.");
    } finally {
      setSaving(false);
    }
  }

  async function createLocation() {
    const name = locationDraft.trim();
    if (!name) return;
    setLocationCreating(true);
    try {
      const response = await request("/api/locations", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create location.");
      const created = result.location as Location;
      setLocations((current) => [...current.filter((item) => item.locationId !== created.locationId), created].sort((a, b) => a.name.localeCompare(b.name)));
      if (locationCreateTarget === "editor") {
        setForm((current) => ({ ...current, locationId: created.locationId, locationName: created.name }));
      }
      setLocationCreateTarget(null);
      setLocationDraft("");
      toast.success(`Location ${created.name} added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create location.");
    } finally {
      setLocationCreating(false);
    }
  }

  async function createManager() {
    const name = managerDraft.trim();
    if (!name) return;
    setManagerCreating(true);
    try {
      const response = await request("/api/managers", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const result = await response.json() as { error?: unknown; manager?: ManagerOption };
      if (!response.ok) throw new Error(formatApiError(result.error, "Unable to create manager."));
      if (!result.manager) throw new Error("The manager was created without a valid response.");
      const created = result.manager;
      setManagers((current) => [...current.filter((item) => item.managerUid !== created.managerUid), created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, managerUid: created.managerUid, managerName: created.name }));
      setManagerCreateOpen(false);
      setManagerDraft("");
      toast.success(`Manager ${created.name} added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create manager.");
    } finally {
      setManagerCreating(false);
    }
  }

  async function changeStatus(action: "remove" | "terminate" | "restore") {
    const target = action === "remove" ? removeRep : action === "terminate" ? terminateRep : restoreRep;
    if (!target) return;
    setSaving(true);
    try {
      const response = await request(`/api/reps/${target.repUid}`, {
        method: "PATCH",
        body: JSON.stringify(action === "terminate" ? { action, sendTerminationEmail } : { action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update status.");
      toast.success(action === "remove" ? "Representative moved to purgatory." : action === "terminate" ? "Representative terminated." : "Representative restored.");
      if (action === "terminate" && sendTerminationEmail) toast.info("Demo Mode", { description: "Email not sent" });
      setRemoveRep(null);
      setTerminateRep(null);
      setRestoreRep(null);
      await refreshRoster();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update status.");
    } finally {
      setSaving(false);
    }
  }

  async function addAlias(rep: Rep) {
    const alias = aliasDraft.trim();
    if (!alias) return;
    const existing = rep.aliases.map((value) => value.toLowerCase().trim());
    if (existing.includes(alias.toLowerCase().trim())) {
      toast.message("Alias already exists.");
      return;
    }
    setSaving(true);
    try {
      const response = await request(`/api/reps/${rep.repUid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "addAlias", alias }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add alias.");
      toast.success("Alias added.");
      setAliasDraft("");
      setAddAliasTarget(null);
      await refreshRoster();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to add alias.");
    } finally {
      setSaving(false);
    }
  }

  async function createAccount(rep: Rep) {
    if (!rep.displayName.trim() || !rep.email.trim()) {
      toast.error("Add the rep's name and contact email before creating an account.");
      return;
    }
    setCreatingAccountRepUid(rep.repUid);
    try {
      const response = await request(`/api/reps/${rep.repUid}/account`, { method: "POST" });
      const result = await response.json() as { error?: unknown; authUid?: string; accountStatus?: Rep["accountStatus"] };
      if (!response.ok) {
        const knownMessages: Record<string, string> = {
          ACCOUNT_ALREADY_LINKED: "This rep already has a linked account.",
          EMAIL_ALREADY_HAS_ACCOUNT: "That email is already used by another account.",
          NAME_AND_EMAIL_REQUIRED: "A name and email are required to create an account.",
          FORBIDDEN: "You do not have permission to create accounts.",
        };
        const code = typeof result.error === "string" ? result.error : "";
        throw new Error(knownMessages[code] ?? formatApiError(result.error, "Unable to create account."));
      }
      const updates: Partial<Rep> = { authUid: result.authUid ?? null, accountStatus: result.accountStatus ?? "active" };
      setReps((current) => current.map((item) => item.repUid === rep.repUid ? { ...item, ...updates } : item));
      setSelectedRep((current) => current?.repUid === rep.repUid ? { ...current, ...updates } : current);
      toast.success("Account created. No account email was sent.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create account.");
    } finally {
      setCreatingAccountRepUid(null);
    }
  }

  const activeCount = reps.filter((rep) => rep.status === "active").length;
  const inactiveCount = reps.filter((rep) => rep.status === "inactive").length;
  const terminatedCount = reps.filter((rep) => rep.status === "terminated").length;
  const missingSalesIdCount = reps.filter(hasMissingSalesId).length;
  const missingLocationCount = reps.filter(hasMissingLocation).length;
  const missingManagerCount = reps.filter(hasMissingManager).length;
  const readyCount = reps.filter((rep) => readiness(rep) === "ready").length;

  const managerFilterOptions = useMemo(() => Array.from(new Set(reps.map((rep) => rep.managerName).filter(Boolean))).sort(), [reps]);
  const locationFilterOptions = useMemo(() => Array.from(new Set(reps.map((rep) => rep.locationName).filter(Boolean))).sort(), [reps]);
  const vendorFilterOptions = useMemo(() => Array.from(new Set(reps.map((rep) => rep.vendorType).filter(Boolean))).sort(), [reps]);
  const cleanupIssues = useMemo(() => ({
    missingSalesId: reps.filter(hasMissingSalesId),
    duplicateNames: duplicateValues(reps.map((rep) => rep.displayName)),
    duplicateAliases: duplicateValues(reps.flatMap((rep) => rep.aliases)),
    missingManagers: reps.filter(hasMissingManager),
    missingLocations: reps.filter(hasMissingLocation),
  }), [reps]);

  const kpis = [
    { label: "Active reps", value: activeCount, detail: "Roster members currently active", icon: Users, accentColor: "var(--success)" },
    { label: "Purgatory", value: inactiveCount, detail: "Temporarily removed from active roster", icon: UserMinus, accentColor: "var(--warning)" },
    { label: "Terminated reps", value: terminatedCount, detail: "No longer with the organization", icon: UserRoundX, accentColor: "var(--destructive)" },
    { label: "Missing sales ID/alias", value: missingSalesIdCount, detail: "Needs a sales ID or alias to match imports", icon: CircleAlert, accentColor: "var(--warning)" },
    { label: "Missing location", value: missingLocationCount, detail: "No assigned location on file", icon: MapPin, accentColor: "var(--info)" },
    { label: "Missing manager", value: missingManagerCount, detail: "No assigned manager on file", icon: ShieldAlert, accentColor: "#8d7cd8" },
    { label: "Ready for account", value: readyCount, detail: "Meets all requirements for account creation", icon: BadgeCheck, accentColor: "#1baf7a" },
  ];

  if (loading && reps.length === 0) return <LoadingState />;

  if (error && reps.length === 0) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Roster unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      {error ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Roster loaded with warnings</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Roster Command Center</CardTitle>
              <CardDescription>Clean identity records for reps, aliases, readiness, and assignment workflows.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={downloadRoster} disabled={exportingRoster}>
                <Download className="h-4 w-4" />
                {exportingRoster ? "Exporting..." : "Download roster"}
              </Button>
              <Button size="sm" onClick={() => { setEditing(null); setForm(blankForm); setEditorOpen(true); }} disabled={!canEdit}>
                <Plus className="h-4 w-4" />
                Add rep
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <StatTile key={kpi.label} label={kpi.label} value={kpi.value} detail={kpi.detail} icon={kpi.icon} accentColor={kpi.accentColor} />
            ))}
          </div>
          <div className="grid gap-2 lg:grid-cols-[1.4fr_.6fr_.6fr_.6fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-10 pl-9" placeholder="Search rep name, email, phone, manager, location, alias, sales ID" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Purgatory</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={qualityFilter} onValueChange={setQualityFilter}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Data quality" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All quality states</SelectItem>
                <SelectItem value="missing_sales_id">Missing sales ID</SelectItem>
                <SelectItem value="missing_manager">Missing manager</SelectItem>
                <SelectItem value="missing_location">Missing location</SelectItem>
                <SelectItem value="ready">Ready for account</SelectItem>
              </SelectContent>
            </Select>
            <Tabs value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Purgatory</TabsTrigger>
                <TabsTrigger value="terminated">Terminated</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {managerFilterOptions.map((manager) => <SelectItem key={manager} value={manager}>{manager}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locationFilterOptions.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Vendor / program" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {vendorFilterOptions.map((vendor) => <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">Roster cleanup</CardTitle>
            <CardDescription>Click an issue to focus the roster on that cleanup task.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 p-4 pt-0 md:grid-cols-2 sm:p-5 sm:pt-0">
            <CleanupCard title="Missing sales IDs" count={cleanupIssues.missingSalesId.length} icon={CircleAlert} onClick={() => setQualityFilter("missing_sales_id")} />
            <CleanupCard title="Duplicate names" count={cleanupIssues.duplicateNames.length} icon={Users} onClick={() => setQualityFilter("all")} />
            <CleanupCard title="Duplicate aliases" count={cleanupIssues.duplicateAliases.length} icon={Link2} onClick={() => setQualityFilter("all")} />
            <CleanupCard title="Missing managers" count={cleanupIssues.missingManagers.length} icon={ShieldAlert} onClick={() => setQualityFilter("missing_manager")} />
            <CleanupCard title="Missing locations" count={cleanupIssues.missingLocations.length} icon={MapPin} onClick={() => setQualityFilter("missing_location")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">Account readiness</CardTitle>
            <CardDescription>Frontend-only readiness state for account creation workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="rounded-2xl border border-border/70 p-3">
              <p className="text-sm text-muted-foreground">Ready reps</p>
              <p className="mt-1 text-xl font-semibold">{readyCount}</p>
            </div>
            <Progress value={reps.length ? Math.round((readyCount / reps.length) * 100) : 0} />
            <p className="text-sm text-muted-foreground">A rep is ready when they have name, email, manager, location, and at least one sales ID or alias.</p>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <CardTitle className="text-base sm:text-lg">{status === "all" ? "All reps" : `${statusLabel(status)} reps`}</CardTitle>
            <CardDescription>{filtered.length} matching records.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setQualityFilter("all")}>Reset quality filter</Button>
            <Button size="sm" variant="outline" onClick={() => setQuery("")}>Clear search</Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedRep(row.original)}>
                      {row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={12}><EmptyState title="No matching reps" description="Try clearing filters or adding a new representative." action={<Button onClick={() => { setEditorOpen(true); setEditing(null); setForm(blankForm); }}>Add rep</Button>} /></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="grid gap-2 p-4 md:hidden">
            {filtered.length ? filtered.map((rep) => (
              <Card key={rep.repUid}>
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setSelectedRep(rep)}>
                      <p className="font-medium">{rep.displayName}</p>
                      <p className="text-sm text-muted-foreground">{rep.email || "No email"} · {rep.phone || "No phone"}</p>
                    </button>
                    <Badge variant={statusVariant(rep.status)}>{statusLabel(rep.status)}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <p>Manager: {rep.managerName || "—"}</p>
                    <p>Role: {repAccessRoleLabel(rep.accessRole)}</p>
                    <p>Location: {rep.locationName || "—"}</p>
                    {rep.status === "inactive" ? <p>Last sale: {formatDate(rep.lastSaleDateId) || "—"}</p> : null}
                <p>Sales goal: {rep.weeklySalesGoal || 0}</p>
                <p>Knocks goal: {(rep as Rep & { weeklyKnocksGoal?: number }).weeklyKnocksGoal || 0}</p>
                <p>Readiness: {readinessLabel(readiness(rep))}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedRep(rep)}>Profile</Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(rep); setForm(repToForm(rep)); setEditorOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setLocationDialogRep(rep)}>Assign location</Button>
                    {rep.status === "active" ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setRemoveRep(rep)}>Remove</Button>
                        <Button size="sm" variant="ghost" onClick={() => setTerminateRep(rep)}>Terminate</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setRestoreRep(rep)}>Restore</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )) : <EmptyState title="No matching reps" description="Try clearing filters or adding a new representative." />}
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedRep)} onOpenChange={(open) => !open && setSelectedRep(null)}>
        <SheetContent className="w-full sm:max-w-2xl">
          {selectedRep && (
            <ScrollArea className="h-full pr-4">
              <SheetHeader>
                <SheetTitle>{selectedRep.displayName}</SheetTitle>
                <SheetDescription>{statusLabel(selectedRep.status)} · {selectedRep.managerName || "No manager"} · {selectedRep.locationName || "No location"}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 py-5">
                <section className="grid gap-3 md:grid-cols-2">
                  <ProfileCard title="Identity">
                    <p>Name: {selectedRep.displayName}</p>
                    <p>Phone: {selectedRep.phone || "—"}</p>
                    <p>Email: {selectedRep.email || "—"}</p>
                    <p>Status: {statusLabel(selectedRep.status)}</p>
                    {selectedRep.status === "inactive" ? <p>Last sale: {formatDate(selectedRep.lastSaleDateId) || "—"}</p> : null}
                    <p>Added: {formatDate(selectedRep.createdAt)}</p>
                  </ProfileCard>
                  <ProfileCard title="Organization">
                    <p>Manager: {selectedRep.managerName || "—"}</p>
                    <p>Location: {selectedRep.locationName || "—"}</p>
                    <p>Program/vendor: {selectedRep.vendorType}</p>
                  </ProfileCard>
                </section>
                <ProfileCard title="Sales matching">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Primary sales ID: {selectedRep.salesIds[0] || "None"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRep.salesIds.map((id) => <Badge key={id} variant="secondary">{id}</Badge>)}
                    {selectedRep.aliases.map((alias) => <Badge key={alias} variant="outline">{alias}</Badge>)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canAddAlias ? <Button size="sm" onClick={() => { setAddAliasTarget(selectedRep); setAliasDraft(""); }}>Add alias</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => { setEditing(selectedRep); setForm(repToForm(selectedRep)); setEditorOpen(true); }}>Edit rep</Button>
                  </div>
                </ProfileCard>
                <ProfileCard title="Goals">
                  <p>Sales goal: {selectedRep.weeklySalesGoal || 0}</p>
                  <p>Knocks goal: {(selectedRep as Rep & { weeklyKnocksGoal?: number }).weeklyKnocksGoal || 0}</p>
                  <p className="text-sm text-muted-foreground">Monthly goal: placeholder until backend supports a dedicated monthly field.</p>
                </ProfileCard>
                <ProfileCard title="Account access">
                  <Badge variant={selectedRep.authUid ? (selectedRep.accountStatus === "active" ? "success" : "warning") : "secondary"}>
                    {selectedRep.authUid ? "Account created" : "No account"}
                  </Badge>
                  <p className="mt-2 text-sm text-muted-foreground">Account creation uses this rep&apos;s name and contact email. It does not send an email yet.</p>
                  <p className="mt-2 text-sm">Role: {repAccessRoleLabel(selectedRep.accessRole)}</p>
                  <p className="text-sm text-muted-foreground">Dashboard scope: {repRolePermissions(selectedRep.accessRole).dashboardScope}</p>
                  {!selectedRep.authUid && canCreateAccounts ? <Button className="mt-3" size="sm" onClick={() => void createAccount(selectedRep)} disabled={creatingAccountRepUid === selectedRep.repUid || !selectedRep.displayName.trim() || !selectedRep.email.trim()}>{creatingAccountRepUid === selectedRep.repUid ? "Creating account..." : "Create account"}</Button> : null}
                  {!selectedRep.authUid && (!selectedRep.displayName.trim() || !selectedRep.email.trim()) ? <p className="text-xs text-warning">Add a name and email to enable account creation.</p> : null}
                </ProfileCard>
                <ProfileCard title="Notes / audit">
                  <p>Created: {formatDateTime(selectedRep.createdAt)}</p>
                  <p>Updated: {formatDateTime(selectedRep.updatedAt)}</p>
                  <p>Reactivated: {formatDateTime(selectedRep.reactivatedAt)}</p>
                  <p className="pt-2 text-sm text-muted-foreground">Notes and audit history are not backed by a dedicated endpoint yet.</p>
                </ProfileCard>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => { setEditing(selectedRep); setForm(repToForm(selectedRep)); setEditorOpen(true); }}>Edit rep</Button>
                  {selectedRep.status === "active" ? (
                    <>
                      <Button variant="outline" onClick={() => setRemoveRep(selectedRep)}>Remove from roster</Button>
                      <Button variant="destructive" onClick={() => setTerminateRep(selectedRep)}>Terminate</Button>
                    </>
                  ) : <Button variant="outline" onClick={() => setRestoreRep(selectedRep)}>Restore</Button>}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit representative" : "Add representative"}</DialogTitle>
            <DialogDescription className="sr-only">Edit representative roster details.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void saveRep(event)}>
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
              <Field label="Name">
                <Input placeholder="Full name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
              </Field>
              <Field label="Vendor / program">
                <Select value={form.vendorType} onValueChange={(value) => setForm({ ...form, vendorType: value as RepForm["vendorType"] })}>
                  <SelectTrigger><SelectValue placeholder="Select vendor type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organic">Organic</SelectItem>
                    <SelectItem value="subVendor">Sub-vendor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dashboard role">
                <Select value={form.accessRole} onValueChange={(value) => setForm({ ...form, accessRole: value as RepAccessRole })} disabled={!canManageRepRoles}>
                  <SelectTrigger><SelectValue placeholder="Select dashboard role" /></SelectTrigger>
                  <SelectContent>{REP_ACCESS_ROLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Programs"><Input placeholder="ATT, T-Fiber" value={form.programIds} onChange={(event) => setForm({ ...form, programIds: event.target.value })} /></Field>
              <Field label="Contact email"><Input type="email" placeholder="name@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Phone"><Input type="tel" placeholder="(555) 555-5555" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              <Field label="Manager">
                <div className="flex gap-2">
                  <Select value={form.managerUid || "__none__"} onValueChange={(value) => {
                    const manager = value === "__none__" ? null : managers.find((item) => item.managerUid === value) ?? null;
                    const team = manager ? correspondingTeam(manager.managerUid, manager.name) : null;
                    setForm({ ...form, managerUid: manager?.managerUid ?? "", managerName: manager?.name ?? "", teamId: team?.teamId ?? "" });
                  }}>
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No manager</SelectItem>
                      {managers.map((manager) => <SelectItem key={manager.managerUid} value={manager.managerUid}>{manager.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {canManageRosterOptions ? <Button type="button" variant="outline" className="shrink-0" onClick={() => { setManagerDraft(""); setManagerCreateOpen(true); }}><Plus className="h-4 w-4" /> Add</Button> : null}
                </div>
              </Field>
              <Field label="Team">
                <Select value={form.teamId || "__none__"} onValueChange={(value) => setForm({ ...form, teamId: value === "__none__" ? "" : value })}>
                  <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No team</SelectItem>
                    {teams.map((team) => <SelectItem key={team.teamId} value={team.teamId}>{team.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Location">
                <div className="flex gap-2">
                  <Select value={form.locationId} onValueChange={(value) => setForm({ ...form, locationId: value, locationName: locations.find((item) => item.locationId === value)?.name ?? "" })}>
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {canManageRosterOptions ? <Button type="button" variant="outline" className="shrink-0" onClick={() => { setLocationCreateTarget("editor"); setLocationDraft(""); }}><Plus className="h-4 w-4" /> Add</Button> : null}
                </div>
              </Field>
              <Field label="Sales IDs">
                <Input placeholder="ID123, ID456" value={form.salesIds} onChange={(event) => setForm({ ...form, salesIds: event.target.value })} />
              </Field>
              <Field label="Aliases">
                <Input placeholder="Alternate name, nickname" value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} />
              </Field>
              <Field label="Weekly sales goal"><Input type="number" min={0} placeholder="0" value={form.weeklySalesGoal} onChange={(event) => setForm({ ...form, weeklySalesGoal: event.target.value })} /></Field>
              <Field label="Weekly knocks goal"><Input type="number" min={0} placeholder="0" value={form.weeklyKnocksGoal} onChange={(event) => setForm({ ...form, weeklyKnocksGoal: event.target.value })} /></Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Create representative"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={managerCreateOpen} onOpenChange={(open) => {
        if (managerCreating) return;
        setManagerCreateOpen(open);
        if (!open) setManagerDraft("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add manager</DialogTitle>
            <DialogDescription>Create a manager and assign them to this representative.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="roster-manager-name">Manager name</Label>
            <Input id="roster-manager-name" value={managerDraft} onChange={(event) => setManagerDraft(event.target.value)} placeholder="New manager name" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={managerCreating} onClick={() => setManagerCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void createManager()} disabled={managerCreating || managerDraft.trim().length < 2}>
              {managerCreating ? "Adding..." : "Add manager"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(addAliasTarget)} onOpenChange={(open) => !open && setAddAliasTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add alias</DialogTitle>
            <DialogDescription>{addAliasTarget ? `Add a new alias for ${addAliasTarget.displayName}.` : "Choose a rep first."}</DialogDescription>
          </DialogHeader>
          <Input value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="Alias name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAliasTarget(null)}>Cancel</Button>
            <Button onClick={() => addAliasTarget ? void addAlias(addAliasTarget) : undefined} disabled={!aliasDraft.trim() || saving}>Save alias</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignLocationDialog
        open={Boolean(locationDialogRep)}
        onOpenChange={(open) => !open && setLocationDialogRep(null)}
        rep={locationDialogRep ? { repUid: locationDialogRep.repUid, displayName: locationDialogRep.displayName } : null}
        locations={locations}
        defaultWeekStart={currentWeekStart()}
        onSaved={() => void refreshRoster()}
      />

      <Dialog open={Boolean(locationCreateTarget)} onOpenChange={(open) => {
        if (open) return;
        setLocationCreateTarget(null);
        setLocationDraft("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add location</DialogTitle>
            <DialogDescription>Create a location and use it immediately in this workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="roster-location-name">Location name</Label>
            <Input id="roster-location-name" value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} placeholder="New location name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setLocationCreateTarget(null);
              setLocationDraft("");
            }}>Cancel</Button>
            <Button onClick={() => void createLocation()} disabled={locationCreating || !locationDraft.trim()}>
              {locationCreating ? "Adding..." : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeRep)} onOpenChange={(open) => !open && setRemoveRep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from roster</DialogTitle>
            <DialogDescription>
              This moves the rep to purgatory. It keeps their history and login intact, sends no termination email, and they will reactivate automatically if a future import matches a sale to them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveRep(null)}>Cancel</Button>
            <Button onClick={() => void changeStatus("remove")} disabled={saving}>{saving ? "Working..." : "Remove"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(terminateRep)} onOpenChange={(open) => !open && setTerminateRep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate representative</DialogTitle>
            <DialogDescription>Roster history remains intact. The linked account will be disabled if one exists.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendTerminationEmail} onCheckedChange={(value) => setSendTerminationEmail(!!value)} />
            Queue termination email
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateRep(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void changeStatus("terminate")} disabled={saving}>{saving ? "Working..." : "Terminate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(restoreRep)} onOpenChange={(open) => !open && setRestoreRep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore representative</DialogTitle>
            <DialogDescription>This reactivates the roster record and any linked login if present.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreRep(null)}>Cancel</Button>
            <Button onClick={() => void changeStatus("restore")} disabled={saving}>{saving ? "Working..." : "Restore"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 text-sm">
      <span className="block font-medium">{label}</span>
      {helper ? <span className="block text-xs text-muted-foreground">{helper}</span> : null}
      {children}
    </label>
  );
}

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function CleanupCard({ title, count, icon: Icon, onClick }: { title: string; count: number; icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-border/70 p-3 text-left transition-colors hover:bg-muted/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-semibold">{count}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Icon className="h-4 w-4" /></div>
      </div>
    </button>
  );
}
