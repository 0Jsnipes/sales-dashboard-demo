"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import type {
  LocationAssignmentScope,
  LocationSource,
  RepLocationAssignment,
  ResolvedLocation,
} from "@/src/lib/reps/location-assignments";

export type AssignLocationRepTarget = { repUid: string; displayName: string };
export type AssignLocationOption = { locationId: string; name: string };
export type AssignLocationSavedResult = {
  repUid: string;
  weekStart: string;
  scope: LocationAssignmentScope;
  locationId: string;
  locationName: string;
};

type ResolveResponse = { resolved: ResolvedLocation; supersededBy: RepLocationAssignment | null };
type SaveResponse = { assignment: RepLocationAssignment; supersededBy: RepLocationAssignment | null };

function weekStartOptions(anchorWeekStart: string) {
  const anchor = new Date(`${anchorWeekStart}T12:00:00`);
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() + (index - 4) * 7);
    const monday = startOfWeek(date);
    return {
      value: toDateId(monday),
      label: `Week of ${monday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
    };
  });
}

function sourceLabel(source: LocationSource) {
  if (source === "week_override") return "explicit override for this week";
  if (source === "forward_assignment") return "forward assignment";
  if (source === "rep_default") return "rep's default location";
  return "unassigned";
}

function scopeLabel(scope: LocationAssignmentScope) {
  return scope === "week_only" ? "this week only" : "this week and going forward";
}

function weekLabel(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return weekStart;
  return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function AssignLocationDialog({
  open,
  onOpenChange,
  rep,
  locations,
  defaultWeekStart,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rep: AssignLocationRepTarget | null;
  locations: AssignLocationOption[];
  defaultWeekStart: string;
  onSaved: (result: AssignLocationSavedResult) => void;
}) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [scope, setScope] = useState<LocationAssignmentScope>("forward");
  const [locationId, setLocationId] = useState("");
  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);
  const [supersededBy, setSupersededBy] = useState<RepLocationAssignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a clean slate every time the dialog is opened for a (possibly
  // different) rep, anchored on whatever week the host page is currently
  // showing. Adjusting state during render (React's documented pattern for
  // "reset state when a prop changes") rather than in an effect, so there is
  // no extra render pass and no synchronous setState-in-effect.
  const openKey = open && rep?.repUid ? `${rep.repUid}:${defaultWeekStart}` : null;
  const [resetForKey, setResetForKey] = useState<string | null>(null);
  if (openKey !== null && openKey !== resetForKey) {
    setResetForKey(openKey);
    setWeekStart(defaultWeekStart);
    setScope("forward");
    setLocationId("");
    setError(null);
  }

  const requestKey = open && rep?.repUid && weekStart ? `${rep.repUid}:${weekStart}` : null;
  const [resolvedForKey, setResolvedForKey] = useState<string | null>(null);
  const resolving = requestKey !== null && resolvedForKey !== requestKey;

  useEffect(() => {
    if (!requestKey || !rep?.repUid) return;
    let active = true;
    authedJson<ResolveResponse>(`/api/reps/${rep.repUid}/location?weekStart=${weekStart}`)
      .then((value) => {
        if (!active) return;
        setResolved(value.resolved);
        setSupersededBy(value.supersededBy);
        setResolvedForKey(requestKey);
      })
      .catch(() => {
        if (!active) return;
        setResolved(null);
        setSupersededBy(null);
        setResolvedForKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [requestKey, rep?.repUid, weekStart]);

  const weekOptions = useMemo(() => weekStartOptions(defaultWeekStart), [defaultWeekStart]);
  const selectedLocationName = locations.find((item) => item.locationId === locationId)?.name ?? "";
  const canSave = Boolean(rep && weekStart && locationId) && !saving;

  async function handleSave() {
    if (!rep || !weekStart || !locationId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const nextLocationName = locations.find((item) => item.locationId === locationId)?.name ?? "";
      const response = await authedFetch(`/api/reps/${rep.repUid}/location`, {
        method: "POST",
        body: JSON.stringify({ weekStart, locationId, locationName: nextLocationName, scope }),
      });
      const result = (await response.json()) as SaveResponse & { error?: unknown };
      if (!response.ok) {
        const message = typeof result.error === "string" ? result.error : "Unable to save the location assignment.";
        throw new Error(message);
      }
      toast.success("Location assignment saved.");
      onSaved({ repUid: rep.repUid, weekStart, scope, locationId, locationName: nextLocationName });
      onOpenChange(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to save the location assignment.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign location</DialogTitle>
          <DialogDescription>Change the representative&apos;s location for a specific week or forward from that week.</DialogDescription>
        </DialogHeader>

        {rep ? (
          <div className="grid gap-4">
            <p className="text-sm font-medium">{rep.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {resolving ? "Loading current location..." : resolved ? `Currently: ${resolved.locationName || "Unassigned"} (${sourceLabel(resolved.source)})` : "Currently: unknown"}
            </p>

            <div className="space-y-2">
              <Label htmlFor="assign-location-week">Week</Label>
              <Select value={weekStart} onValueChange={setWeekStart}>
                <SelectTrigger id="assign-location-week"><SelectValue /></SelectTrigger>
                <SelectContent>{weekOptions.map((week) => <SelectItem key={week.value} value={week.value}>{week.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-location-location">Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="assign-location-location"><SelectValue placeholder="Choose location" /></SelectTrigger>
                <SelectContent>{locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-location-scope">Apply</Label>
              <Select value={scope} onValueChange={(value) => setScope(value as LocationAssignmentScope)}>
                <SelectTrigger id="assign-location-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forward">This week and going forward</SelectItem>
                  <SelectItem value="week_only">This week only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "forward" && supersededBy ? (
              <Alert variant="warning">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Later override in place</AlertTitle>
                <AlertDescription>
                  {weekLabel(supersededBy.weekStart)} already has its own explicit location ({supersededBy.locationName}). This change
                  won&apos;t affect that week — it stays put unless you edit it directly.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
              <p>
                Move <span className="font-medium">{rep.displayName}</span> to{" "}
                <span className="font-medium">{selectedLocationName || "—"}</span> for {weekLabel(weekStart).toLowerCase()}, {scopeLabel(scope)}.
              </p>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>{saving ? "Saving..." : "Save assignment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
