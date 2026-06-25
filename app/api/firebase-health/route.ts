import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
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
    return NextResponse.json({
      ok: false,
      route: "/api/firebase-health",
      projectId: process.env.FIREBASE_PROJECT_ID ?? null,
      clientEmailPresent: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      privateKeyPresent: Boolean(process.env.FIREBASE_PRIVATE_KEY),
      databaseId: process.env.FIREBASE_DATABASE_ID?.trim() || "default",
      storageBucketPresent: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
      error: error instanceof Error ? error.message : "UNKNOWN",
    }, { status: 500 });
  }
}
