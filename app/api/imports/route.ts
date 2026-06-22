import { NextResponse } from "next/server";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { deleteAllSalesUploads, listSalesUploads } from "@/src/lib/imports/upload-admin";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const uploads = await listSalesUploads();
    return NextResponse.json({ uploads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    if (body?.all !== true) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const result = await deleteAllSalesUploads();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500 });
  }
}
