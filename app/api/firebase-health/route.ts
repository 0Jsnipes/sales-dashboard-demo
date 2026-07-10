import { NextResponse } from "next/server";
import { requireActor } from "@/src/lib/firebase/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.profile.role !== "admin" && actor.profile.role !== "superAdmin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { getAdminApp } = await import("@/src/lib/firebase/admin");
    const app = getAdminApp();
    return NextResponse.json({
      ok: true,
      route: "/api/firebase-health",
      projectId: process.env.FIREBASE_PROJECT_ID ?? null,
      clientEmailPresent: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      privateKeyPresent: Boolean(process.env.FIREBASE_PRIVATE_KEY),
      databaseId: process.env.FIREBASE_DATABASE_ID?.trim() || "default",
      storageBucketPresent: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
      initializedProjectId: app.options.projectId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ ok: false, route: "/api/firebase-health", error: message }, { status });
  }
}
