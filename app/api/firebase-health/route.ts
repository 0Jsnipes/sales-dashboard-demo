import { NextResponse } from "next/server";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { resolveErrorStatus } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.profile.role !== "admin" && actor.profile.role !== "superAdmin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      route: "/api/firebase-health",
      mode: "demo",
      note: "This deployment is a self-contained portfolio demo backed by an in-memory data store — there is no live Firebase project to report on.",
    });
  } catch (error) {
    const { message, status } = resolveErrorStatus(error);
    return NextResponse.json({ ok: false, route: "/api/firebase-health", error: message }, { status });
  }
}
