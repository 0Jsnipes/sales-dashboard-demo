import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeEmail, normalizeName, normalizeSalesId } from "@/src/lib/matching/normalize";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { rematchTFiberOrdersForRep } from "@/src/lib/imports/tfiber";
import { rematchATTOrdersForRep } from "@/src/lib/imports/att";
import { parseCommonFilters, applyTextSearchFilter } from "@/src/lib/api/report-filters";

export const runtime = "nodejs";

const socials = z.object({ instagram: z.string().max(160).optional(), facebook: z.string().max(160).optional(), tiktok: z.string().max(160).optional(), linkedin: z.string().max(160).optional() }).default({});
const createRep = z.object({ displayName: z.string().min(2).max(120), email: z.union([z.string().email(), z.literal("")]).default(""), phone: z.string().max(40).optional(), managerUid: z.string().nullable().optional(), managerName: z.string().max(120).default(""), locationId: z.string().min(1).max(80), locationName: z.string().min(1).max(120), programIds: z.array(z.string().min(1).max(80)).default([]), vendorType: z.enum(["organic", "subVendor"]).default("organic"), weeklySalesGoal: z.number().int().min(0).max(10000).default(0), weeklyKnocksGoal: z.number().int().min(0).max(10000).default(0), salesIds: z.array(z.string().min(1).max(80)).default([]), aliases: z.array(z.string().min(1).max(120)).default([]), socials });

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const db = getAdminDb();
    const url = new URL(request.url);
    const filters = parseCommonFilters(url.searchParams);
    const status = url.searchParams.get("status") || "active";
    if (!["active", "inactive", "terminated", "all"].includes(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    let snapshot;
    if (actor.profile.role === "superAdmin" || actor.profile.role === "admin") {
      const query = status === "all" ? db.collection("reps") : db.collection("reps").where("status", "==", status);
      snapshot = await query.limit(filters.limit ?? 250).get();
    } else if (actor.profile.role === "manager" && actor.profile.repUid) {
      snapshot = await db.collection("reps").where("managerUid", "==", actor.profile.repUid).limit(filters.limit ?? 250).get();
    } else if (actor.profile.repUid) {
      snapshot = await db.collection("reps").where("repUid", "==", actor.profile.repUid).limit(1).get();
    } else {
      return NextResponse.json({ reps: [] });
    }
    const reps = snapshot.docs.map((document) => document.data());
    const filtered = applyTextSearchFilter(reps, filters.search, (rep) => [
      String((rep as { displayName?: string }).displayName || ""),
      String((rep as { email?: string }).email || ""),
      String((rep as { phone?: string }).phone || ""),
      String((rep as { managerName?: string }).managerName || ""),
      String((rep as { locationName?: string }).locationName || ""),
      String((rep as { salesIds?: string[] }).salesIds?.join(" ") || ""),
      String((rep as { aliases?: string[] }).aliases?.join(" ") || ""),
    ].join(" ")).filter((rep) => {
      const record = rep as { status?: string; managerName?: string; locationName?: string; programIds?: string[]; vendorType?: string };
      return (!filters.status || filters.status === "all" || record.status === filters.status)
        && (!filters.manager || filters.manager === "all" || record.managerName === filters.manager)
        && (!filters.location || filters.location === "all" || record.locationName === filters.location)
        && (!filters.program || filters.program === "all" || record.programIds?.includes(filters.program))
        && (!filters.vendor || filters.vendor === "all" || record.vendorType === filters.vendor);
    });
    return NextResponse.json({ reps: filtered.sort((a, b) => String((a as { displayName?: string }).displayName || "").localeCompare(String((b as { displayName?: string }).displayName || ""))), meta: { filtersApplied: Object.entries(filters).filter(([, value]) => Boolean(value)), count: filtered.length } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const input = createRep.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.flatten() }, { status: 400 });
    const [firstName = "", ...rest] = input.data.displayName.trim().split(/\s+/);
    const document = getAdminDb().collection("reps").doc();
    const rep = {
      repUid: document.id, displayName: input.data.displayName.trim(), firstName, lastName: rest.join(" "), email: input.data.email.trim(), emailNormalized: normalizeEmail(input.data.email), phone: input.data.phone?.trim() || "", salesIds: input.data.salesIds.map(normalizeSalesId), aliases: input.data.aliases.map((alias) => alias.trim()), managerUid: input.data.managerUid ?? null, managerName: input.data.managerName.trim(), locationId: input.data.locationId.trim(), locationName: input.data.locationName.trim(), programIds: input.data.programIds.map((program) => program.trim()), vendorType: input.data.vendorType, weeklySalesGoal: input.data.weeklySalesGoal, weeklyKnocksGoal: input.data.weeklyKnocksGoal, socials: input.data.socials, status: "active" as const, authUid: null, accountStatus: "none" as const, onboarding: { onboarded: false, checks: {} }, search: { displayName: normalizeName(input.data.displayName), aliases: input.data.aliases.map(normalizeName), salesIds: input.data.salesIds.map(normalizeSalesId) }, createdAt: FieldValue.serverTimestamp(), createdBy: actor.token.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid,
    };
    await document.create(rep);
    const [rematchedTFiberOrders, rematchedATTOrders] = await Promise.all([rematchTFiberOrdersForRep(rep), rematchATTOrdersForRep(rep)]);
    return NextResponse.json({ rep, rematchedTFiberOrders, rematchedATTOrders }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
