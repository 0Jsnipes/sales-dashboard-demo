"use client";

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Location } from "@/src/types/location";
import type { ManagerOption } from "@/src/types/manager";

export type RepEditorForm = {
  displayName: string;
  email: string;
  phone: string;
  managerUid: string;
  managerName: string;
  locationId: string;
  locationName: string;
  salesIds: string;
  aliases: string;
  programIds: string;
  vendorType: "organic" | "subVendor";
  weeklySalesGoal: string;
  weeklyKnocksGoal: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
};

export const blankRepEditorForm: RepEditorForm = {
  displayName: "",
  email: "",
  phone: "",
  managerUid: "",
  managerName: "",
  locationId: "",
  locationName: "",
  salesIds: "",
  aliases: "",
  programIds: "",
  vendorType: "organic",
  weeklySalesGoal: "0",
  weeklyKnocksGoal: "0",
  instagram: "",
  facebook: "",
  tiktok: "",
  linkedin: "",
};

type Props = {
  open: boolean;
  title: string;
  description: string;
  saveLabel: string;
  saving: boolean;
  form: RepEditorForm;
  setForm: Dispatch<SetStateAction<RepEditorForm>>;
  managers: ManagerOption[];
  locations: Location[];
  managerDraft: string;
  locationDraft: string;
  onCreateManager: () => void;
  onCreateLocation: () => void;
  managerCreating: boolean;
  locationCreating: boolean;
  canCreateManager: boolean;
  canCreateLocation: boolean;
  onManagerDraftChange: (value: string) => void;
  onLocationDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      {children}
    </div>
  );
}

export function RepEditorDialog({ open, title, description, saveLabel, saving, form, setForm, managers, locations, managerDraft, locationDraft, onCreateManager, onCreateLocation, managerCreating, locationCreating, canCreateManager, canCreateLocation, onManagerDraftChange, onLocationDraftChange, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-6" onSubmit={onSubmit}>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Identity" helper="Rep name is required.">
              <Input placeholder="Full name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </Field>
            <Field label="Vendor / program" helper="Used for matching and CRM visibility.">
              <Select value={form.vendorType} onValueChange={(value) => setForm({ ...form, vendorType: value as RepEditorForm["vendorType"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organic">Organic</SelectItem>
                  <SelectItem value="subVendor">Sub-vendor</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Contact email">
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Manager">
              <div className="space-y-2">
                <Select value={form.managerUid || "__none__"} onValueChange={(value) => setForm({ ...form, managerUid: value === "__none__" ? "" : value, managerName: value === "__none__" ? "" : managers.find((item) => item.managerUid === value)?.name ?? managerDraft.trim() })}>
                  <SelectTrigger><SelectValue placeholder="Manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No manager</SelectItem>
                    {managers.map((manager) => <SelectItem key={manager.managerUid} value={manager.managerUid}>{manager.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input value={managerDraft} onChange={(event) => onManagerDraftChange(event.target.value)} placeholder="New manager name" />
                  <Button type="button" variant="outline" onClick={onCreateManager} disabled={!canCreateManager || managerCreating}>{managerCreating ? "Adding..." : "Add"}</Button>
                </div>
              </div>
            </Field>
            <Field label="Location">
              <div className="space-y-2">
                <Select value={form.locationId} onValueChange={(value) => setForm({ ...form, locationId: value, locationName: locations.find((item) => item.locationId === value)?.name ?? locationDraft.trim() })}>
                  <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => <SelectItem key={location.locationId} value={location.locationId}>{location.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input value={locationDraft} onChange={(event) => onLocationDraftChange(event.target.value)} placeholder="New location name" />
                  <Button type="button" variant="outline" onClick={onCreateLocation} disabled={!canCreateLocation || locationCreating}>{locationCreating ? "Adding..." : "Add"}</Button>
                </div>
              </div>
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Sales IDs" helper="Comma separated.">
              <Input value={form.salesIds} onChange={(event) => setForm({ ...form, salesIds: event.target.value })} />
            </Field>
            <Field label="Aliases" helper="Comma separated and deduped client-side.">
              <Input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} />
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Programs">
              <Input value={form.programIds} onChange={(event) => setForm({ ...form, programIds: event.target.value })} />
            </Field>
            <Field label="Weekly sales goal">
              <Input type="number" min={0} value={form.weeklySalesGoal} onChange={(event) => setForm({ ...form, weeklySalesGoal: event.target.value })} />
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Weekly knocks goal">
              <Input type="number" min={0} value={form.weeklyKnocksGoal} onChange={(event) => setForm({ ...form, weeklyKnocksGoal: event.target.value })} />
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Instagram">
              <Input value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value })} />
            </Field>
            <Field label="Facebook">
              <Input value={form.facebook} onChange={(event) => setForm({ ...form, facebook: event.target.value })} />
            </Field>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="TikTok">
              <Input value={form.tiktok} onChange={(event) => setForm({ ...form, tiktok: event.target.value })} />
            </Field>
            <Field label="LinkedIn">
              <Input value={form.linkedin} onChange={(event) => setForm({ ...form, linkedin: event.target.value })} />
            </Field>
          </section>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : saveLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
