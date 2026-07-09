import { parseISO } from "date-fns";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { buildWorksheetData, buildSalesExportRows } from "@/src/lib/reports/sales-export";
import { calculateCancellationRate, calculateInstallRate, type PerformanceOrder } from "@/src/lib/performance/performance-utils";
import { buildPerformanceWindow, resolvePerformanceRange, type PerformanceResponse, type RepSummary, type TeamSummary } from "@/src/lib/performance/window";
import { toDateId } from "@/src/lib/date/week";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function unitsFor(order: PerformanceOrder) {
  return Number(order.saleCount ?? 1) || 1;
}

function statusLabel(order: PerformanceOrder) {
  if (order.pastDue) return "Past due";
  const value = text(order.status);
  if (!value || normalize(value) === "unknown") {
    if (order.outcome === "preorder") return "Preorder";
    return "Unknown";
  }
  return value;
}

function matchesSelected(value: unknown, selected: string) {
  return selected === "all" || normalize(value) === normalize(selected);
}

function matchesRepSelection(order: PerformanceOrder, selected: string) {
  if (selected === "all") return true;
  return normalize(order.repUid ?? "") === normalize(selected) || normalize(order.repName) === normalize(selected);
}

function matchesRepSelectionValue(repUid: string | null | undefined, displayName: string, selected: string) {
  if (selected === "all") return true;
  return normalize(repUid ?? "") === normalize(selected) || normalize(displayName) === normalize(selected);
}

function matchesVendorSelection(value: unknown, selected: string) {
  return selected === "all" || normalize(value) === normalize(selected);
}

function vendorTypeLabel(value: unknown) {
  const normalized = normalize(value);
  if (normalized === "organic") return "Organic";
  if (normalized === "subvendor") return "Subvendors";
  if (normalized === "unassigned") return "Unassigned";
  return text(value) || "Unassigned";
}

function labelForRepFilter(reps: PerformanceResponse["filters"]["reps"], selected: string) {
  if (selected === "all") return "All reps";
  return reps.find((item) => normalize(item.repUid) === normalize(selected) || normalize(item.displayName) === normalize(selected))?.displayName ?? selected;
}

function buildDailyTrend(orders: PerformanceOrder[], start: string, end: string) {
  const map = new Map<string, number>();
  for (const order of orders) {
    map.set(order.orderDateId, (map.get(order.orderDateId) ?? 0) + unitsFor(order));
  }

  const rows: Array<{ dateId: string; sales: number }> = [];
  const cursor = parseISO(`${start}T12:00:00`);
  const last = parseISO(`${end}T12:00:00`);
  while (cursor <= last) {
    const dateId = toDateId(cursor);
    rows.push({ dateId, sales: map.get(dateId) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function countOutcomes(orders: PerformanceOrder[]) {
  const totals = { installed: 0, pending: 0, past_due: 0, preorder: 0, canceled: 0, churned: 0, unknown: 0 };
  for (const order of orders) {
    const units = unitsFor(order);
    const outcome = order.outcome ?? "unknown";
    if (outcome === "installed") totals.installed += units;
    else if (outcome === "pending") totals.pending += units;
    else if (outcome === "past_due") {
      totals.pending += units;
      totals.past_due += units;
    } else if (outcome === "preorder") totals.preorder += units;
    else if (outcome === "canceled") totals.canceled += units;
    else if (outcome === "churned") totals.churned += units;
    else totals.unknown += units;
  }
  return totals;
}

function groupTeamRows(rows: Array<{ managerName: string; locationName: string; repUid: string | null; displayName: string; sales: number; knocks: number }>, key: "managerName" | "locationName"): TeamSummary[] {
  const map = new Map<string, { name: string; sales: number; knocks: number; reps: Set<string> }>();
  for (const row of rows) {
    const name = text(row[key]) || (key === "managerName" ? "No manager" : "Not assigned");
    const current = map.get(name) ?? { name, sales: 0, knocks: 0, reps: new Set<string>() };
    current.sales += Number(row.sales || 0);
    current.knocks += Number(row.knocks || 0);
    current.reps.add(row.repUid ? row.repUid : row.displayName);
    map.set(name, current);
  }

  return [...map.values()]
    .map((row) => ({
      name: row.name,
      sales: row.sales,
      knocks: row.knocks,
      reps: row.reps.size,
      conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0,
    }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const data = buildWorksheetData(rows);
  const worksheet = XLSX.utils.json_to_sheet(data.rows, { header: data.headers });
  XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31) || "Sheet1");
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const range = resolvePerformanceRange(url);
    const window = await buildPerformanceWindow(range);

    const managerFilter = url.searchParams.get("manager") || "all";
    const locationFilter = url.searchParams.get("location") || "all";
    const repFilter = url.searchParams.get("rep") || "all";
    const providerFilter = url.searchParams.get("provider") || "all";
    const vendorFilter = url.searchParams.get("vendor") || "all";

    const scopedOrders = window.orders.filter((order) => {
      if (!matchesSelected(order.managerName, managerFilter)) return false;
      if (!matchesSelected(order.locationName, locationFilter)) return false;
      if (!matchesRepSelection(order, repFilter)) return false;
      if (!matchesSelected(order.provider, providerFilter)) return false;
      if (!matchesVendorSelection(order.vendorType ?? "unassigned", vendorFilter)) return false;
      return true;
    });

    const scopedReps = new Map<string, RepSummary>();
    for (const rep of window.reps) {
      if (!matchesSelected(rep.managerName, managerFilter)) continue;
      if (!matchesSelected(rep.locationName, locationFilter)) continue;
      if (!matchesVendorSelection(rep.vendorType, vendorFilter)) continue;
      if (!matchesRepSelectionValue(rep.repUid, rep.displayName, repFilter)) continue;
      const key = normalize(rep.repUid ?? rep.displayName);
      scopedReps.set(key, {
        ...rep,
        sales: 0,
        installed: 0,
        pending: 0,
        pastDue: 0,
        preorder: 0,
        canceled: 0,
        churned: 0,
        unknown: 0,
        total: 0,
      });
    }

    for (const order of scopedOrders) {
      const key = normalize(order.repUid ?? order.repName);
      const row = scopedReps.get(key);
      if (!row) continue;
      const units = unitsFor(order);
      row.sales += units;
      row.total += units;
      if (order.outcome === "installed") row.installed += units;
      else if (order.outcome === "pending") row.pending += units;
      else if (order.outcome === "past_due") {
        row.pending += units;
        row.pastDue += units;
      } else if (order.outcome === "preorder") row.preorder += units;
      else if (order.outcome === "canceled") row.canceled += units;
      else if (order.outcome === "churned") row.churned += units;
      else row.unknown += units;
    }

    const activeScopeReps = [...scopedReps.values()]
      .map((row) => ({
        ...row,
        total: row.sales + row.knocks,
        conversion: row.knocks ? Math.round((row.sales / row.knocks) * 100) : 0,
      }))
      .filter((rep) => rep.sales > 0 || rep.knocks > 0)
      .sort((a, b) => b.sales - a.sales || b.knocks - a.knocks || a.displayName.localeCompare(b.displayName));

    const outcomeTotals = countOutcomes(scopedOrders);
    const scopedTotals = {
      sales: scopedOrders.reduce((sum, order) => sum + unitsFor(order), 0),
      knocks: activeScopeReps.reduce((sum, rep) => sum + Number(rep.knocks || 0), 0),
      attKnocks: activeScopeReps.reduce((sum, rep) => sum + Number(rep.attKnocks || 0), 0),
      tfiberKnocks: activeScopeReps.reduce((sum, rep) => sum + Number(rep.tfiberKnocks || 0), 0),
      conversion: 0,
      installed: outcomeTotals.installed,
      pending: outcomeTotals.pending,
      pastDue: outcomeTotals.past_due,
      preorder: outcomeTotals.preorder,
      canceled: outcomeTotals.canceled,
      churned: outcomeTotals.churned,
      unknown: outcomeTotals.unknown,
      activeReps: activeScopeReps.length,
      orderCount: scopedOrders.length,
    };
    scopedTotals.conversion = scopedTotals.knocks ? Math.round((scopedTotals.sales / scopedTotals.knocks) * 100) : 0;

    const trendData = buildDailyTrend(scopedOrders, range.start, range.end);
    const providerBreakdown = [...scopedOrders.reduce((map, order) => {
      const provider = order.provider || "Manual";
      map.set(provider, (map.get(provider) ?? 0) + unitsFor(order));
      return map;
    }, new Map<string, number>()).entries()]
      .map(([name, value]) => ({
        Provider: name,
        Sales: value,
        "Share %": scopedTotals.sales ? Math.round((value / scopedTotals.sales) * 100) : 0,
      }))
      .sort((a, b) => Number(b.Sales) - Number(a.Sales) || String(a.Provider).localeCompare(String(b.Provider)));

    const managerRows = groupTeamRows(activeScopeReps, "managerName");
    const locationRows = groupTeamRows(activeScopeReps, "locationName");
    const pastDueRows = scopedOrders
      .filter((order) => order.pastDue || order.outcome === "past_due")
      .sort((a, b) => (text(a.estimatedInstallationDateId) || a.orderDateId).localeCompare(text(b.estimatedInstallationDateId) || b.orderDateId) || a.orderDateId.localeCompare(b.orderDateId));
    const canceledRows = scopedOrders
      .filter((order) => order.outcome === "canceled" || normalize(statusLabel(order)) === "canceled")
      .sort((a, b) => a.orderDateId.localeCompare(b.orderDateId) || a.repName.localeCompare(b.repName));

    const selectedRepLabel = labelForRepFilter(window.filters.reps, repFilter);
    const selectedProviderLabel = providerFilter === "all" ? "All providers" : providerFilter;
    const selectedVendorLabel = vendorFilter === "all" ? "All vendor types" : vendorTypeLabel(vendorFilter);
    const topFiltersLabel = [
      managerFilter === "all" ? "All managers" : managerFilter,
      locationFilter === "all" ? "All locations" : locationFilter,
      selectedRepLabel,
      selectedProviderLabel,
      selectedVendorLabel,
    ].join(" / ");

    const installRate = calculateInstallRate(scopedTotals.sales, scopedTotals.installed);
    const cancellationRate = calculateCancellationRate(scopedTotals.sales, scopedTotals.canceled);

    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, "Scope Pivot", [{
      Range: range.mode,
      "Date Start": range.start,
      "Date End": range.end,
      Scope: topFiltersLabel,
      "Total Sales": scopedTotals.sales,
      Knocks: scopedTotals.knocks,
      "ATT Knocks": scopedTotals.attKnocks,
      "T-Fiber Knocks": scopedTotals.tfiberKnocks,
      "Conversion %": scopedTotals.conversion,
      Installed: scopedTotals.installed,
      Pending: scopedTotals.pending,
      "Past Due": scopedTotals.pastDue,
      Preorder: scopedTotals.preorder,
      Canceled: scopedTotals.canceled,
      Churned: scopedTotals.churned,
      Unknown: scopedTotals.unknown,
      "Active Reps": scopedTotals.activeReps,
      Orders: scopedTotals.orderCount,
      "Install Rate %": installRate,
      "Cancellation Rate %": cancellationRate,
    }]);
    appendSheet(workbook, "Trend Pivot", trendData.map((row) => ({ Date: row.dateId, Sales: row.sales })));
    appendSheet(workbook, "Outcome Pivot", [
      { Status: "Installed", Sales: scopedTotals.installed, "Share %": scopedTotals.sales ? Math.round((scopedTotals.installed / scopedTotals.sales) * 100) : 0 },
      { Status: "Pending", Sales: scopedTotals.pending, "Share %": scopedTotals.sales ? Math.round((scopedTotals.pending / scopedTotals.sales) * 100) : 0 },
      { Status: "Past due", Sales: scopedTotals.pastDue, "Share %": scopedTotals.sales ? Math.round((scopedTotals.pastDue / scopedTotals.sales) * 100) : 0 },
      { Status: "Preorder", Sales: scopedTotals.preorder, "Share %": scopedTotals.sales ? Math.round((scopedTotals.preorder / scopedTotals.sales) * 100) : 0 },
      { Status: "Canceled", Sales: scopedTotals.canceled, "Share %": scopedTotals.sales ? Math.round((scopedTotals.canceled / scopedTotals.sales) * 100) : 0 },
      { Status: "Churned", Sales: scopedTotals.churned, "Share %": scopedTotals.sales ? Math.round((scopedTotals.churned / scopedTotals.sales) * 100) : 0 },
    ]);
    appendSheet(workbook, "Provider Pivot", providerBreakdown);
    appendSheet(workbook, "Rep Pivot", activeScopeReps.map((row) => ({
      Rep: row.displayName,
      Manager: row.managerName || "No manager",
      Location: row.locationName || "Not assigned",
      Sales: row.sales,
      Knocks: row.knocks,
      Installed: row.installed,
      Pending: row.pending,
      "Past Due": row.pastDue,
      "Sales Share %": scopedTotals.sales ? Math.round((row.sales / scopedTotals.sales) * 100) : 0,
    })));
    appendSheet(workbook, "Manager Pivot", managerRows.map((row) => ({
      Manager: row.name,
      Sales: row.sales,
      Knocks: row.knocks,
      Reps: row.reps,
      "Conversion %": row.conversion,
    })));
    appendSheet(workbook, "Location Pivot", locationRows.map((row) => ({
      Location: row.name,
      Sales: row.sales,
      Knocks: row.knocks,
      Reps: row.reps,
      "Conversion %": row.conversion,
    })));
    appendSheet(workbook, "All Sales", buildSalesExportRows(scopedOrders));

    const attSalesRows = scopedOrders.filter((order) => order.provider === "ATT");
    const tfiberSalesRows = scopedOrders.filter((order) => order.provider === "T-Fiber");
    appendSheet(workbook, "ATT Sales", buildSalesExportRows(attSalesRows));
    appendSheet(workbook, "T-Fiber Sales", buildSalesExportRows(tfiberSalesRows));
    appendSheet(workbook, "Past Due", buildSalesExportRows(pastDueRows));
    appendSheet(workbook, "Canceled", buildSalesExportRows(canceledRows));

    const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="performance-report-${toDateId(new Date())}.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_FAILED";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
