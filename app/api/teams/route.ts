import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageRoster, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";
import type { Team } from "@/src/types/team";

export const runtime = "nodejs";

const input = z.object({
  name: z.string().min(2).max(120),
  repUids: z.array(z.string().min(1)).max(500).default([]),
});

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const snapshot = await getAdminDb().collection("teams").orderBy("name").get();
    return NextResponse.json({ teams: snapshot.docs.map((document) => document.data()) });
  } catch (error) {
    return errorResponse("teams", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageRoster(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });

    const name = value.data.name.trim();
    const db = getAdminDb();
    const existing = await db.collection("teams").get();
    if (existing.docs.some((document) => String(document.data().name || "").trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "A team with this name already exists." }, { status: 409 });
    }

    const teamId = randomUUID();
    const team: Team = {
      teamId,
      name,
      repUids: [...new Set(value.data.repUids)],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.token.uid,
    };
    await db.collection("teams").doc(teamId).create(team);
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return errorResponse("teams", error);
  }
}
