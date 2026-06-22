import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebase/admin";
import type { Rep } from "@/src/types/rep";
import { normalizeName } from "@/src/lib/matching/normalize";
import { rematchTFiberOrdersForRep } from "@/src/lib/imports/tfiber";
import { rematchATTOrdersForRep } from "@/src/lib/imports/att";
import { normalizeEmail, normalizeSalesId } from "@/src/lib/matching/normalize";
import { z } from "zod";

type Params = { params: Promise<{ repUid: string }> };
const socials = z.object({ instagram: z.string().max(160).optional(), facebook: z.string().max(160).optional(), tiktok: z.string().max(160).optional(), linkedin: z.string().max(160).optional() }).default({});
const updateRep = z.object({ displayName: z.string().min(2).max(120), email: z.union([z.string().email(), z.literal("")]).default(""), phone: z.string().max(40).optional(), managerUid: z.string().nullable().optional(), managerName: z.string().max(120).default(""), locationId: z.string().min(1).max(80), locationName: z.string().min(1).max(120), programIds: z.array(z.string().min(1).max(80)).default([]), vendorType: z.enum(["organic", "subVendor"]).default("organic"), weeklySalesGoal: z.number().int().min(0).max(10000).default(0), weeklyKnocksGoal: z.number().int().min(0).max(10000).default(0), salesIds: z.array(z.string().min(1).max(80)).default([]), aliases: z.array(z.string().min(1).max(120)).default([]), socials });

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { repUid } = await params;
    const body = await request.json() as { action?: "terminate" | "restore" | "addAlias" | "update" | "setGoal"; goalType?: "sales" | "knocks"; sendTerminationEmail?: boolean; alias?: string; weeklySalesGoal?: unknown; weeklyKnocksGoal?: unknown; rep?: unknown };
    if (body.action !== "terminate" && body.action !== "restore" && body.action !== "addAlias" && body.action !== "update" && body.action !== "setGoal") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    const reference = getAdminDb().collection("reps").doc(repUid);
    const snapshot = await reference.get();
    if (!snapshot.exists) return NextResponse.json({ error: "REP_NOT_FOUND" }, { status: 404 });
    const rep = snapshot.data() as Rep;
    if (body.action === "setGoal") {
      const goalType = body.goalType === "knocks" ? "knocks" : "sales";
      const goalValue = goalType === "knocks" ? body.weeklyKnocksGoal : body.weeklySalesGoal;
      const parsed = z.number().int().min(0).max(10000).safeParse(goalValue);
      if (!parsed.success) return NextResponse.json({ error: goalType === "knocks" ? "INVALID_WEEKLY_KNOCKS_GOAL" : "INVALID_WEEKLY_SALES_GOAL" }, { status: 400 });
      await reference.update({ [goalType === "knocks" ? "weeklyKnocksGoal" : "weeklySalesGoal"]: parsed.data, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid });
      return NextResponse.json(goalType === "knocks" ? { weeklyKnocksGoal: parsed.data } : { weeklySalesGoal: parsed.data });
    }
    if (body.action === "update") {
      const input = updateRep.safeParse(body.rep);
      if (!input.success) return NextResponse.json({ error: input.error.flatten() }, { status: 400 });
      const [firstName = "", ...rest] = input.data.displayName.trim().split(/\s+/);
      const updated = { ...rep, displayName: input.data.displayName.trim(), firstName, lastName: rest.join(" "), email: input.data.email.trim(), emailNormalized: normalizeEmail(input.data.email), phone: input.data.phone?.trim() || "", salesIds: input.data.salesIds.map(normalizeSalesId), aliases: input.data.aliases.map((alias) => alias.trim()), managerUid: input.data.managerUid ?? null, managerName: input.data.managerName.trim(), locationId: input.data.locationId.trim(), locationName: input.data.locationName.trim(), programIds: input.data.programIds.map((program) => program.trim()), vendorType: input.data.vendorType, weeklySalesGoal: input.data.weeklySalesGoal, weeklyKnocksGoal: input.data.weeklyKnocksGoal, socials: input.data.socials };
      await reference.update({ ...updated, search: { displayName: normalizeName(updated.displayName), aliases: updated.aliases.map(normalizeName), salesIds: updated.salesIds.map(normalizeSalesId) }, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid });
      const [rematchedTFiberOrders, rematchedATTOrders] = await Promise.all([rematchTFiberOrdersForRep(updated), rematchATTOrdersForRep(updated)]);
      return NextResponse.json({ rep: updated, rematchedTFiberOrders, rematchedATTOrders });
    }
    if (body.action === "addAlias") {
      const alias = body.alias?.trim();
      if (!alias || alias.length > 120) return NextResponse.json({ error: "INVALID_ALIAS" }, { status: 400 });
      const aliases = rep.aliases.some((current) => normalizeName(current) === normalizeName(alias)) ? rep.aliases : [...rep.aliases, alias];
      const updatedRep = { ...rep, aliases };
      await reference.update({ aliases, "search.aliases": aliases.map(normalizeName), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid });
      const [rematchedTFiberOrders, rematchedATTOrders] = await Promise.all([rematchTFiberOrdersForRep(updatedRep), rematchATTOrdersForRep(updatedRep)]);
      return NextResponse.json({ aliases, rematchedTFiberOrders, rematchedATTOrders });
    }
    if (body.action === "restore") {
      await reference.update({ status: "active", terminatedAt: FieldValue.delete(), terminatedBy: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid });
      if (rep.authUid) { await getAdminAuth().updateUser(rep.authUid, { disabled: false }); await reference.update({ accountStatus: "active" }); }
      return NextResponse.json({ status: "active" });
    }
    const updates: Record<string, unknown> = { status: "terminated", terminatedAt: FieldValue.serverTimestamp(), terminatedBy: actor.token.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.token.uid, terminationEmailStatus: body.sendTerminationEmail ? "queued" : "notSent" };
    if (rep.authUid) { await getAdminAuth().updateUser(rep.authUid, { disabled: true }); updates.accountStatus = "disabled"; }
    await reference.update(updates);
    if (body.sendTerminationEmail) {
      await getAdminDb().collection("mail").add({ to: [rep.email], message: { subject: "Important update from AB Marketing", text: `Hi ${rep.firstName},\n\nYour representative status with AB Marketing has been updated. Please contact your manager or operations team with any questions.\n\nAB Marketing Operations`, html: `<p>Hi ${rep.firstName},</p><p>Your representative status with AB Marketing has been updated. Please contact your manager or operations team with any questions.</p><p>AB Marketing Operations</p>` }, metadata: { type: "termination", repUid, requestedBy: actor.token.uid }, createdAt: FieldValue.serverTimestamp() });
    }
    return NextResponse.json({ status: "terminated", emailStatus: updates.terminationEmailStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
