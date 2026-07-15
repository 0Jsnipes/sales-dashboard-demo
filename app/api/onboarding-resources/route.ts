import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/src/lib/api/error-response";
import { getAdminDb } from "@/src/lib/firebase/admin";
import { canManageOnboarding, requireActor } from "@/src/lib/firebase/server-auth";
import type { OnboardingCategory, OnboardingResource } from "@/src/components/onboarding/onboarding-resources";

export const runtime = "nodejs";

const categorySchema = z.enum(["Programs", "UID", "Tools", "Training", "Forms", "Support"]);
const inputSchema = z.object({
  category: categorySchema,
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(500),
  url: z.string().trim().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Enter a valid http or https URL."),
});

const presentation: Record<OnboardingCategory, Pick<OnboardingResource, "icon" | "accent">> = {
  Programs: { icon: "globe", accent: "blue" },
  UID: { icon: "id", accent: "slate" },
  Tools: { icon: "link", accent: "emerald" },
  Training: { icon: "graduation", accent: "orange" },
  Forms: { icon: "file", accent: "blue" },
  Support: { icon: "help", accent: "pink" },
};

function resourceFromDocument(id: string, data: Record<string, unknown>): OnboardingResource | null {
  const value = inputSchema.safeParse({
    category: data.category,
    label: data.label,
    description: data.description,
    url: data.href,
  });
  if (!value.success) return null;
  return {
    id,
    category: value.data.category,
    label: value.data.label,
    description: value.data.description,
    href: value.data.url,
    status: "external",
    ...presentation[value.data.category],
  };
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const snapshot = await getAdminDb().collection("onboardingResources").get();
    const resources = snapshot.docs
      .map((document) => resourceFromDocument(document.id, document.data()))
      .filter((resource): resource is OnboardingResource => resource !== null)
      .sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label));
    return NextResponse.json({ resources });
  } catch (error) {
    return errorResponse("onboarding-resources", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!canManageOnboarding(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = inputSchema.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });

    const document = await getAdminDb().collection("onboardingResources").add({
      category: value.data.category,
      label: value.data.label,
      description: value.data.description,
      href: value.data.url,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.token.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.token.uid,
    });
    const resource = resourceFromDocument(document.id, {
      category: value.data.category,
      label: value.data.label,
      description: value.data.description,
      href: value.data.url,
    });
    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    return errorResponse("onboarding-resources", error);
  }
}
