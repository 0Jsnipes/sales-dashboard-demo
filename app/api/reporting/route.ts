import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canViewReporting, requireActor } from "@/src/lib/firebase/server-auth";
import { startOfWeek, toDateId } from "@/src/lib/date/week";
import { formatImportedName } from "@/src/lib/matching/display-name";
import { buildRepSearchIndex, normalizeEmail, normalizeName, normalizeSalesId } from "@/src/lib/matching/normalize";
import { normalizePerformanceOutcome } from "@/src/lib/performance/performance-utils";
import { buildSalesExportRow } from "@/src/lib/reports/sales-export";
import {
  groupAssignmentsByRep,
  normalizeAssignmentDoc,
  resolveRepLocation,
  type RepLocationAssignment,
} from "@/src/lib/reps/location-assignments";
import { sanitizeOrderId } from "@/src/lib/sales/outcomes";
import type { SalesOrderRecord } from "@/src/lib/sales/outcomes";
import type { Rep } from "@/src/types/rep";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

type ReportingKind = "sales" | "knocks";

type ReportingRow = {
  id: string;
  sortDate: string;
  title: string;
  subtitle: string;
  values: Record<string, string>;
  detail: Record<string, unknown>;
};

type ReportingPayload = {
  columns: string[];
  rows: ReportingRow[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function weekStartFromDateId(dateId: string) {
  return toDateId(startOfWeek(new Date(`${dateId}T12:00:00`)));
}

function customerName(raw: Record<string, unknown> | undefined) {
  return text(raw?.["Customer Name"] || raw?.["Customer / Address"] || raw?.Customer || raw?.["Account Name"] || raw?.Name) || "Unknown customer";
}

function providerLabel(value: unknown) {
  const source = text(value).toLowerCase();
  if (source === "att") return "ATT";
  if (source === "tfiber" || source === "t-fiber") return "T-Fiber";
  if (source === "frontier") return "Frontier";
  if (source === "manual") return "Manual";
  return source ? source.toUpperCase() : "Unknown";
}

function stringRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value),
    ]),
  );
}

function orderedColumns(rows: ReportingRow[], preferred: string[]) {
  const all = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
  const preferredSet = new Set(preferred);
  return [...preferred.filter((column) => all.includes(column)), ...all.filter((column) => !preferredSet.has(column)).sort((a, b) => a.localeCompare(b))];
}

function resolveRepFromValues(values: Record<string, unknown>, roster: Map<string, Rep>) {
  const repUid = text(values.repUid);
  if (repUid && roster.has(repUid)) return roster.get(repUid) ?? null;
  const email = normalizeEmail(String(values.rawEmail || values.repEmail || ""));
  const salesId = normalizeSalesId(String(values.rawSalesId || values.sourceRepExternalId || ""));
  const rawName = normalizeName(String(values.rawRepName || values.displayName || ""));
  for (const rep of roster.values()) {
    const index = buildRepSearchIndex(rep);
    if (email && index.emails.includes(email)) return rep;
    if (salesId && index.salesIds.includes(salesId)) return rep;
    if (rawName && index.names.includes(rawName)) return rep;
  }
  return null;
}

function resolveLocation(rep: Rep | null | undefined, orderDateId: string, assignmentsByRep: Map<string, RepLocationAssignment[]>) {
  return resolveRepLocation(rep, weekStartFromDateId(orderDateId), assignmentsByRep).locationName;
}

async function sharedContext() {
  const db = getAdminDb();
  const [repsSnapshot, assignmentsSnapshot] = await Promise.all([
    db.collection("reps").get(),
    db.collection("repLocationAssignments").get(),
  ]);
  const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
  const assignmentsByRep = groupAssignmentsByRep(
    assignmentsSnapshot.docs
      .map((document) => normalizeAssignmentDoc(document.data()))
      .filter((item): item is RepLocationAssignment => item !== null),
  );
  return { db, roster, assignmentsByRep };
}

async function salesRows(): Promise<ReportingPayload> {
  const { db, roster, assignmentsByRep } = await sharedContext();
  const [att, tfiber, manual] = await Promise.all([
    db.collection("salesOrders").doc("att").collection("orders").get(),
    db.collection("salesOrders").doc("tfiber").collection("orders").get(),
    db.collection("salesOrders").doc("manual").collection("orders").get(),
  ]);

  const rows: ReportingRow[] = [...att.docs, ...tfiber.docs, ...manual.docs].map((document) => {
    const order = document.data() as Record<string, unknown>;
    const provider = providerLabel(order.provider);
    const raw = order.rawData && typeof order.rawData === "object" ? order.rawData as Record<string, unknown> : {};
    const rep = resolveRepFromValues({ ...order, ...raw }, roster);
    const orderDateId = text(order.orderDateId);
    const record: SalesOrderRecord = {
      orderUid: text(order.orderUid || document.id),
      orderDateId,
      provider: text(order.provider),
      accountStatus: text(order.accountStatus),
      installationDateId: text(order.installationDateId) || undefined,
      estimatedInstallationDateId: text(order.estimatedInstallationDateId) || undefined,
      cancellationDateId: text(order.cancellationDateId) || undefined,
      rawData: raw,
      rawRepName: text(order.rawRepName),
      rawSalesId: text(order.rawSalesId),
      rawManagerName: text(order.rawManagerName),
      matchedRepUid: text(order.matchedRepUid) || null,
      saleCount: Number(order.saleCount || 1),
    };
    const repName = rep?.displayName || (provider === "ATT" ? formatImportedName(text(order.rawRepName)) : text(order.rawRepName)) || "Unmatched rep";
    const managerName = rep?.managerName || text(order.rawManagerName) || "No manager";
    const locationName = resolveLocation(rep, orderDateId, assignmentsByRep) || "Not assigned";
    const outcome = normalizePerformanceOutcome(record);
    const flattened = buildSalesExportRow({
      ...record,
      provider,
      orderId: text(order.orderId || order.orderUid || document.id),
      repName,
      managerName,
      locationName,
      vendorType: rep?.vendorType || "unassigned",
      customer: customerName(raw),
      outcome,
      status: text(order.accountStatus),
      pastDue: outcome === "past_due",
    });
    const address = text(raw["Customer / Address"] || raw.Address || raw["Service Address"]);
    const values = stringRecord({
      "Sale Date": orderDateId,
      Rep: repName,
      Manager: managerName,
      Location: locationName,
      Provider: provider,
      Vendor: text(rep?.vendorType || "unassigned"),
      "Order ID": sanitizeOrderId(order.orderId || order.orderUid || document.id),
      Status: text(order.accountStatus),
      Customer: customerName(raw),
      Address: address,
    });
    const customer = customerName(raw);
    const orderId = sanitizeOrderId(order.orderId || order.orderUid || document.id);
    return {
      id: `sales:${document.ref.parent.parent?.id}:${document.id}`,
      sortDate: orderDateId,
      title: customer,
      subtitle: `${provider} / ${orderId} / ${orderDateId}`,
      values,
      detail: {
        ...flattened,
        rawData: raw,
        repUid: rep?.repUid ?? null,
        repName,
        managerName,
        locationName,
        vendorType: text(rep?.vendorType || "unassigned"),
        documentId: document.id,
      },
    };
  }).sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.title.localeCompare(b.title));

  return {
    columns: orderedColumns(rows, ["Sale Date", "Rep", "Order ID", "Status", "Customer", "Address", "Manager", "Location", "Provider", "Vendor"]),
    rows,
  };
}

async function knockRows(): Promise<ReportingPayload> {
  const { db, roster, assignmentsByRep } = await sharedContext();
  const dayRefs = await db.collection("knockDaily").listDocuments();
  const snapshots = await Promise.all(dayRefs.map(async (ref) => ({ dateId: ref.id, reps: await ref.collection("reps").get() })));
  const rows: ReportingRow[] = [];

  for (const { dateId, reps } of snapshots) {
    for (const document of reps.docs) {
      const data = document.data() as Record<string, unknown>;
      const rep = resolveRepFromValues({ ...data, repUid: document.id }, roster);
      const attKnocks = Number(data.attKnocks ?? 0);
      const tfiberKnocks = Number(data.tfiberKnocks ?? 0);
      const totalKnocks = Number(data.knocks ?? data.count ?? attKnocks + tfiberKnocks);
      const repName = rep?.displayName || text(data.displayName || data.rawRepName) || "Unmatched rep";
      const managerName = rep?.managerName || text(data.managerName) || "No manager";
      const locationName = resolveLocation(rep, dateId, assignmentsByRep) || text(data.locationName) || "Not assigned";
      const provider = attKnocks && tfiberKnocks ? "Mixed" : attKnocks ? "ATT" : tfiberKnocks ? "T-Fiber" : "Unknown";
      const vendor = text(rep?.vendorType || "unassigned");
      const raw = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
      const values = stringRecord({
        Date: dateId,
        Rep: repName,
        Manager: managerName,
        Location: locationName,
        Provider: provider,
        Vendor: vendor,
        "Order ID": sanitizeOrderId(data.orderId),
        Status: text(data.accountStatus || "Recorded"),
        Customer: text(data.customer || data["Customer Name"]),
        Address: text(data["Customer / Address"] || data.Address || data["Service Address"]),
        "ATT Knocks": attKnocks,
        "T-Fiber Knocks": tfiberKnocks,
        "Total Knocks": totalKnocks,
      });
      rows.push({
        id: `knocks:${dateId}:${document.id}`,
        sortDate: dateId,
        title: repName,
        subtitle: `${provider} / ${dateId} / ${totalKnocks} knocks`,
        values,
        detail: {
          ...raw,
          dateId,
          repUid: rep?.repUid ?? null,
          repName,
          managerName,
          locationName,
          vendorType: vendor,
          totalKnocks,
          attKnocks,
          tfiberKnocks,
          rawData: raw,
        },
      });
    }
  }

  rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.title.localeCompare(b.title));
  return {
    columns: orderedColumns(rows, ["Date", "Rep", "Order ID", "Status", "Customer", "Address", "Manager", "Location", "Provider", "Vendor", "Total Knocks", "ATT Knocks", "T-Fiber Knocks"]),
    rows,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canViewReporting(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "knocks" ? "knocks" : "sales";
    const payload = kind === "knocks" ? await knockRows() : await salesRows();
    return NextResponse.json({ kind, ...payload } satisfies { kind: ReportingKind; columns: string[]; rows: ReportingRow[] });
  } catch (error) {
    return errorResponse("reporting", error);
  }
}
