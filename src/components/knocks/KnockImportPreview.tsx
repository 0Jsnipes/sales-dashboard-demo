"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/src/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PreviewResponse = {
  ok: boolean;
  source: "companya_activity" | "companyb";
  provider: "Company A" | "Company B";
  program: "Company A" | "Company B";
  fileName: string;
  summary: {
    totalRowsSeen: number;
    validRows: number;
    totalKnocks: number;
    skippedRows: number;
    matchedRows: number;
    unmatchedRows: number;
    duplicateKnockUidsInFile: number;
    uniqueLeads: number;
    dateRange: { from: string | null; to: string | null };
    statusBreakdown: Record<string, number>;
    normalizedStatusBreakdown: Record<string, number>;
    sourceBreakdown: Record<string, number>;
    providerBreakdown: Record<string, number>;
  };
  matchedPreview: Array<{ knockUid: string; repName: string; rawStatus: string; normalizedStatus: string; activityDateKey: string; matchStatus: string }>;
  unmatchedPreview: Array<{ knockUid: string; repName: string; rawStatus: string; normalizedStatus: string; activityDateKey: string; matchStatus: string; sourceLeadId?: string | null }>;
  warnings: string[];
  errors: string[];
};

const sourceLabels = {
  auto: "Auto detect",
  companya_activity: "Company A Activity",
  companyb: "Company B",
} as const;

export function KnockImportPreview() {
  const [source, setSource] = useState<keyof typeof sourceLabels>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);

  const previewRows = useMemo(() => result?.unmatchedPreview ?? [], [result]);

  const submit = useCallback(async (nextFile?: File) => {
    const chosen = nextFile ?? file;
    if (!chosen) {
      toast.error("Choose a workbook first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", chosen);
      form.set("source", source);
      const response = await authedFetch("/api/knocks/preview", { method: "POST", body: form });
      const data = await response.json() as PreviewResponse | { error?: string };
      if (!response.ok) throw new Error("error" in data ? data.error || "Preview failed." : "Preview failed.");
      setResult(data as PreviewResponse);
      toast.success("Preview generated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }, [file, source]);

  const importFile = useCallback(async () => {
    const chosen = file;
    if (!chosen) {
      toast.error("Choose a workbook first.");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", chosen);
      form.set("source", source);
      const response = await authedFetch("/api/knocks", { method: "POST", body: form });
      const data = await response.json() as PreviewResponse & { uploadId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Import failed.");
      setResult(data);
      toast.success("Knocks uploaded.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [file, source]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const next = acceptedFiles[0];
    if (!next) return;
    setFile(next);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xls"],
      "application/vnd.ms-excel": [".xls"],
    },
    noClick: true,
    noKeyboard: true,
  });

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-2">
        <CardTitle>Preview Knock Import</CardTitle>
        <CardDescription>Preview only. Company B knocks must use `Book1`; Company A knocks must use `report` / `reports`.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
          <div {...getRootProps()} className={`rounded-2xl border border-dashed p-5 text-center ${isDragActive ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}>
            <input {...getInputProps()} aria-label="Knock import file" />
            <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 font-medium">{file ? file.name : "Drag and drop an .xlsx file"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Company B: `Book1` workbook. Company A: `report` workbook.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Source</p>
            <Select value={source} onValueChange={(value) => setSource(value as keyof typeof sourceLabels)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(sourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" onClick={open} disabled={loading}>
              <FileUp className="h-4 w-4" />
              Choose file
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Preview file
            </Button>
            <Button type="button" variant="secondary" onClick={() => void importFile()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Upload knocks
            </Button>
          </div>
        </div>

        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {[
                ["Knocks counted", result.summary.totalKnocks],
                ["Valid rows", result.summary.validRows],
                ["Matched rows", result.summary.matchedRows],
                ["Unmatched rows", result.summary.unmatchedRows],
                ["Duplicate UIDs", result.summary.duplicateKnockUidsInFile],
                ["Unique leads", result.summary.uniqueLeads],
                ["Skipped rows", result.summary.skippedRows],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-2xl border border-border/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-border/70">
                <CardHeader className="pb-2"><CardTitle className="text-base">Status breakdown</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {Object.entries(result.summary.normalizedStatusBreakdown).map(([key, value]) => <Badge key={key} variant="outline">{key}: {value}</Badge>)}
                </CardContent>
              </Card>
              <Card className="border-border/70">
                <CardHeader className="pb-2"><CardTitle className="text-base">Date range</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>From: {result.summary.dateRange.from ?? "N/A"}</p>
                  <p>To: {result.summary.dateRange.to ?? "N/A"}</p>
                </CardContent>
              </Card>
            </div>
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">First 50 unmatched rows</CardTitle>
                <CardDescription>Rows shown here need roster review before import later.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Knock UID</TableHead>
                      <TableHead>Rep</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Lead</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length ? previewRows.map((row) => (
                      <TableRow key={row.knockUid}>
                        <TableCell className="font-mono text-xs">{row.knockUid}</TableCell>
                        <TableCell>{row.repName}</TableCell>
                        <TableCell>{row.normalizedStatus}</TableCell>
                        <TableCell>{row.activityDateKey}</TableCell>
                        <TableCell>{row.sourceLeadId ?? "—"}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No unmatched rows in the preview.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </CardContent>
    </Card>
  );
}
