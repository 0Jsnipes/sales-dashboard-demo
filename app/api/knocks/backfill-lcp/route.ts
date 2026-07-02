import { NextResponse } from "next/server";
import { backfillKnockLcps } from "@/src/lib/knocks/backfill-lcp";
import { canRunBackfill, requireActor } from "@/src/lib/firebase/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canRunBackfill(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const summary = await backfillKnockLcps();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
