"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CalendarDays, Clock3, Search, Save, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { normalizeSaleOutcome, saleOutcomeLabel } from "@/src/lib/sales/outcomes";

type Rep = {
  repUid: string;
  displayName: string;
  managerName: string;
  locationName: string;
  salesIds?: string[];
  aliases?: string[];
};

type BackfillDraft = {
  repUid: string;
  provider: "att" | "tfiber" | "frontier";
  orderDateId: string;
  accountStatus: string;
  orderId: string;
  notes: string;
  customerName: string;
  productName: string;
  estimatedInstallDate: string;
  actualInstallDate: string;
};

const providerOptions = [
  { value: "att", label: "AT&T" },
  { value: "tfiber", label: "T-Fiber" },
  { value: "frontier", label: "Frontier" },
] as const;

const initialDraft: BackfillDraft = {
  repUid: "",
  provider: "att",
  orderDateId: "",
  accountStatus: "Manual entry",
  orderId: "",
  notes: "",
  customerName: "",
  productName: "",
  estimatedInstallDate: "",
  actualInstallDate: "",
};

function LoadingState() {
  return (
    <Card className="border-border/70">
      <CardContent className="space-y-4 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-11 rounded-2xl" />)}
        </div>
      </CardContent>
    </Card>
  );
}

function formatProvider(value: BackfillDraft["provider"]) {
  return providerOptions.find((item) => item.value === value)?.label ?? value;
}

function daysFromToday(dateValue: string) {
  if (!dateValue) return null;
  const value = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(value.valueOf())) return null;
  return Math.floor((Date.now() - value.valueOf()) / 86400000);
}

export function BackfillPage() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [repsError, setRepsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningKnockLcpBackfill, setRunningKnockLcpBackfill] = useState(false);
  const [knockLcpBackfillSummary, setKnockLcpBackfillSummary] = useState<{ processedUploads: number; updatedDocs: number; daysTouched: number } | null>(null);
  const [draft, setDraft] = useState<BackfillDraft>(initialDraft);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [repOpen, setRepOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canRunBackfill);
  const selectedRep = reps.find((rep) => rep.repUid === draft.repUid) ?? null;
  const outcomePreview = useMemo(() => {
    const rawData = {
      "Account Status": draft.accountStatus,
      "Install Date": draft.actualInstallDate,
      "Estimated Install Date": draft.estimatedInstallDate,
    };
    return saleOutcomeLabel(normalizeSaleOutcome({
      orderUid: "preview",
      orderDateId: draft.orderDateId,
      provider: draft.provider,
      accountStatus: draft.accountStatus,
      installationDateId: draft.actualInstallDate || null,
      estimatedInstallationDateId: draft.estimatedInstallDate || null,
      rawData,
    }));
  }, [draft.accountStatus, draft.actualInstallDate, draft.estimatedInstallDate, draft.orderDateId, draft.provider]);

  useEffect(() => {
    let active = true;
    authedJson<{ reps: Rep[] }>("/api/reps?status=active")
      .then((value) => {
        if (!active) return;
        setReps(value.reps ?? []);
        setRepsError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load reps.";
        setRepsError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function validate(next: BackfillDraft) {
    const issues: string[] = [];
    if (!next.repUid) issues.push("Select a rep.");
    if (!next.provider) issues.push("Select a provider/program.");
    if (!next.orderDateId) issues.push("Sale date is required.");
    if (!next.notes.trim()) issues.push("Notes / reason are required.");
    if (next.estimatedInstallDate && next.orderDateId && next.estimatedInstallDate < next.orderDateId) {
      issues.push("Estimated install date should not be before the sale date.");
    }
    if (next.actualInstallDate && next.orderDateId && next.actualInstallDate < next.orderDateId) {
      issues.push("Actual install date should not be before the sale date.");
    }
    const age = daysFromToday(next.orderDateId);
    if (age != null && age > 180) issues.push("This sale date is far in the past. Confirm the correction is intentional.");
    if (next.orderId && next.orderId.trim().length > 0 && next.orderId.trim().length < 3) issues.push("Order number looks unusually short.");
    setWarnings(issues.filter((item) => item.includes("far in the past") || item.includes("looks unusually short")));
    return issues;
  }

  function openReview() {
    const issues = validate(draft);
    setFormError(issues.find((issue) => !issue.includes("far in the past") && !issue.includes("looks unusually short")) ?? null);
    if (issues.some((issue) => !issue.includes("far in the past") && !issue.includes("looks unusually short"))) {
      toast.error("Please fix the required fields before reviewing.");
      return;
    }
    setFormError(null);
    setReviewOpen(true);
  }

  async function submit() {
    const issues = validate(draft);
    const blockers = issues.filter((issue) => !issue.includes("far in the past") && !issue.includes("looks unusually short"));
    if (blockers.length) {
      setFormError(blockers[0] ?? "Please review the form.");
      toast.error(blockers[0] ?? "Please review the form.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await authedFetch("/api/backfill", {
        method: "POST",
        body: JSON.stringify({
          repUid: draft.repUid,
          orderDateId: draft.orderDateId,
          provider: draft.provider,
          accountStatus: draft.accountStatus,
          orderId: draft.orderId || undefined,
          notes: draft.notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to record sale.");
      toast.success("Manual sale saved.");
      setDraft(initialDraft);
      setReviewOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to record sale.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function runKnockLcpBackfill() {
    setRunningKnockLcpBackfill(true);
    try {
      const response = await authedFetch("/api/knocks/backfill-lcp", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to backfill knock LCPs.");
      setKnockLcpBackfillSummary(result.summary ?? null);
      toast.success("Knock LCP backfill completed.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to backfill knock LCPs.";
      toast.error(message);
    } finally {
      setRunningKnockLcpBackfill(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Backfill</CardTitle>
            <CardDescription>Add or correct sales records manually with review-friendly details.</CardDescription>
          </div>
          <Badge variant="outline">Admin-only</Badge>
        </CardHeader>
      </Card>

      {!allowed ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Your role cannot record backfill sales.
          </CardContent>
        </Card>
      ) : null}

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Use carefully</AlertTitle>
        <AlertDescription>Manual entries affect reporting. Imported reports should remain the primary source whenever possible, and backfilled records should include notes or a reason.</AlertDescription>
      </Alert>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Manual sale entry", text: "Create or correct one sales record at a time." },
          { label: "Correction workflow", text: "Review details before saving to reporting." },
          { label: "Reporting impact", text: "Manual entries flow into WTD, MTD, and performance views." },
          { label: "Audit note", text: "createdBy and audit metadata are backend-managed. Audit history card is coming soon." },
        ].map((item) => (
          <Card key={item.label} className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-lg">{item.text}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader>
            <CardTitle>Manual sale form</CardTitle>
            <CardDescription>Rep & organization, sale details, install / outcome, reporting date, and notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Rep & Organization</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rep">Rep</Label>
                  <Popover open={repOpen} onOpenChange={setRepOpen}>
                    <PopoverTrigger asChild>
                      <Button id="rep" variant="outline" className="w-full justify-between">
                        {selectedRep ? selectedRep.displayName : "Select rep"}
                        <Search className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(92vw,420px)] p-0">
                      <Command>
                        <CommandInput placeholder="Search reps" />
                        <CommandList>
                          <CommandEmpty>No reps found.</CommandEmpty>
                          <CommandGroup>
                            {reps.map((rep) => (
                              <CommandItem
                                key={rep.repUid}
                                value={rep.displayName}
                                onSelect={() => {
                                  setDraft((current) => ({ ...current, repUid: rep.repUid }));
                                  setRepOpen(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span>{rep.displayName}</span>
                                  <span className="text-xs text-muted-foreground">{rep.managerName} · {rep.locationName}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {repsError && <p className="text-sm text-danger">{repsError}</p>}
                  {selectedRep && (
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{selectedRep.displayName}</p>
                      <p className="text-muted-foreground">Manager: {selectedRep.managerName || "—"}</p>
                      <p className="text-muted-foreground">Location: {selectedRep.locationName || "—"}</p>
                      <p className="text-muted-foreground">Sales IDs / aliases: {(selectedRep.salesIds ?? []).length + (selectedRep.aliases ?? []).length}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Sale Details</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider / program</Label>
                  <Select value={draft.provider} onValueChange={(value) => setDraft((current) => ({ ...current, provider: value as BackfillDraft["provider"] }))}>
                    <SelectTrigger id="provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {providerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderDateId">Sale date</Label>
                  <Input id="orderDateId" type="date" value={draft.orderDateId} onChange={(event) => setDraft((current) => ({ ...current, orderDateId: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer / account name</Label>
                  <Input id="customerName" value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} placeholder="Optional, not submitted to API yet" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderId">Account / order number</Label>
                  <Input id="orderId" value={draft.orderId} onChange={(event) => setDraft((current) => ({ ...current, orderId: event.target.value }))} placeholder="Optional" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="productName">Product / package</Label>
                  <Input id="productName" value={draft.productName} onChange={(event) => setDraft((current) => ({ ...current, productName: event.target.value }))} placeholder="Optional, not submitted to API yet" />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Install / Outcome Details</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="estimatedInstallDate">Estimated install date</Label>
                  <Input id="estimatedInstallDate" type="date" value={draft.estimatedInstallDate} onChange={(event) => setDraft((current) => ({ ...current, estimatedInstallDate: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualInstallDate">Actual install date</Label>
                  <Input id="actualInstallDate" type="date" value={draft.actualInstallDate} onChange={(event) => setDraft((current) => ({ ...current, actualInstallDate: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="accountStatus">Current outcome/status</Label>
                  <Select value={draft.accountStatus} onValueChange={(value) => setDraft((current) => ({ ...current, accountStatus: value }))}>
                    <SelectTrigger id="accountStatus"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      {["pending", "installed", "past_due", "preorder", "canceled", "churned", "unknown"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Past due is generally derived from the install date, not forced manually.</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Reporting Date</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                Sale date controls the reporting period. WTD / MTD performance updates automatically after save.
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="notes">Notes / reason</Label>
              <Textarea id="notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Explain why this backfill is needed." />
              <p className="text-xs text-muted-foreground">This is required so the correction remains review-friendly.</p>
            </div>

            {formError && <div className="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{formError}</div>}
            {warnings.length ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                {warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">Manual entries affect reporting</Badge>
              <Button onClick={openReview} disabled={!allowed}>
                <Save className="h-4 w-4" />
                Review and submit
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 overflow-hidden">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Knock LCP pull</CardTitle>
              <CardDescription>Temporary tool to repopulate T-Fiber LCPs from historical knock uploads stored in Firebase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                This reads prior `knockImport` files from Storage and writes `lcps` onto historical `knockDaily` records so the knocks LCP filter can populate.
              </div>
              {knockLcpBackfillSummary ? (
                <div className="rounded-2xl border border-border/70 p-4 text-sm">
                  <p><span className="font-medium">Uploads processed:</span> {knockLcpBackfillSummary.processedUploads}</p>
                  <p><span className="font-medium">Rep/day docs updated:</span> {knockLcpBackfillSummary.updatedDocs}</p>
                  <p><span className="font-medium">Days touched:</span> {knockLcpBackfillSummary.daysTouched}</p>
                </div>
              ) : null}
              <Button className="w-full" onClick={() => void runKnockLcpBackfill()} disabled={!allowed || runningKnockLcpBackfill}>
                {runningKnockLcpBackfill ? "Pulling LCPs..." : "Pull historical knock LCPs"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Confirmation preview</CardTitle>
              <CardDescription>Review before saving the manual sale.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PreviewRow label="Rep" value={selectedRep?.displayName ?? "—"} />
              <PreviewRow label="Provider" value={formatProvider(draft.provider)} />
              <PreviewRow label="Sale date" value={draft.orderDateId || "—"} />
              <PreviewRow label="Status / outcome" value={outcomePreview} />
              <PreviewRow label="Reporting impact" value="Affects WTD, MTD, and performance views" />
              <PreviewRow label="Notes" value={draft.notes.trim() || "—"} />
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Recent manual entries</CardTitle>
              <CardDescription>Coming soon unless the backend exposes a recent backfill feed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Recent backfills, audit history, edited-by, and timestamps require backend support.
              </div>
              <Button variant="outline" className="w-full" disabled>
                Coming soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review backfill</DialogTitle>
            <DialogDescription>Confirm the manual sale details before submitting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <PreviewRow label="Rep" value={selectedRep?.displayName ?? "—"} />
            <PreviewRow label="Manager" value={selectedRep?.managerName ?? "—"} />
            <PreviewRow label="Location" value={selectedRep?.locationName ?? "—"} />
            <PreviewRow label="Provider" value={formatProvider(draft.provider)} />
            <PreviewRow label="Sale date" value={draft.orderDateId || "—"} />
            <PreviewRow label="Customer / account" value={draft.customerName || "—"} />
            <PreviewRow label="Order number" value={draft.orderId || "—"} />
            <PreviewRow label="Estimated install" value={draft.estimatedInstallDate || "—"} />
            <PreviewRow label="Actual install" value={draft.actualInstallDate || "—"} />
            <PreviewRow label="Current outcome/status" value={outcomePreview} />
            <PreviewRow label="Notes / reason" value={draft.notes.trim() || "—"} />
          </div>
          {formError && <div className="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{formError}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Submitting..." : "Submit backfill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
