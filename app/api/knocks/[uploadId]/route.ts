import { NextResponse } from "next/server";
import { canImportSales, requireActor } from "@/src/lib/firebase/server-auth";
import { deleteKnockUpload } from "@/src/lib/imports/upload-admin";

export const runtime = "nodejs";

type Params = { params: Promise<{ uploadId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canImportSales(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { uploadId } = await params;
    if (!uploadId) return NextResponse.json({ error: "UPLOAD_ID_REQUIRED" }, { status: 400 });
    const result = await deleteKnockUpload(uploadId);
    if (!result.deletedRun) return NextResponse.json({ error: "UPLOAD_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : message === "PROFILE_NOT_FOUND" ? 403 : 500 });
  }
}
