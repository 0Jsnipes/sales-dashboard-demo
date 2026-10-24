"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, CheckCircle2, Clock, Link2, ListChecks, Search, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { authedFetch, authedJson } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { normalizePermissions } from "@/src/lib/access";
import { onboardingCategoryOptions, onboardingIcons, onboardingResources, type OnboardingCategory, type OnboardingResource } from "@/src/components/onboarding/onboarding-resources";

type Rep = {
  repUid: string;
  displayName: string;
  managerName: string;
  locationName: string;
  onboarding?: { onboarded: boolean; checks: Record<string, boolean> };
};

const checks = ["Create account", "Complete UID", "Complete background check", "Submit badge request", "Complete training", "Confirm first day"];

const statusMeta = {
  active: { label: "Active", variant: "success" as const },
  admin_only: { label: "Admin only", variant: "warning" as const },
  demo: { label: "Demo only", variant: "info" as const },
};

function accentClasses(accent?: string) {
  switch (accent) {
    case "pink": return "from-pink-500/15 to-pink-500/5 text-pink-600 dark:text-pink-400";
    case "blue": return "from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400";
    case "red": return "from-red-500/15 to-red-500/5 text-red-600 dark:text-red-400";
    case "orange": return "from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400";
    case "sky": return "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400";
    case "emerald": return "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400";
    case "slate": return "from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-400";
    default: return "from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-400";
  }
}

export function OnboardingPage() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Rep | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedResources, setSavedResources] = useState<OnboardingResource[]>([]);
  const [addResourceOpen, setAddResourceOpen] = useState(false);
  const [resourceCategory, setResourceCategory] = useState<OnboardingCategory>("Tools");
  const [resourceSaving, setResourceSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | OnboardingCategory>("All");
  const permissions = normalizePermissions(profile?.permissions);
  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && permissions.canEditOnboarding);
  const canManageResources = profile?.role === "superAdmin" || permissions.canManageResources;

  useEffect(() => {
    Promise.all([
      authedJson<{ reps: Rep[] }>("/api/reps?status=active"),
      authedJson<{ resources: OnboardingResource[] }>("/api/onboarding-resources"),
    ])
      .then(([repsValue, resourcesValue]) => {
        setReps(repsValue.reps ?? []);
        setSavedResources(resourcesValue.resources ?? []);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "Unable to load the tools page."))
      .finally(() => setLoading(false));
  }, []);

  const allResources = useMemo(() => [...onboardingResources, ...savedResources], [savedResources]);
  const activeCategoryOrder = useMemo(
    () => onboardingCategoryOptions.filter((item) => allResources.some((resource) => resource.category === item)),
    [allResources],
  );
  const completeCount = useMemo(() => reps.filter((rep) => rep.onboarding?.onboarded).length, [reps]);
  const staticChecklistComplete = checks.length ? 0 : 0;
  const filteredResources = useMemo(() => allResources.filter((resource) => {
    const matchesCategory = category === "All" || resource.category === category;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [resource.label, resource.description, resource.provider, resource.category].join(" ").toLowerCase().includes(term);
    return matchesCategory && matchesQuery;
  }), [allResources, category, query]);

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setResourceSaving(true);
    try {
      const value = await authedJson<{ resource: OnboardingResource }>("/api/onboarding-resources", {
        method: "POST",
        body: JSON.stringify({
          category: resourceCategory,
          label: formData.get("label"),
          description: formData.get("description"),
        }),
      });
      if (!value.resource) throw new Error("The resource was saved but could not be displayed.");
      setSavedResources((current) => [...current, value.resource]);
      setCategory(value.resource.category);
      setQuery("");
      setAddResourceOpen(false);
      setResourceCategory("Tools");
      form.reset();
      toast.success(`${value.resource.label} was added.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to add the resource.");
    } finally {
      setResourceSaving(false);
    }
  }

  async function save(checkValues: Record<string, boolean>) {
    if (!selected) return;
    setSaving(true);
    try {
      const onboarded = checks.every((check) => checkValues[check]);
      const response = await authedFetch(`/api/reps/${selected.repUid}/onboarding`, {
        method: "PATCH",
        body: JSON.stringify({ checks: checkValues, onboarded }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save onboarding.");
      setReps((current) => current.map((rep) => rep.repUid === selected.repUid ? { ...rep, onboarding: { onboarded, checks: checkValues } } : rep));
      setSelected(null);
    } catch {
      // Keep existing save behavior and surface errors inline through toast-like browser flow.
    } finally {
      setSaving(false);
    }
  }

  const checklistTemplate = {
    total: checks.length,
    completed: staticChecklistComplete,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="border-border/70">
          <CardContent className="space-y-4 p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="h-28 animate-pulse rounded-2xl bg-muted" />
              <div className="h-28 animate-pulse rounded-2xl bg-muted" />
              <div className="h-28 animate-pulse rounded-2xl bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sections = activeCategoryOrder.map((section) => ({
    category: section,
    resources: filteredResources.filter((resource) => resource.category === section),
  }));

  return (
    <TooltipProvider>
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
          {[
            { label: "Programs", value: allResources.filter((resource) => resource.category === "Programs").length, detail: "Program entry points and workflows", icon: BookOpen, accentColor: "#8d7cd8" },
            { label: "Tools", value: allResources.filter((resource) => resource.category === "Tools").length, detail: "Operational and support tools", icon: Wrench, accentColor: "#1baf7a" },
            { label: "UID links", value: allResources.filter((resource) => resource.category === "UID").length, detail: "Quick UID reference links", icon: Link2, accentColor: "var(--primary)" },
            { label: "Checklist items", value: checklistTemplate.total, detail: "Steps in the onboarding template", icon: ListChecks, accentColor: "#c98500" },
          ].map((kpi) => (
            <StatTile key={kpi.label} label={kpi.label} value={kpi.value} detail={kpi.detail} icon={kpi.icon} accentColor={kpi.accentColor} />
          ))}
        </div>

        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Tools</CardTitle>
              <CardDescription>Program links, UID tools, background checks, recruiting references, and operational resources.</CardDescription>
            </div>
            {canManageResources ? <Button variant="outline" aria-label="Add resource" onClick={() => setAddResourceOpen(true)}>Add resource</Button> : null}
          </CardHeader>
        </Card>

        <Card className="border-border/70">
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search resources" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <Tabs value={category} onValueChange={(value) => setCategory(value as typeof category)} className="w-full md:w-auto">
                <TabsList className="grid h-auto w-full grid-cols-4 gap-1 overflow-x-auto md:flex">
                  <TabsTrigger value="All">All</TabsTrigger>
                  {activeCategoryOrder.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {sections.map(({ category: section, resources }) => (
          <Card key={section} className="border-border/70">
            <CardHeader>
              <CardTitle>{section}</CardTitle>
              <CardDescription>
                {section === "Programs" && "Access program entry points, launch materials, and partner-specific workflows."}
                {section === "UID" && "Quickly open UID links and reference pages for each line of business."}
                {section === "Tools" && "Operational tools for support, verification, and rep setup."}
                {section === "Training" && "Training and enablement links for each program."}
                {section === "Forms" && "Request and compliance forms for onboarding and HR flows."}
                {section === "Support" && "Request help, changes, and operational support."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {resources.map((resource) => {
                const Icon = onboardingIcons[resource.icon || "info"] || onboardingIcons.info;
                const status = statusMeta[resource.status];
                return (
                  <motion.div key={resource.id} whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={reducedMotion ? undefined : { scale: 0.99 }}>
                    <Card className="h-full border-border/70 bg-gradient-to-br from-background to-muted/30">
                      <CardContent className="flex h-full flex-col gap-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClasses(resource.accent)}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {resource.provider && <Badge variant="outline">{resource.provider}</Badge>}
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">{resource.label}</h3>
                          <p className="text-sm text-muted-foreground">{resource.description}</p>
                        </div>
                        <Separator />
                        <div className="mt-auto">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block">
                                <Button
                                  className="w-full"
                                  disabled
                                >
                                  Demo only
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Resource links are disabled in this demo.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
              {!resources.length && (
                <Card className="border-dashed border-border/70 bg-muted/20">
                  <CardContent className="p-6 text-sm text-muted-foreground">No resources match your search.</CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        ))}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <Card className="overflow-hidden border-border/70">
            <CardHeader>
              <CardTitle>Rep onboarding checklist</CardTitle>
              <CardDescription>Static template until checklist persistence is expanded beyond the existing rep onboarding endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {checks.map((check) => (
                <div key={check} className="flex items-center justify-between rounded-2xl border border-border/70 p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{check}</span>
                  </div>
                  <Badge variant="outline">Template</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70">
            <CardHeader>
              <CardTitle>Existing rep checklist workflow</CardTitle>
              <CardDescription>The current save behavior is preserved and still edits the existing onboarding endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border">
                <StatTile label="Active reps" value={reps.length} detail="Currently active roster members" icon={Users} accentColor="var(--info)" />
                <StatTile label="Completed" value={completeCount} detail="Fully onboarded reps" icon={CheckCircle2} accentColor="var(--success)" />
                <StatTile label="In progress" value={reps.length - completeCount} detail="Still finishing onboarding steps" icon={Clock} accentColor="var(--warning)" />
              </div>
              <Separator />
              <Button disabled={!allowed} onClick={() => setSelected(reps[0] ?? null)} className="w-full">Open first rep checklist</Button>
            </CardContent>
          </Card>
        </section>

        <Dialog open={addResourceOpen} onOpenChange={(open) => { if (!resourceSaving) setAddResourceOpen(open); }}>
          <DialogContent>
            <form className="space-y-5" onSubmit={addResource}>
              <DialogHeader>
                <DialogTitle>Add resource</DialogTitle>
                <DialogDescription>Add a live link to the Tools page for everyone with access.</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="resource-category">Section</Label>
                <Select value={resourceCategory} onValueChange={(value) => setResourceCategory(value as OnboardingCategory)}>
                  <SelectTrigger id="resource-category">
                    <SelectValue placeholder="Choose a section" />
                  </SelectTrigger>
                  <SelectContent>
                    {onboardingCategoryOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-label">Tool name</Label>
                <Input id="resource-label" name="label" required minLength={2} maxLength={120} placeholder="Example: Sales Report Builder" autoFocus />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-description">Description</Label>
                <Textarea id="resource-description" name="description" required maxLength={500} placeholder="Explain what this resource is used for." />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" disabled={resourceSaving} onClick={() => setAddResourceOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={resourceSaving}>{resourceSaving ? "Adding..." : "Add resource"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent className="w-full sm:max-w-lg">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>Onboard {selected.displayName}</SheetTitle>
                  <SheetDescription>Mark each setup item before the rep is considered fully onboarded.</SheetDescription>
                </SheetHeader>
                <form
                  className="space-y-3 py-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    const values = Object.fromEntries(checks.map((check) => [check, Boolean(formData.get(check))]));
                    void save(values);
                  }}
                >
                  {checks.map((check) => (
                    <label key={check} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 text-sm">
                      <input type="checkbox" defaultChecked={Boolean(selected.onboarding?.checks?.[check])} name={check} />
                      <span>{check}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    The checklist state is saved back to the existing onboarding endpoint.
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                    <Button disabled={saving} type="submit">{saving ? "Saving..." : "Save onboarding"}</Button>
                  </div>
                </form>
              </>
            )}
          </SheetContent>
        </Sheet>
      </motion.div>
    </TooltipProvider>
  );
}
