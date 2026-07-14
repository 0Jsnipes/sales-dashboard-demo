import { NextResponse } from "next/server";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { deleteAllSalesUploads, listSalesUploads } from "@/src/lib/imports/upload-admin";
import { errorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const uploads = await listSalesUploads();
    return NextResponse.json({ uploads });
  } catch (error) {
    return errorResponse("imports", error);
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
    return errorResponse("imports", error);
  }
}
