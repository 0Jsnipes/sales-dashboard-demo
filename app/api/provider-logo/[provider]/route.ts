import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params; const file = provider === "att" ? "ATT.svg" : provider === "tfiber" ? "T-Mobile.svg" : null;
  if (!file) return new NextResponse(null, { status: 404 });
  try { return new NextResponse(await readFile(join(process.cwd(), "public", "legacy-assets", file)), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } }); }
  catch { return new NextResponse(null, { status: 404 }); }
}
