import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { parseCommonFilters, applyTextSearchFilter } from "@/src/lib/api/report-filters";
import { errorResponse } from "@/src/lib/api/error-response";
import { enableWorksheetFilters } from "@/src/lib/exports/worksheet";
import { normalizeRepAccessRole, repAccessRoleLabel } from "@/src/lib/reps/access-role";
import type { Rep } from "@/src/types/rep";

export const runtime = "nodejs";

type RosterExportRow = {
  Status: string;
  Manager: string;
  Location: string;
  "Rep Name": string;
  Role: string;
  "Vendor Type": string;
  Programs: string;
  Email: string;
  Phone: string;
  "Sales IDs": string;
  Aliases: string;
  "Weekly Sales Goal": number;
  "Weekly Knocks Goal": number;
  "First Sale": string;
  "Last Sale": string;
  "Account Status": string;
  Onboarded: string;
  "Team ID": string;
  Instagram: string;
  Facebook: string;
  TikTok: string;
  LinkedIn: string;
  "Rep UID": string;
};

const statusOrder = new Map([["active", 0], ["inactive", 1], ["terminated", 2]]);
const rosterHeaders: Array<keyof RosterExportRow> = ["Status", "Manager", "Location", "Rep Name", "Role", "Vendor Type", "Programs", "Email", "Phone", "Sales IDs", "Aliases", "Weekly Sales Goal", "Weekly Knocks Goal", "First Sale", "Last Sale", "Account Status", "Onboarded", "Team ID", "Instagram", "Facebook", "TikTok", "LinkedIn", "Rep UID"];
const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

function text(value: unknown) {
  return String(value ?? "").trim();
}

function list(values: unknown) {
  return Array.isArray(values) ? values.map(text).filter(Boolean).join(", ") : "";
}

function qualityFor(rep: Rep) {
  if (!text(rep.email)) return "missing_email";
  if (!text(rep.managerName) && !rep.managerUid) return "missing_manager";
  if (!text(rep.locationName) && !rep.locationId) return "missing_location";
  if (!rep.salesIds?.length && !rep.aliases?.length) return "missing_sales_id";
  return "ready";
}

function qualityMatches(rep: Rep, quality: string) {
  if (!quality || quality === "all") return true;
  return qualityFor(rep) === quality;
}

async function firstAndLastSales(repUids: string[]) {
  const db = getAdminDb();
  const firstSaleDateByRepUid = new Map<string, string>();
  const lastSaleDateByRepUid = new Map<string, string>();
  for (const group of chunks(repUids, 30)) {
    const [companyASnapshot, companyBSnapshot, manualSnapshot] = await Promise.all([
      db.collection("salesOrders").doc("companya").collection("orders").where("matchedRepUid", "in", group).get(),
      db.collection("salesOrders").doc("companyb").collection("orders").where("matchedRepUid", "in", group).get(),
      db.collection("salesOrders").doc("manual").collection("orders").where("matchedRepUid", "in", group).get(),
    ]);
    for (const document of [...companyASnapshot.docs, ...companyBSnapshot.docs, ...manualSnapshot.docs]) {
      const data = document.data() as { matchedRepUid?: string; orderDateId?: string };
      const repUid = text(data.matchedRepUid);
      const orderDateId = text(data.orderDateId);
      if (!repUid || !orderDateId) continue;
      const first = firstSaleDateByRepUid.get(repUid) || "";
      if (!first || orderDateId < first) firstSaleDateByRepUid.set(repUid, orderDateId);
      const current = lastSaleDateByRepUid.get(repUid) || "";
      if (!current || orderDateId > current) lastSaleDateByRepUid.set(repUid, orderDateId);
    }
  }
  return { firstSaleDateByRepUid, lastSaleDateByRepUid };
}

function worksheet<T extends Record<string, unknown>>(rows: T[], headers?: string[]) {
  const resolvedHeaders = headers ?? (rows.length ? Object.keys(rows[0]) : []);
  const sheet = enableWorksheetFilters(XLSX.utils.json_to_sheet(rows, { header: resolvedHeaders }));
  sheet["!cols"] = resolvedHeaders.map((header) => ({
    wch: Math.min(42, Math.max(header.length + 2, ...rows.map((row) => text(row[header]).length + 2))),
  }));
  return sheet;
}

function rosterRow(rep: Rep, firstSaleDateByRepUid: Map<string, string>, lastSaleDateByRepUid: Map<string, string>): RosterExportRow {
  return {
    Status: text(rep.status),
    Manager: text(rep.managerName) || "No manager",
    Location: text(rep.locationName) || "No location",
    "Rep Name": text(rep.displayName),
    Role: repAccessRoleLabel(normalizeRepAccessRole(rep.accessRole)),
    "Vendor Type": text(rep.vendorType),
    Programs: list(rep.programIds),
    Email: text(rep.email),
    Phone: text(rep.phone),
    "Sales IDs": list(rep.salesIds),
    Aliases: list(rep.aliases),
    "Weekly Sales Goal": Number(rep.weeklySalesGoal || 0),
    "Weekly Knocks Goal": Number(rep.weeklyKnocksGoal || 0),
    "First Sale": firstSaleDateByRepUid.get(rep.repUid) || "",
    "Last Sale": lastSaleDateByRepUid.get(rep.repUid) || "",
    "Account Status": text(rep.accountStatus),
    Onboarded: rep.onboarding?.onboarded ? "Yes" : "No",
    "Team ID": text(rep.teamId),
    Instagram: text(rep.socials?.instagram),
    Facebook: text(rep.socials?.facebook),
    TikTok: text(rep.socials?.tiktok),
    LinkedIn: text(rep.socials?.linkedin),
    "Rep UID": text(rep.repUid),
  };
}

function summaryRows(reps: Rep[]) {
  const byManager = new Map<string, { Manager: string; Reps: number; Active: number; Purgatory: number; Terminated: number; "Missing Sales ID": number; "Missing Manager": number; "Missing Location": number; Ready: number }>();
  for (const rep of reps) {
    const manager = text(rep.managerName) || "No manager";
    const row = byManager.get(manager) ?? { Manager: manager, Reps: 0, Active: 0, Purgatory: 0, Terminated: 0, "Missing Sales ID": 0, "Missing Manager": 0, "Missing Location": 0, Ready: 0 };
    row.Reps += 1;
    if (rep.status === "active") row.Active += 1;
    if (rep.status === "inactive") row.Purgatory += 1;
    if (rep.status === "terminated") row.Terminated += 1;
    const quality = qualityFor(rep);
    if (quality === "missing_sales_id") row["Missing Sales ID"] += 1;
    if (quality === "missing_manager") row["Missing Manager"] += 1;
    if (quality === "missing_location") row["Missing Location"] += 1;
    if (quality === "ready") row.Ready += 1;
    byManager.set(manager, row);
  }
  return [...byManager.values()].sort((left, right) => left.Manager.localeCompare(right.Manager));
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getAdminDb();
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const status = url.searchParams.get("status") || "active";
    const quality = url.searchParams.get("quality") || "all";
    if (!["active", "inactive", "terminated", "all"].includes(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });

    let snapshot;
    if (actor.profile.role === "superAdmin" || actor.profile.role === "admin") {
      snapshot = status === "all" ? await db.collection("reps").get() : await db.collection("reps").where("status", "==", status).get();
    } else if (actor.profile.role === "manager" && actor.profile.repUid) {
      snapshot = await db.collection("reps").where("managerUid", "==", actor.profile.repUid).get();
    } else if (actor.profile.repUid) {
      snapshot = await db.collection("reps").where("repUid", "==", actor.profile.repUid).limit(1).get();
    } else {
      snapshot = null;
    }

    const reps = (snapshot?.docs ?? []).map((document) => ({ repUid: document.id, ...document.data() }) as Rep);
    const filtered = applyTextSearchFilter(reps, filters.search, (rep) => [
      rep.displayName,
      rep.email,
      rep.phone,
      rep.managerName,
      rep.locationName,
      list(rep.salesIds),
      list(rep.aliases),
    ].join(" ")).filter((rep) => {
      return (status === "all" || rep.status === status)
        && (!filters.manager || filters.manager === "all" || rep.managerName === filters.manager)
        && (!filters.location || filters.location === "all" || rep.locationName === filters.location)
        && (!filters.vendor || filters.vendor === "all" || rep.vendorType === filters.vendor)
        && qualityMatches(rep, quality);
    }).sort((left, right) => (statusOrder.get(left.status) ?? 99) - (statusOrder.get(right.status) ?? 99)
      || text(left.managerName).localeCompare(text(right.managerName))
      || text(left.locationName).localeCompare(text(right.locationName))
      || text(left.displayName).localeCompare(text(right.displayName)));

    const { firstSaleDateByRepUid, lastSaleDateByRepUid } = await firstAndLastSales(filtered.map((rep) => rep.repUid).filter(Boolean));
    const rows = filtered.map((rep) => rosterRow(rep, firstSaleDateByRepUid, lastSaleDateByRepUid));
    const cleanupRows = filtered
      .filter((rep) => qualityFor(rep) !== "ready")
      .map((rep) => ({ Issue: qualityFor(rep).replace(/_/g, " "), "Rep Name": rep.displayName, Manager: rep.managerName || "No manager", Location: rep.locationName || "No location", Email: rep.email, "Sales IDs": list(rep.salesIds), Aliases: list(rep.aliases), "Rep UID": rep.repUid }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet(rows, rosterHeaders), "Roster");
    XLSX.utils.book_append_sheet(workbook, worksheet(summaryRows(filtered)), "Manager Summary");
    XLSX.utils.book_append_sheet(workbook, worksheet(cleanupRows), "Cleanup");

    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = `roster-export-${status}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(file, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"` } });
  } catch (error) {
    return errorResponse("reps/export", error, "EXPORT_FAILED");
  }
}
