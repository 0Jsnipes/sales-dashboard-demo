import { NextResponse } from "next/server";
import { backfillKnockLcps } from "@/src/lib/knocks/backfill-lcp";
import { canRunBackfill, requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canRunBackfill(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const summary = await backfillKnockLcps();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return errorResponse("knocks/backfill-lcp", error);
  }
}
