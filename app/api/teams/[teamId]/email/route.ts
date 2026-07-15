import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { errorResponse } from "@/src/lib/api/error-response";
import { canEmailTeamReports, requireActor } from "@/src/lib/firebase/server-auth";
import { getAdminDb, getAdminStorage } from "@/src/lib/firebase/admin";
import { buildTeamKnocksExport, buildTeamSalesExport, teamExportSlug, type TeamExportProvider } from "@/src/lib/teams/export";
import { getTeamById } from "@/src/lib/teams/team-service";

export const runtime = "nodejs";

const fileKinds = ["att-sales", "tfiber-sales", "att-knocks", "tfiber-knocks"] as const;
type FileKind = typeof fileKinds[number];
const dateRange = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.start <= value.end, { message: "Choose a valid date range." });

const input = z.object({
  recipient: z.string().trim().email().optional(),
  subject: z.string().trim().min(1).max(200).default("Orders to date"),
  message: z.string().trim().min(1).max(4000),
  files: z.array(z.enum(fileKinds)).min(1).max(4),
  salesRange: dateRange,
  knocksRange: dateRange,
});

type Params = { params: Promise<{ teamId: string }> };
const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const signedUrlLifetimeMs = 24 * 60 * 60 * 1000;

function fileParts(kind: FileKind): { provider: TeamExportProvider; dataKind: "sales" | "knocks" } {
  return {
    provider: kind.startsWith("att-") ? "att" : "tfiber",
    dataKind: kind.endsWith("sales") ? "sales" : "knocks",
  };
}

function rangeFilePart(range: { start: string; end: string }) {
  return range.start === "0001-01-01" && range.end === "9999-12-31" ? "all-time" : `${range.start}-to-${range.end}`;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    if (!canEmailTeamReports(actor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const value = input.safeParse(await request.json());
    if (!value.success) return NextResponse.json({ error: value.error.flatten() }, { status: 400 });
    const team = await getTeamById((await params).teamId);
    if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });

    let managerEmail = "";
    if (team.managerRepUid) {
      const manager = await getAdminDb().collection("reps").doc(team.managerRepUid).get();
      managerEmail = manager.exists ? String(manager.data()?.email ?? "").trim() : "";
    }
    const recipient = value.data.recipient || managerEmail;
    if (!recipient) return NextResponse.json({ error: "The team manager has no email. Enter a recipient email." }, { status: 400 });

    const ranges = { sales: value.data.salesRange, knocks: value.data.knocksRange };
    const slug = teamExportSlug(team);
    const db = getAdminDb();
    const mailCollection = process.env.FIREBASE_TRIGGER_EMAIL_COLLECTION?.trim() || "mail";
    const mailReference = db.collection(mailCollection).doc();
    const bucket = getAdminStorage().bucket();
    const expires = Date.now() + signedUrlLifetimeMs;
    const attachments = await Promise.all(value.data.files.map(async (kind) => {
      const { provider, dataKind } = fileParts(kind);
      const range = ranges[dataKind];
      const providerLabel = provider === "att" ? "att" : "tfiber";
      const file = dataKind === "sales"
        ? await buildTeamSalesExport(team, range, provider)
        : await buildTeamKnocksExport(team, range, provider);
      const fileName = `${slug}-${providerLabel}-${dataKind}-${rangeFilePart(range)}.xlsx`;
      const storageFile = bucket.file(`team-email-attachments/${mailReference.id}/${fileName}`);
      await storageFile.save(Buffer.from(file), {
        resumable: false,
        contentType,
        metadata: { metadata: { teamId: team.teamId, mailDocumentId: mailReference.id } },
      });
      const [url] = await storageFile.getSignedUrl({ action: "read", expires });
      return {
        filename: fileName,
        contentType,
        path: url,
      };
    }));

    await mailReference.create({
      to: [recipient],
      message: {
        subject: value.data.subject,
        text: value.data.message,
        attachments,
      },
      createdAt: FieldValue.serverTimestamp(),
      teamId: team.teamId,
      requestedBy: actor.token.uid,
    });
    await db.collection("teamEmailLogs").add({
      teamId: team.teamId,
      recipient,
      subject: value.data.subject,
      files: value.data.files,
      ranges,
      mailCollection,
      mailDocumentId: mailReference.id,
      status: "queued",
      queuedAt: FieldValue.serverTimestamp(),
      queuedBy: actor.token.uid,
    });
    return NextResponse.json({ queued: true, recipient, mailDocumentId: mailReference.id });
  } catch (error) {
    return errorResponse("teams/[teamId]/email", error, "EMAIL_FAILED");
  }
}
