"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Search, UserPlus, X } from "lucide-react";
import { useAuth } from "./auth-provider";

type SalesRow = { key: string; repUid: string | null; displayName: string; rawSalesId: string; programName?: string; vendorType: "organic" | "subVendor" | "unassigned"; weeklySalesGoal: number; managerName: string; locationName: string; days: number[]; total: number; accountStatuses: Record<string, number> };
type SalesData = { week: { start: string; end: string }; reps: SalesRow[] };
type RosterOption = { repUid: string; displayName: string; email: string };
type PieSlice = { label: string; value: number; detail: string };
type TeamBar = { manager: string; total: number; locations: PieSlice[] };
const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pieColors = ["#276bc2", "#51a57e", "#d28b36", "#8a67cb", "#4f94a9", "#d76f72", "#7d8ea4", "#b58b48"];
const toDateId = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
const weekMonday = (date = new Date()) => { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = value.getDay(); value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day)); return value; };
const readableWeek = (weekStart: string) => { const monday = new Date(weekStart + "T12:00:00"); const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); return monday.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " – " + sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };
const dayHeaders = (weekStart: string) => weekday.map((day, index) => { const date = new Date(weekStart + "T12:00:00"); date.setDate(date.getDate() + index); return { day, date: date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }) }; });
const orderedPieSlices = (slices: PieSlice[]) => [...slices].sort((a, b) => b.value - a.value);

function PieSummary({ title, subtitle, slices }: { title: string; subtitle: string; slices: PieSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0); let offset = 0; const circumference = 2 * Math.PI * 48;
  return <article className="panel pie-summary"><div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{total === 0 ? <div className="pie-empty">No sales in this view.</div> : <div className="pie-content"><svg viewBox="0 0 128 128" role="img" aria-label={title}><circle className="pie-track" cx="64" cy="64" r="48"/>{slices.map((slice, index) => { const length = slice.value / total * circumference; const current = offset; offset += length; return <circle key={slice.label} className="pie-slice" cx="64" cy="64" r="48" stroke={pieColors[index % pieColors.length]} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-current} transform="rotate(-90 64 64)"><title>{`${slice.label}: ${slice.value} sales (${Math.round(slice.value / total * 100)}%). ${slice.detail}`}</title></circle>; })}<text x="64" y="59" textAnchor="middle" className="pie-total">{total}</text><text x="64" y="73" textAnchor="middle" className="pie-caption">SALES</text></svg><div className="pie-legend">{slices.slice(0, 5).map((slice, index) => <div key={slice.label} title={`${slice.detail}`}><i style={{ background: pieColors[index % pieColors.length] }}/><span>{slice.label}</span><b>{slice.value} <small>{Math.round(slice.value / total * 100)}%</small></b></div>)}</div></div>}</article>;
}

function RepLeaderboard({ slices }: { slices: PieSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0); const max = Math.max(...slices.map((slice) => slice.value), 1);
  return <article className="panel leaderboard"><div className="panel-title"><div><h3>Sales by representative</h3><p>All reps, ranked by current filtered sales</p></div></div>{slices.length === 0 ? <div className="pie-empty">No sales in this view.</div> : <div className="leaderboard-list">{slices.map((slice, index) => <div className="leaderboard-row" key={slice.label} title={slice.detail}><span className="leaderboard-rank">{index + 1}</span><b>{slice.label}</b><div className="leaderboard-bar"><i style={{ width: `${slice.value / max * 100}%`, background: pieColors[index % pieColors.length] }}/></div><strong>{slice.value}</strong><small>{Math.round(slice.value / total * 100)}%</small></div>)}</div>}</article>;
}

function TeamBars({ teams }: { teams: TeamBar[] }) {
  const max = Math.max(...teams.map((team) => team.total), 1);
  return <article className="panel leaderboard team-bars"><div className="panel-title"><div><h3>Sales by team</h3><p>Manager totals, split by location</p></div></div>{teams.length === 0 ? <div className="pie-empty">No sales in this view.</div> : <div className="team-bar-list">{teams.map((team) => <div className="team-bar-row" key={team.manager}><div><b>{team.manager}</b><strong>{team.total}</strong></div><div className="team-bar-track"><div className="team-bar-fill" style={{ width: `${team.total / max * 100}%` }}>{team.locations.map((location, index) => <i key={location.label} style={{ width: `${location.value / team.total * 100}%`, background: pieColors[index % pieColors.length] }} title={`${location.label}: ${location.value} sales. ${location.detail}`}/>)}</div></div><small>{team.locations.map((location) => location.label.replace(team.manager + " — ", "")).join(" · ")}</small></div>)}</div>}</article>;
}

export function SalesWorkspace() {
  const { user, profile } = useAuth();
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => toDateId(weekMonday()));
  const [manager, setManager] = useState(() => typeof window === "undefined" ? "all" : new URLSearchParams(window.location.search).get("manager") ?? "all");
  const [rep, setRep] = useState("all");
  const [location, setLocation] = useState(() => typeof window === "undefined" ? "all" : new URLSearchParams(window.location.search).get("location") ?? "all");
  const [vendorType, setVendorType] = useState("all");
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [aliasRow, setAliasRow] = useState<SalesRow | null>(null);
  const [rosterOptions, setRosterOptions] = useState<RosterOption[]>([]);
  const [savingGoal, setSavingGoal] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState("");
  const [showStatus, setShowStatus] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAllTime, setExportAllTime] = useState(false);
  const [exportStart, setExportStart] = useState(weekStart);
  const [exportEnd, setExportEnd] = useState(() => { const end = weekMonday(); end.setDate(end.getDate() + 6); return toDateId(end); });
  const [exporting, setExporting] = useState(false);
  const [mobileTeamChart, setMobileTeamChart] = useState(false);
  const canEditRoster = profile?.role === "superAdmin";
  const canViewStatus = profile?.role === "superAdmin";

  async function request(path: string, init?: RequestInit) {
    return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: "Bearer " + await user?.getIdToken(), ...init?.headers } });
  }
  async function load(selectedWeek = weekStart) {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const response = await request("/api/sales?weekStart=" + selectedWeek);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Unable to load sales.");
      setData(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load sales."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [user, weekStart]);
  function addToRoster(row: SalesRow) {
    const params = new URLSearchParams({ add: "1", name: row.displayName, salesId: row.rawSalesId, program: row.programName || "T-Fiber" });
    window.location.assign("/roster?" + params.toString());
  }
  async function openAlias(row: SalesRow) {
    setAliasRow(row); setAliasTarget(""); setError("");
    try {
      const response = await request("/api/reps?status=active"); const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Unable to load roster.");
      setRosterOptions(value.reps);
    } catch (cause) { setAliasRow(null); setError(cause instanceof Error ? cause.message : "Unable to load roster."); }
  }
  async function saveAlias() {
    if (!aliasRow || !aliasTarget) return;
    setCreating(aliasRow.key); setError("");
    try {
      const response = await request("/api/reps/" + aliasTarget, { method: "PATCH", body: JSON.stringify({ action: "addAlias", alias: aliasRow.displayName }) }); const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Unable to save alias.");
      setAliasRow(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save alias."); }
    finally { setCreating(null); }
  }
  async function saveGoal(repUid: string, form: HTMLFormElement) {
    const weeklySalesGoal = Number(new FormData(form).get("weeklySalesGoal"));
    if (!Number.isInteger(weeklySalesGoal) || weeklySalesGoal < 0) { setError("Weekly goals must be whole numbers of zero or more."); return; }
    setSavingGoal(repUid); setError("");
    try {
      const response = await request("/api/reps/" + repUid, { method: "PATCH", body: JSON.stringify({ action: "setGoal", weeklySalesGoal }) }); const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Unable to save weekly goal.");
      setData((current) => current ? { ...current, reps: current.reps.map((row) => row.repUid === repUid ? { ...row, weeklySalesGoal: value.weeklySalesGoal } : row) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save weekly goal."); }
    finally { setSavingGoal(null); }
  }
  function openExport() { const start = data?.week.start ?? weekStart; const end = new Date(start + "T12:00:00"); end.setDate(end.getDate() + 6); setExportStart(start); setExportEnd(toDateId(end)); setExportAllTime(false); setExportOpen(true); }
  async function exportSales() {
    setExporting(true); setError("");
    try {
      const params = new URLSearchParams({ allTime: String(exportAllTime), manager, rep, location, vendorType }); if (!exportAllTime) { params.set("start", exportStart); params.set("end", exportEnd); }
      const response = await request("/api/sales/export?" + params.toString()); if (!response.ok) { const value = await response.json(); throw new Error(value.error || "Unable to export sales."); }
      const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = exportAllTime ? "sales-export-all-time.xlsx" : `sales-export-${exportStart}-to-${exportEnd}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href); setExportOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to export sales."); } finally { setExporting(false); }
  }
  function changeWeek(offset: number) { const date = new Date(weekStart + "T12:00:00"); date.setDate(date.getDate() + offset * 7); setWeekStart(toDateId(date)); }
  const allRows = data?.reps ?? [];
  const managers = [...new Set(allRows.map((row) => row.managerName).filter(Boolean))].sort();
  const locations = [...new Set(allRows.map((row) => row.locationName).filter(Boolean))].sort();
  const rosterReps = [...new Set(allRows.map((row) => row.displayName))].sort();
  const rows = allRows.filter((row) => (row.displayName.toLowerCase().includes(query.toLowerCase()) || row.rawSalesId.includes(query)) && (manager === "all" || row.managerName === manager) && (rep === "all" || row.displayName === rep) && (location === "all" || row.locationName === location) && (vendorType === "all" || row.vendorType === vendorType));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const dayTotals = rows.reduce((totals, row) => totals.map((value, index) => value + row.days[index]), [0, 0, 0, 0, 0, 0, 0]);
  const totalGoal = rows.reduce((sum, row) => sum + row.weeklySalesGoal, 0);
  const topRep = [...rows].sort((left, right) => right.total - left.total || left.displayName.localeCompare(right.displayName))[0];
  const pace = totalGoal > 0 ? Math.round(total / totalGoal * 100) : 0;
  const repSlices = rows.map((row) => ({ label: row.displayName, value: row.total, detail: `Location: ${row.locationName || "Not assigned"}` })).filter((slice) => slice.value > 0);
  const teamSlices = [...rows.reduce((teams, row) => { const managerName = row.managerName || "No manager"; const locationName = row.locationName || "Not assigned"; const key = managerName + "\u0000" + locationName; const current = teams.get(key) ?? { managerName, locationName, value: 0, reps: new Set<string>() }; current.value += row.total; current.reps.add(row.displayName); teams.set(key, current); return teams; }, new Map<string, { managerName: string; locationName: string; value: number; reps: Set<string> }>()).values()].map((team) => ({ label: `${team.managerName} — ${team.locationName}`, value: team.value, detail: `Manager: ${team.managerName}. Location: ${team.locationName}. Reps: ${[...team.reps].join(", ")}` })).filter((slice) => slice.value > 0);
  const teamBars = [...teamSlices.reduce((teams, slice) => { const [manager = "No manager"] = slice.label.split(" — "); const current = teams.get(manager) ?? { manager, total: 0, locations: [] as PieSlice[] }; current.total += slice.value; current.locations.push(slice); teams.set(manager, current); return teams; }, new Map<string, TeamBar>()).values()].sort((a, b) => b.total - a.total);
  const days = dayHeaders(data?.week.start ?? weekStart);

  return <div className="content">
    <div className="section-row"><div className="sales-week-nav"><button className="icon-button" onClick={() => changeWeek(-1)} aria-label="Previous week"><ChevronLeft size={18}/></button><div className="week-picker">{readableWeek(data?.week.start ?? weekStart)}</div><button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week"><ChevronRight size={18}/></button></div><button className="button secondary" onClick={openExport}><Download size={15}/>Export sales</button></div>
    <section className="sales-kpis"><article><small>TOTAL SALES</small><b>{total}</b><span>Current filtered week</span></article><article><small>PACE TO GOAL</small><b>{pace}%</b><span>{total} of {totalGoal} filtered sales goal</span></article><article><small>TOP REP</small><b>{topRep?.displayName ?? "—"}</b><span>{topRep ? topRep.total + " sales this week" : "No sales in this view"}</span></article></section>
    <section className="sales-distribution desktop-charts"><RepLeaderboard slices={orderedPieSlices(repSlices)}/><TeamBars teams={teamBars}/></section>
    <section className={"mobile-chart-section " + (mobileTeamChart ? "show-team" : "show-reps")}><div className="mobile-chart-switch"><button className={!mobileTeamChart ? "active" : ""} onClick={() => setMobileTeamChart(false)}>Representatives</button><button className={mobileTeamChart ? "active" : ""} onClick={() => setMobileTeamChart(true)}>Teams</button></div><div className="mobile-flip-card"><div className="mobile-flip-inner"><div className="flip-face reps-face"><RepLeaderboard slices={orderedPieSlices(repSlices)}/></div><div className="flip-face team-face"><TeamBars teams={teamBars}/></div></div></div></section>
    <div className="filters sales-filters"><div className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search representatives or sales ID"/></div><select value={manager} onChange={(event) => setManager(event.target.value)}><option value="all">All managers</option>{managers.map((value) => <option key={value}>{value}</option>)}</select><select value={rep} onChange={(event) => setRep(event.target.value)}><option value="all">All representatives</option>{rosterReps.map((value) => <option key={value}>{value}</option>)}</select><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All locations</option>{locations.map((value) => <option key={value}>{value}</option>)}</select><select value={vendorType} onChange={(event) => setVendorType(event.target.value)}><option value="all">All rep types</option><option value="organic">Organic</option><option value="subVendor">Sub-vendor</option><option value="unassigned">Not on roster</option></select></div>
    {error && <div className="form-error">{error}</div>}
    <section className="panel report-table"><div className="panel-title"><div><h3>Weekly sales</h3><p>Every uploaded order is represented, including unmatched roster names.</p></div>{canViewStatus && <button className="button text" onClick={() => setShowStatus((value) => !value)}>{showStatus ? "Hide status" : "Show status"}</button>}</div>{loading ? <div className="empty"><LoaderCircle className="spin" size={24}/><p>Loading sales…</p></div> : rows.length === 0 ? <div className="empty"><h3>No sales for this view</h3><p>Switch weeks or change filters to see a different sales group.</p></div> : <div className="table-scroll"><table><thead><tr><th>REPRESENTATIVE</th><th>MANAGER</th><th>LOCATION</th>{canViewStatus && showStatus && <th>STATUS</th>}{days.map((item, index) => <th className={"sales-day-header sales-day-cell " + (index % 2 === 0 ? "sales-day-alt" : "")} key={item.day}><span>{item.day}</span><small>{item.date}</small></th>)}<th>TOTAL</th><th>GOAL</th><th/></tr></thead><tbody>{rows.map((row) => <tr className={"sales-row " + (selectedRow === row.key ? "selected" : "")} key={row.key} onClick={() => setSelectedRow(row.key)}><td><div className="rep-cell"><span className="avatar small">{row.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><b>{row.displayName}</b>{!row.repUid && <small>Not on roster{row.rawSalesId ? " · Sales ID " + row.rawSalesId : ""}</small>}</span></div></td><td>{row.managerName || "—"}</td><td>{row.locationName || "—"}</td>{canViewStatus && showStatus && <td><span className={"badge " + (row.repUid ? "success" : "warning")}>{row.repUid ? "Matched" : "Needs roster"}</span></td>}{row.days.map((value, index) => <td className={"sales-day-cell " + (index % 2 === 0 ? "sales-day-alt" : "")} key={index}>{value || <span className="zero">—</span>}</td>)}<td><b>{row.total}</b></td><td>{row.repUid && canEditRoster ? <form className="inline-goal" onClick={(event) => event.stopPropagation()}><input name="weeklySalesGoal" type="number" min="0" step="1" defaultValue={row.weeklySalesGoal} onBlur={(event) => void saveGoal(row.repUid!, event.currentTarget.form!)}/></form> : row.repUid ? <b>{row.weeklySalesGoal}</b> : <span className="zero">—</span>}</td><td>{!row.repUid && canEditRoster && <span className="sales-actions"><button className="button secondary table-action" onClick={(event) => { event.stopPropagation(); addToRoster(row); }}><UserPlus size={14}/>Review & add</button><button className="button text alias-button" onClick={(event) => { event.stopPropagation(); void openAlias(row); }}>Add alias</button></span>}</td></tr>)}</tbody><tfoot><tr className="sales-totals"><td colSpan={canViewStatus && showStatus ? 4 : 3}><b>Filtered totals</b></td>{dayTotals.map((value, index) => <td className={"sales-day-cell " + (index % 2 === 0 ? "sales-day-alt" : "")} key={index}><b>{value}</b></td>)}<td><b>{total}</b></td><td><b>{totalGoal}</b></td><td/></tr></tfoot></table></div>}</section>
    {exportOpen && <div className="modal-backdrop" role="presentation"><section className="rep-modal export-modal"><button className="modal-close" onClick={() => setExportOpen(false)}><X size={18}/></button><h2>Export sales</h2><p>The export uses the current Sales filters and creates an Excel workbook with separate ATT and T-Fiber source-data sheets.</p><label className="email-option"><input type="checkbox" checked={exportAllTime} onChange={(event) => setExportAllTime(event.target.checked)}/><span>Export all time</span></label>{!exportAllTime && <div className="export-dates"><label>Start date<input type="date" value={exportStart} onChange={(event) => setExportStart(event.target.value)}/></label><label>End date<input type="date" value={exportEnd} onChange={(event) => setExportEnd(event.target.value)}/></label></div>}<div className="modal-actions"><button className="button secondary" onClick={() => setExportOpen(false)}>Cancel</button><button className="button primary" disabled={exporting || (!exportAllTime && (!exportStart || !exportEnd))} onClick={() => void exportSales()}>{exporting ? "Preparing…" : <><Download size={15}/>Download Excel</>}</button></div></section></div>}
    {aliasRow && <div className="modal-backdrop" role="presentation"><section className="rep-modal alias-modal"><button className="modal-close" onClick={() => setAliasRow(null)}><X size={18}/></button><h2>Add imported name as alias</h2><p><b>{aliasRow.displayName}</b> will become an alias on the selected roster rep. Existing unmatched sales will then be assigned to that rep.</p><label>Roster representative<select value={aliasTarget} onChange={(event) => setAliasTarget(event.target.value)}><option value="">Select a representative</option>{rosterOptions.map((option) => <option value={option.repUid} key={option.repUid}>{option.displayName}{option.email ? " — " + option.email : ""}</option>)}</select></label><div className="modal-actions"><button className="button secondary" onClick={() => setAliasRow(null)}>Cancel</button><button className="button primary" disabled={!aliasTarget || creating === aliasRow.key} onClick={() => void saveAlias()}>{creating === aliasRow.key ? "Saving…" : "Save alias & match sales"}</button></div></section></div>}
  </div>;
}
