import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { requireActor } from "@/src/lib/firebase/server-auth";
import { errorResponse as sharedErrorResponse } from "@/src/lib/api/error-response";

export const runtime = "nodejs";

const input = z.object({
  mustChangePassword: z.literal(false),
});

function errorResponse(error: unknown) {
  return sharedErrorResponse("users/me", error);
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });

    await getAdminDb().collection("users").doc(actor.token.uid).update({
      mustChangePassword: value.data.mustChangePassword,
      passwordChangedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.token.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
