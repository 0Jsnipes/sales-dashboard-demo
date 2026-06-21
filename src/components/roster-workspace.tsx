"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Mail, MapPin, Pencil, Plus, RotateCcw, Search, Trash2, Users, X } from "lucide-react";
import { useAuth } from "./auth-provider";
import type { Rep } from "@/src/types/rep";
import type { Location } from "@/src/types/location";
import type { ManagerOption } from "@/src/types/manager";

type RepForm = { displayName: string; email: string; phone: string; managerUid: string; managerName: string; locationName: string; salesIds: string; aliases: string; programIds: string; vendorType: "organic" | "subVendor"; weeklySalesGoal: string; instagram: string; facebook: string; tiktok: string; linkedin: string };
const blankForm: RepForm = { displayName: "", email: "", phone: "", managerUid: "", managerName: "", locationName: "", salesIds: "", aliases: "", programIds: "", vendorType: "organic", weeklySalesGoal: "0", instagram: "", facebook: "", tiktok: "", linkedin: "" };
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const currentWeekISO = () => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7)); const firstThursday = new Date(date.getFullYear(), 0, 4); const week = 1 + Math.round(((date.valueOf() - firstThursday.valueOf()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7); return date.getFullYear() + "-W" + String(week).padStart(2, "0"); };
const mondayFor = (date: Date) => { const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate()); monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay())); return monday; };
const weekOptionsFor = (date = new Date()) => Array.from({ length: 80 }, (_, index) => { const monday = mondayFor(date); monday.setDate(monday.getDate() + (index - 16) * 7); const thursday = new Date(monday); thursday.setDate(thursday.getDate() + 3); const yearStart = new Date(thursday.getFullYear(), 0, 1); const week = Math.ceil((((thursday.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7); return { value: thursday.getFullYear() + "-W" + String(week).padStart(2, "0"), label: "Week of " + monday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) }; });

export function RosterWorkspace() {
  const { user, profile } = useAuth();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "terminated">("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RepForm>(blankForm);
  const [editing, setEditing] = useState<Rep | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationTarget, setLocationTarget] = useState<Rep | null>(null);
  const [assignmentWeek, setAssignmentWeek] = useState(currentWeekISO());
  const [assignmentMode, setAssignmentMode] = useState<"forward" | "single">("forward");
  const [assignmentLocationId, setAssignmentLocationId] = useState("");
  const [target, setTarget] = useState<Rep | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canEditRoster);
  const weekOptions = useMemo(() => weekOptionsFor(), []);

  async function request(path: string, init?: RequestInit) {
    const token = await user?.getIdToken();
    return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...init?.headers } });
  }
  async function load(nextStatus = status) {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const response = await request("/api/reps?status=" + nextStatus);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load roster.");
      setReps(data.reps);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load roster."); }
    finally { setLoading(false); }
  }
  async function loadLocations() {
    if (!user) return;
    try {
      const response = await request("/api/locations");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load locations.");
      setLocations(data.locations);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load locations."); }
  }
  async function loadManagers() {
    if (!user) return;
    try { const response = await request("/api/managers"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load managers."); setManagers(data.managers); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load managers."); }
  }
  useEffect(() => { void load(); }, [user]);
  useEffect(() => { void loadLocations(); }, [user]);
  useEffect(() => { void loadManagers(); }, [user]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") !== "1") return;
    setEditing(null);
    setForm({ ...blankForm, displayName: params.get("name") ?? "", salesIds: params.get("salesId") ?? "", programIds: params.get("program") ?? "" });
    setOpen(true);
    window.history.replaceState({}, "", "/roster");
  }, []);
  const visible = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return reps;
    return reps.filter((rep) => [rep.displayName, rep.email, rep.managerName, rep.locationName, ...rep.salesIds, ...rep.aliases].join(" ").toLowerCase().includes(term));
  }, [query, reps]);
  function openEditor(rep?: Rep) {
    setEditing(rep ?? null);
    setForm(rep ? { displayName: rep.displayName, email: rep.email, phone: rep.phone ?? "", managerUid: rep.managerUid ?? "", managerName: rep.managerName ?? "", locationName: rep.locationName, salesIds: rep.salesIds.join(", "), aliases: rep.aliases.join(", "), programIds: rep.programIds.join(", "), vendorType: rep.vendorType ?? "organic", weeklySalesGoal: String(rep.weeklySalesGoal ?? 0), instagram: rep.socials?.instagram ?? "", facebook: rep.socials?.facebook ?? "", tiktok: rep.socials?.tiktok ?? "", linkedin: rep.socials?.linkedin ?? "" } : blankForm);
    setOpen(true);
  }
  function closeEditor() { setOpen(false); setEditing(null); setForm(blankForm); }
  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await request("/api/locations", { method: "POST", body: JSON.stringify({ name: locationDraft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to add location.");
      setLocations((current) => [...current, data.location].sort((a, b) => a.name.localeCompare(b.name)));
      setLocationDraft("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add location."); }
    finally { setSaving(false); }
  }
  async function deleteLocation(location: Location) {
    if (!window.confirm("Remove " + location.name + " from the location dropdown? Existing reps keep their stored location until you edit them.")) return;
    setError("");
    try {
      const response = await request("/api/locations/" + location.locationId, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove location.");
      setLocations((current) => current.filter((item) => item.locationId !== location.locationId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove location."); }
  }
  async function addManagerFromSelect() {
    const name = window.prompt("New manager name");
    if (!name?.trim()) return;
    setError("");
    try {
      const response = await request("/api/managers", { method: "POST", body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to add manager.");
      setManagers((current) => [...current, data.manager].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, managerUid: data.manager.managerUid, managerName: data.manager.name }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add manager."); }
  }
  async function assignLocation() {
    if (!locationTarget || !assignmentLocationId) return;
    const location = locations.find((item) => item.locationId === assignmentLocationId);
    if (!location) return;
    setSaving(true); setError("");
    try {
      const response = await request("/api/reps/" + locationTarget.repUid + "/location", { method: "POST", body: JSON.stringify({ weekISO: assignmentWeek, locationId: location.locationId, locationName: location.name, mode: assignmentMode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to assign location.");
      setLocationTarget(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to assign location."); }
    finally { setSaving(false); }
  }
  async function saveRep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const location = locations.find((item) => item.name === form.locationName);
      const payload = { displayName: form.displayName, email: form.email, phone: form.phone || undefined, locationId: location?.locationId ?? "unassigned", locationName: form.locationName || "Unassigned", managerUid: form.managerUid || null, managerName: form.managerName, salesIds: split(form.salesIds), aliases: split(form.aliases), programIds: split(form.programIds), vendorType: form.vendorType, weeklySalesGoal: Math.max(0, Number(form.weeklySalesGoal) || 0), socials: { instagram: form.instagram, facebook: form.facebook, tiktok: form.tiktok, linkedin: form.linkedin } };
      const response = editing ? await request("/api/reps/" + editing.repUid, { method: "PATCH", body: JSON.stringify({ action: "update", rep: payload }) }) : await request("/api/reps", { method: "POST", body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Check the representative details and try again.");
      setReps((current) => (editing ? current.map((rep) => rep.repUid === editing.repUid ? data.rep : rep) : [...current, data.rep]).sort((a, b) => a.displayName.localeCompare(b.displayName)));
      closeEditor();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save representative."); }
    finally { setSaving(false); }
  }
  async function saveGoal(rep: Rep, form: HTMLFormElement) {
    const value = Number(new FormData(form).get("weeklySalesGoal"));
    if (!Number.isInteger(value) || value < 0) { setError("Weekly goals must be whole numbers of zero or more."); return; }
    setSaving(true); setError("");
    try {
      const response = await request("/api/reps/" + rep.repUid, { method: "PATCH", body: JSON.stringify({ action: "setGoal", weeklySalesGoal: value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save weekly goal.");
      setReps((current) => current.map((item) => item.repUid === rep.repUid ? { ...item, weeklySalesGoal: data.weeklySalesGoal } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save weekly goal."); }
    finally { setSaving(false); }
  }
  async function changeStatus(action: "terminate" | "restore") {
    if (!target) return;
    setSaving(true); setError("");
    try {
      const response = await request("/api/reps/" + target.repUid, { method: "PATCH", body: JSON.stringify({ action, sendTerminationEmail: action === "terminate" && sendEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update representative.");
      setTarget(null); await load(status);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update representative."); }
    finally { setSaving(false); }
  }
  function changeFilter(next: "active" | "terminated") { setStatus(next); void load(next); }

  return <>
    <div className="content">
      <div className="filters"><div className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, sales ID, or alias"/></div><button className={status === "active" ? "filter-active" : ""} onClick={() => changeFilter("active")}>Active</button><button className={status === "terminated" ? "filter-active" : ""} onClick={() => changeFilter("terminated")}>Terminated</button></div>
      {error && <div className="form-error">{error}</div>}
      <section className="panel roster">
        <div className="panel-title"><div><h3>{loading ? "Loading representatives…" : reps.length + " " + status + " representative" + (reps.length === 1 ? "" : "s")}</h3><p>{status === "terminated" ? "Terminated reps are retained for history and can be reactivated." : "Roster records are the permanent source of truth for matching and reporting."}</p></div>{canEdit && <span className="roster-actions"><button className="button secondary" onClick={() => setLocationsOpen(true)}><MapPin size={15}/>Manage locations</button>{status === "active" && <button className="button primary" onClick={() => openEditor()}><Plus size={16}/>Add representative</button>}</span>}</div>
        {loading ? <div className="empty"><LoaderCircle className="spin" size={24}/><p>Loading roster…</p></div> : visible.length === 0 ? <div className="empty"><span className="attention-icon blue"><Users size={22}/></span><h3>No {status} representatives</h3><p>{status === "terminated" ? "Terminated representatives will appear here for restoration and email review." : "Create your first roster record before importing sales or knock reports."}</p>{canEdit && status === "active" && <button className="button primary" onClick={() => openEditor()}><Plus size={16}/>Add representative</button>}</div> : <table><thead><tr><th>REPRESENTATIVE</th><th>SALES IDs / ALIASES</th><th>MANAGER</th><th>GOAL</th><th>LOCATION</th><th>ACCOUNT</th><th/></tr></thead><tbody>{visible.map((rep) => <tr key={rep.repUid}><td><div className="rep-cell"><span className="avatar small">{rep.firstName.slice(0, 1)}{rep.lastName.slice(0, 1)}</span><span><b>{rep.displayName}</b><small>{rep.email}</small></span></div></td><td>{[...rep.salesIds, ...rep.aliases].slice(0, 3).map((item) => <span className="tag" key={item}>{item}</span>)}</td><td>{rep.managerName || "—"}</td><td>{rep.weeklySalesGoal ?? 0}</td><td>{canEdit ? <button className="button text location-action" onClick={() => { setLocationTarget(rep); setAssignmentWeek(currentWeekISO()); setAssignmentMode("forward"); setAssignmentLocationId(""); }}><MapPin size={14}/>Set weekly</button> : "Weekly"}</td><td><span className={"badge " + (rep.accountStatus === "active" ? "success" : "neutral")}>{rep.accountStatus === "active" ? "Active" : "No account"}</span></td><td>{canEdit && <span className="roster-actions"><button className="button secondary table-action" onClick={() => openEditor(rep)}><Pencil size={14}/>Edit</button><button className="button secondary table-action" onClick={() => { setTarget(rep); setSendEmail(true); }}>{status === "terminated" ? <><RotateCcw size={14}/>Restore</> : <><Trash2 size={14}/>Terminate</>}</button></span>}</td></tr>)}</tbody></table>}
      </section>
    </div>
    {open && <div className="modal-backdrop" role="presentation"><form className="rep-modal" onSubmit={saveRep}><button className="modal-close" type="button" onClick={closeEditor}><X size={18}/></button><h2>{editing ? "Edit representative" : "Add representative"}</h2><p>{editing ? "Changes preserve the permanent rep ID and rematch newly eligible imported sales." : "This creates a permanent roster ID used across imports and reports."}</p><label>Full name<input autoFocus required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })}/></label><label>Work email <small>optional until account creation</small><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label>Manager<select value={form.managerUid} onChange={(event) => { if (event.target.value === "__add__") { void addManagerFromSelect(); return; } const manager = managers.find((item) => item.managerUid === event.target.value); setForm({ ...form, managerUid: event.target.value, managerName: manager?.name ?? "" }); }}><option value="">No manager</option>{managers.map((manager) => <option value={manager.managerUid} key={manager.managerUid}>{manager.name}</option>)}<option value="__add__">+ Add manager…</option></select></label><label>Representative type<select value={form.vendorType} onChange={(event) => setForm({ ...form, vendorType: event.target.value as RepForm["vendorType"] })}><option value="organic">Organic</option><option value="subVendor">Sub-vendor</option></select></label><label>Phone <small>optional</small><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>Sales IDs <small>comma separated</small><input value={form.salesIds} onChange={(event) => setForm({ ...form, salesIds: event.target.value })} placeholder="ATT-1042, TF-721"/></label><label>Aliases <small>comma separated</small><input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} placeholder="A. Mitchell, Avery M."/></label><label>Programs <small>comma separated</small><input value={form.programIds} onChange={(event) => setForm({ ...form, programIds: event.target.value })} placeholder="ATT, T-Fiber"/></label><p className="form-section">Social profiles</p><label>Instagram<input value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value })} placeholder="@username or URL"/></label><label>Facebook<input value={form.facebook} onChange={(event) => setForm({ ...form, facebook: event.target.value })} placeholder="Profile URL"/></label><label>TikTok<input value={form.tiktok} onChange={(event) => setForm({ ...form, tiktok: event.target.value })} placeholder="@username or URL"/></label><label>LinkedIn<input value={form.linkedin} onChange={(event) => setForm({ ...form, linkedin: event.target.value })} placeholder="Profile URL"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={closeEditor}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create representative"}</button></div></form></div>}
    {locationsOpen && <div className="modal-backdrop" role="presentation"><section className="rep-modal location-modal"><button className="modal-close" onClick={() => setLocationsOpen(false)}><X size={18}/></button><h2>Manage locations</h2><p>These options appear in the representative location dropdown.</p><form className="location-add" onSubmit={addLocation}><input required value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} placeholder="e.g. Tampa, FL"/><button className="button primary" disabled={saving}><Plus size={15}/>Add</button></form><div className="location-list">{locations.length === 0 ? <p>No locations added yet.</p> : locations.map((location) => <div key={location.locationId}><span>{location.name}</span><button className="icon-button" onClick={() => void deleteLocation(location)} aria-label={"Remove " + location.name}><Trash2 size={16}/></button></div>)}</div></section></div>}
    {locationTarget && <div className="modal-backdrop" role="presentation"><section className="rep-modal location-modal"><button className="modal-close" onClick={() => setLocationTarget(null)}><X size={18}/></button><h2>Set weekly location</h2><p>Assign a location for <b>{locationTarget.displayName}</b>.</p><label>Week<select value={assignmentWeek} onChange={(event) => setAssignmentWeek(event.target.value)}>{weekOptions.map((week) => <option value={week.value} key={week.value}>{week.label}</option>)}</select></label><label>Location<select value={assignmentLocationId} onChange={(event) => setAssignmentLocationId(event.target.value)}><option value="">Select a location</option>{locations.map((location) => <option value={location.locationId} key={location.locationId}>{location.name}</option>)}</select></label><label>Apply change<select value={assignmentMode} onChange={(event) => setAssignmentMode(event.target.value as "forward" | "single")}><option value="forward">This week and future weeks</option><option value="single">This week only</option></select></label><div className="modal-actions"><button className="button secondary" onClick={() => setLocationTarget(null)}>Cancel</button><button className="button primary" disabled={!assignmentLocationId || saving} onClick={() => void assignLocation()}>{saving ? "Saving…" : "Save location"}</button></div></section></div>}
    {target && <div className="modal-backdrop" role="presentation"><section className="rep-modal confirm-modal"><button className="modal-close" type="button" onClick={() => setTarget(null)}><X size={18}/></button>{status === "terminated" ? <><h2>Restore {target.displayName}?</h2><p>This reactivates their roster record and re-enables a linked account.</p><div className="modal-actions"><button className="button secondary" onClick={() => setTarget(null)}>Cancel</button><button className="button primary" disabled={saving} onClick={() => void changeStatus("restore")}>Restore representative</button></div></> : <><h2>Terminate {target.displayName}?</h2><p>The record and reporting history remain intact. A linked login will be disabled.</p><label className="email-option"><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)}/><span><Mail size={16}/>Queue termination email to <b>{target.email}</b></span></label><div className="modal-actions"><button className="button secondary" onClick={() => setTarget(null)}>Cancel</button><button className="button danger" disabled={saving} onClick={() => void changeStatus("terminate")}>{saving ? "Terminating…" : "Terminate representative"}</button></div></>}</section></div>}
  </>;
}
