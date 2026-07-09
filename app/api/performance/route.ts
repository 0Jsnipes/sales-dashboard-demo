import { NextResponse } from "next/server";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { buildPerformanceWindow, resolvePerformanceRange, type PerformanceResponse } from "@/src/lib/performance/window";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const range = resolvePerformanceRange(url);
    const window = await buildPerformanceWindow(range);
    const response: PerformanceResponse = {
      range,
      totals: window.totals,
      trend: window.trend,
      reps: window.reps,
      teams: window.teams,
      orders: window.orders,
      filters: window.filters,
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
