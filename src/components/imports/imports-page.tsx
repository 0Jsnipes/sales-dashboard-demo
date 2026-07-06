"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, FileSpreadsheet, FileUp, PackageSearch, RefreshCcw, ShieldAlert, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authedFetch } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { KnockImportPreview } from "@/src/components/knocks/KnockImportPreview";

type Summary = {
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsMatched: number;
  rowsUnmatched: number;
};

type UploadHistoryRow = {
  id: string;
  source: string;
  fileName: string;
  status: "complete" | "failed" | "queued";
  rows: number;
  matched: number;
  unmatched: number;
  createdAt: string;
  notes?: string;
};

type ServerUploadRow = {
  uploadId: string;
  type: "attSales" | "tfiberSales";
  fileName: string;
  storagePath: string;
  uploadedBy: string;
  uploadedAt: string | null;
  status: string;
  rowsRead: number;
  rowsValid: number;
  rowsSkipped: number;
  rowsMatched: number;
  rowsUnmatched: number;
};

function SourceCard({
  title,
  description,
  hint,
  acceptLabel,
  sourceKey,
  endpoint,
  accept,
  onComplete,
  disabled = false,
}: {
  title: string;
  description: string;
  hint: string;
  acceptLabel: string;
  sourceKey: string;
  endpoint?: string;
  accept: Record<string, string[]>;
  onComplete: (row: UploadHistoryRow) => void;
  disabled?: boolean;
}) {
  const { user, profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canEditSales);

  const upload = useCallback(async (file: File) => {
    if (!user || !endpoint) return;
    setUploading(true);
    setError(null);
    setFileName(file.name);
    setSummary(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await authedFetch(endpoint, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      const uploadSummary = data.summary as Partial<Summary> | undefined;
      const rowsRead = Number(uploadSummary?.rowsRead ?? data.rowsRead ?? 0);
      const rowsImported = Number(uploadSummary?.rowsImported ?? data.rowsImported ?? rowsRead);
      const rowsMatched = Number(uploadSummary?.rowsMatched ?? data.rowsMatched ?? 0);
      const rowsUnmatched = Number(uploadSummary?.rowsUnmatched ?? data.rowsUnmatched ?? 0);
      const rowsSkipped = Number(uploadSummary?.rowsSkipped ?? data.rowsSkipped ?? 0);
      const nextSummary = {
        rowsRead,
        rowsImported,
        rowsSkipped,
        rowsMatched,
        rowsUnmatched,
      };
      setSummary(nextSummary);
      onComplete({
        id: crypto.randomUUID(),
        source: sourceKey,
        fileName: file.name,
        status: "complete",
        rows: rowsImported || rowsRead,
        matched: rowsMatched,
        unmatched: rowsUnmatched,
        createdAt: new Date().toISOString(),
        notes: "Current behavior: upload commits after validation.",
      });
      toast.success(`${title} uploaded successfully.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed.";
      setError(message);
      onComplete({
        id: crypto.randomUUID(),
        source: sourceKey,
        fileName: file.name,
        status: "failed",
        rows: 0,
        matched: 0,
        unmatched: 0,
        createdAt: new Date().toISOString(),
        notes: message,
      });
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [endpoint, onComplete, sourceKey, title, user]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles[0]) return;
    void upload(acceptedFiles[0]);
  }, [upload]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    disabled: disabled || !allowed || !endpoint || uploading,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <Card className="h-full overflow-hidden border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant={endpoint ? "info" : "outline"}>{endpoint ? "Live" : "Coming soon"}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Accepted files</span>
            <span className="font-medium">{acceptLabel}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Updates</span>
            <span className="text-right font-medium">Reporting rows for {sourceKey}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Current behavior</span>
            <span className="text-right font-medium">Upload commits after validation</span>
          </div>
        </div>
        <div
          {...getRootProps()}
          className={`rounded-2xl border border-dashed p-5 transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
        >
          <input {...getInputProps()} aria-label={`${title} file upload`} />
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{isDragActive ? "Drop file to upload" : `Drag and drop ${acceptLabel}`}</p>
              <p className="mt-1 text-sm text-muted-foreground">Expected file: {acceptLabel}</p>
            </div>
            <Button type="button" variant="outline" onClick={open} disabled={disabled || !allowed || !endpoint || uploading}>
              <FileUp className="h-4 w-4" />
              {uploading ? "Uploading..." : "Choose file"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{fileName ?? "No file selected"}</span>
          <span>{uploading ? "Processing" : endpoint ? "Ready" : "Placeholder"}</span>
        </div>
        {uploading && <Progress value={65} />}
        {summary && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Read", value: summary.rowsRead },
              { label: "Imported", value: summary.rowsImported },
              { label: "Skipped", value: summary.rowsSkipped },
              { label: "Matched", value: summary.rowsMatched },
              { label: "Unmatched", value: summary.rowsUnmatched },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/70 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-xl font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function ImportsPage() {
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();
  const inboundEmail = process.env.NEXT_PUBLIC_REPORTS_INBOUND_EMAIL?.trim() || "";
  const [history, setHistory] = useState<UploadHistoryRow[]>([]);
  const [latestSummary, setLatestSummary] = useState<Summary | null>(null);
  const [uploads, setUploads] = useState<ServerUploadRow[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "single"; upload: ServerUploadRow } | { kind: "all" } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canEditSales);

  const steps = useMemo(() => ["Upload", "Validate", "Match", "Review", "Commit"], []);

  const loadUploads = useCallback(async () => {
    if (!allowed) {
      setUploads([]);
      setLoadingUploads(false);
      return;
    }
    setLoadingUploads(true);
    try {
      const response = await authedFetch("/api/imports");
      const data = await response.json() as { uploads?: ServerUploadRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load uploads.");
      setUploads(data.uploads ?? []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load uploads.";
      toast.error(message);
    } finally {
      setLoadingUploads(false);
    }
  }, [allowed]);

  const addHistory = useCallback((row: UploadHistoryRow) => {
    setHistory((current) => [row, ...current].slice(0, 8));
    if (row.status === "complete") {
      setLatestSummary({ rowsRead: row.rows, rowsImported: row.rows, rowsSkipped: 0, rowsMatched: row.matched, rowsUnmatched: row.unmatched });
      void loadUploads();
    }
  }, [loadUploads]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUploads();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUploads]);

  const totalUnmatched = latestSummary?.rowsUnmatched ?? history[0]?.unmatched ?? 0;
  const warnings = history.filter((row) => row.status === "failed").length;
  const sourcesAvailable = 2;
  const lastSuccessful = history.find((row) => row.status === "complete");

  const runDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = deleteTarget.kind === "single"
        ? await authedFetch(`/api/imports/${deleteTarget.upload.uploadId}`, { method: "DELETE" })
        : await authedFetch("/api/imports", { method: "DELETE", body: JSON.stringify({ all: true }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to delete upload.");
      toast.success(deleteTarget.kind === "single" ? "Upload deleted." : "All sales uploads deleted.");
      setDeleteTarget(null);
      await loadUploads();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to delete upload.";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadUploads]);

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sources available", value: sourcesAvailable, note: "ATT, T-Fiber, and future intake workflows." },
          { label: "Last successful import", value: lastSuccessful ? lastSuccessful.fileName : "None yet", note: lastSuccessful ? lastSuccessful.createdAt : "Upload a file to seed the queue." },
          { label: "Unmatched rows", value: totalUnmatched, note: "Review before trusting reporting." },
          { label: "Warnings", value: warnings, note: "Failed uploads and parsing issues." },
        ].map((item) => (
          <Card key={item.label} className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">{item.note}</CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle>Import center</CardTitle>
            <CardDescription>Upload source files, validate the payload, and keep low-confidence matches out of reporting.</CardDescription>
          </div>
          <Badge variant="outline">AB Marketing</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => (
            <div key={step} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</div>
                <p className="font-medium">{step}</p>
              </div>
              <Progress value={(index + 1) * 20} className="mt-3" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Review before reporting</AlertTitle>
        <AlertDescription>Low-confidence or unmatched rows should be reviewed before they are trusted in reports.</AlertDescription>
      </Alert>

      <KnockImportPreview />

      {inboundEmail ? (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Email reports</CardTitle>
            <CardDescription>Send source files to the site inbox or pull unread Gmail attachments into the same import pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="font-medium">{inboundEmail}</p>
              <p className="mt-1 text-muted-foreground">ATT sales: `Sales_order`, T-Fiber sales: `AB Marketing Orders`, T-Fiber knocks: `Book1`, ATT knocks: `report` / `reports`.</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const response = await authedFetch("/api/imports/email/gmail", { method: "POST" });
                  const result = await response.json() as { error?: string; processedMessages?: number };
                  if (!response.ok) throw new Error(result.error || "Unable to pull Gmail reports.");
                  toast.success(`Processed ${result.processedMessages ?? 0} Gmail message(s).`);
                  void loadUploads();
                } catch (cause) {
                  toast.error(cause instanceof Error ? cause.message : "Unable to pull Gmail reports.");
                }
              }}
              disabled={!allowed}
            >
              Pull Gmail inbox
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!allowed && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Uploads are read-only for your role.
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <SourceCard
          title="AT&T Sales Report"
          description="CSV upload with audit retention and automatic row matching."
          hint="Use the Sales_order naming format for ATT sales uploads."
          acceptLabel="Sales_order - ATT (.csv)"
          sourceKey="attSales"
          endpoint="/api/imports/att"
          accept={{ "text/csv": [".csv"] }}
          onComplete={addHistory}
          disabled={!allowed}
        />
        <SourceCard
          title="T-Fiber Sales Report"
          description="Workbook upload with retained source files and match evaluation."
          hint="Use the AB Marketing Orders naming format for T-Fiber sales uploads."
          acceptLabel="AB Marketing Orders - T-fiber (.xlsx/.xls)"
          sourceKey="tfiberSales"
          endpoint="/api/imports/tfiber"
          accept={{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xls"], "application/vnd.ms-excel": [".xls"] }}
          onComplete={addHistory}
          disabled={!allowed}
        />
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Knock report</CardTitle>
            <CardDescription>Use `Book1` for T-Fiber knocks and `report` for ATT knocks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
              <PackageSearch className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 font-medium">Knock upload naming is enforced</p>
              <p className="mt-1 text-sm text-muted-foreground">T-Fiber knocks: `Book1`. ATT knocks: `report` / `reports`.</p>
            </div>
            <Button variant="outline" className="w-full" disabled>
              Coming soon
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Roster import</CardTitle>
            <CardDescription>Bulk create or update reps with a validated CSV.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
              <FileSpreadsheet className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 font-medium">Roster import queue coming soon</p>
              <p className="mt-1 text-sm text-muted-foreground">This workflow will slot into the same validation pipeline.</p>
            </div>
            <Button variant="outline" className="w-full" disabled>
              Coming soon
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Sales uploads</CardTitle>
              <CardDescription>Delete a bad ATT or T-Fiber upload, or clear the full upload set and re-import.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void loadUploads()} disabled={loadingUploads}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDeleteTarget({ kind: "all" })} disabled={!allowed || !uploads.length}>
                <Trash2 className="h-4 w-4" />
                Delete all uploads
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUploads ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={6}>
                          <div className="h-10 animate-pulse rounded-2xl bg-muted/40" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : uploads.length ? uploads.map((row) => (
                    <TableRow key={row.uploadId}>
                      <TableCell>
                        <Badge variant="outline">{row.type === "attSales" ? "ATT" : "T-Fiber"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.fileName}</p>
                          <p className="text-xs text-muted-foreground">{row.uploadId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "complete" ? "success" : "secondary"}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>Read {row.rowsRead}</p>
                          <p className="text-muted-foreground">Matched {row.rowsMatched} / Unmatched {row.rowsUnmatched}</p>
                        </div>
                      </TableCell>
                      <TableCell>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget({ kind: "single", upload: row })} disabled={!allowed}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No sales uploads found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Delete behavior</CardTitle>
            <CardDescription>What happens when you remove a sales upload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Imported sales rows tied to the upload ID are deleted from reporting.</p>
            <p>Unmatched queue entries created by that upload are removed too.</p>
            <p>The source file in storage is deleted when available.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Validation results</CardTitle>
              <CardDescription>Current upload summary and the safety rules that keep data clean.</CardDescription>
            </div>
            {latestSummary && <Badge variant="success">{latestSummary.rowsMatched} matched</Badge>}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[{ label: "Rows read", value: latestSummary?.rowsRead ?? 0 }, { label: "Imported", value: latestSummary?.rowsImported ?? 0 }, { label: "Matched", value: latestSummary?.rowsMatched ?? 0 }, { label: "Unmatched", value: latestSummary?.rowsUnmatched ?? 0 }].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold">{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workflow rules</CardTitle>
            <CardDescription>Why the import center is structured this way.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Low-confidence matches are never auto-committed.</p>
            <p>Source files are retained for auditability.</p>
            <p>Parsing errors are surfaced before data reaches reporting.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Upload history</CardTitle>
              <CardDescription>Session history for recent imports.</CardDescription>
            </div>
            <Badge variant="outline">{history.length} entries</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Unmatched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length ? history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.source}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p>{row.fileName}</p>
                        {row.notes && <p className="text-xs text-muted-foreground">{row.notes}</p>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={row.status === "complete" ? "success" : "danger"}>{row.status}</Badge></TableCell>
                    <TableCell>{row.rows}</TableCell>
                    <TableCell>{row.matched}</TableCell>
                    <TableCell>{row.unmatched}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No uploads yet this session.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unmatched review</CardTitle>
            <CardDescription>Move into the review queue when imports need a human decision.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Never auto-commit low-confidence matches</p>
              <p className="mt-1 text-sm text-muted-foreground">This safeguard is always on for unresolved or ambiguous rows.</p>
            </div>
            <Button asChild className="w-full">
              <Link href="/imports/unmatched">Review unmatched rows</Link>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => toast.message("Bulk resolve placeholder")} disabled>
              <RefreshCcw className="h-4 w-4" />
              Bulk resolve placeholder
            </Button>
          </CardContent>
        </Card>
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteTarget?.kind === "all" ? "Delete all sales uploads" : "Delete sales upload"}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "all"
                ? "This removes every ATT and T-Fiber upload, their imported rows, their unmatched queue items, and their stored source files."
                : deleteTarget?.upload
                  ? `This removes ${deleteTarget.upload.fileName}, the imported rows tied to this upload, the unmatched queue items, and the stored source file.`
                  : "Choose an upload first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void runDelete()} disabled={deleting || !deleteTarget}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
