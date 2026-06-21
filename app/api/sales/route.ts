import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import type { Rep } from "@/src/types/rep";
import { formatImportedName } from "@/src/lib/matching/display-name";

type SalesGroup = { key: string; repUid: string | null; displayName: string; rawSalesId: string; programName: string; vendorType: "organic" | "subVendor" | "unassigned"; weeklySalesGoal: number; managerName: string; locationName: string; days: number[]; total: number; accountStatuses: Record<string, number> };

const dateId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const isoWeek = (date: Date) => { const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1)); const week = Math.ceil((((value.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7); return value.getUTCFullYear() + "-W" + String(week).padStart(2, "0"); };
function currentWeek(weekStart?: string | null) {
  const requested = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? new Date(`${weekStart}T12:00:00`) : null;
  const today = requested && !Number.isNaN(requested.valueOf()) ? requested : new Date(); const day = today.getDay(); const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday, sunday };
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const { monday, sunday } = currentWeek(new URL(request.url).searchParams.get("weekStart")); const start = dateId(monday); const end = dateId(sunday);
    const db = getAdminDb();
    const [tfiberSnapshot, attSnapshot, manualSnapshot, repsSnapshot, assignmentsSnapshot] = await Promise.all([
      db.collection("salesOrders").doc("tfiber").collection("orders").where("orderDateId", ">=", start).where("orderDateId", "<=", end).get(),
      db.collection("salesOrders").doc("att").collection("orders").where("orderDateId", ">=", start).where("orderDateId", "<=", end).get(),
      db.collection("salesOrders").doc("manual").collection("orders").where("orderDateId", ">=", start).where("orderDateId", "<=", end).get(),
      db.collection("reps").get(),
      db.collection("repLocationAssignments").get(),
    ]);
    const roster = new Map(repsSnapshot.docs.map((document) => [document.id, document.data() as Rep]));
    const selectedWeek = isoWeek(monday);
    const resolveLocation = (rep: Rep | undefined) => {
      if (!rep) return "";
      const assignments = assignmentsSnapshot.docs.map((document) => document.data()).filter((item) => item.repUid === rep.repUid);
      const single = assignments.find((item) => item.mode === "single" && item.weekISO === selectedWeek);
      if (single) return String(single.locationName);
      const forward = assignments.filter((item) => item.mode === "forward" && String(item.weekISO) <= selectedWeek).sort((a, b) => String(a.weekISO).localeCompare(String(b.weekISO))).pop();
      return forward ? String(forward.locationName) : rep.locationName;
    };
    const groups = new Map<string, SalesGroup>();
    for (const document of [...tfiberSnapshot.docs, ...attSnapshot.docs, ...manualSnapshot.docs]) {
      const order = document.data();
      const [year, month, day] = String(order.orderDateId).split("-").map(Number);
      const dayIndex = Math.max(0, Math.min(6, Math.round((Date.UTC(year, month - 1, day) - Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())) / 86_400_000)));
      const rep = order.matchedRepUid ? roster.get(order.matchedRepUid) : undefined;
      const isATT = String(order.provider || "").toLowerCase() === "att";
      const rawName = isATT ? formatImportedName(order.rawRepName || "Unassigned representative") : String(order.rawRepName || "Unassigned representative").trim();
      const key = rep ? `rep:${rep.repUid}` : `unmatched:${rawName.toLowerCase()}:${String(order.rawSalesId || "")}`;
      const group: SalesGroup = groups.get(key) ?? { key, repUid: rep?.repUid ?? null, displayName: rep?.displayName ?? rawName, rawSalesId: String(order.rawSalesId || ""), programName: isATT ? "ATT" : "T-Fiber", vendorType: rep?.vendorType ?? "unassigned", weeklySalesGoal: Number(rep?.weeklySalesGoal ?? 0), managerName: rep?.managerName ?? (isATT ? "" : String(order.rawManagerName || "")), locationName: resolveLocation(rep), days: [0, 0, 0, 0, 0, 0, 0], total: 0, accountStatuses: {} };
      const count = Number(order.saleCount || 1); group.days[dayIndex] += count; group.total += count; const accountStatus = String(order.accountStatus || "Unknown"); group.accountStatuses[accountStatus] = (group.accountStatuses[accountStatus] || 0) + count; groups.set(key, group);
    }
    return NextResponse.json({ week: { start, end }, reps: [...groups.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)) });
  } catch (error) { const message = error instanceof Error ? error.message : "UNKNOWN"; return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 }); }
}
