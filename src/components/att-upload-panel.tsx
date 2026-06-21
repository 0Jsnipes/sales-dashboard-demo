"use client";

import { ChangeEvent, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useAuth } from "./auth-provider";

type Summary = { rowsRead: number; rowsImported: number; rowsSkipped: number; rowsMatched: number; rowsUnmatched: number };

export function ATTUploadPanel() {
  const { user, profile } = useAuth(); const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [uploading, setUploading] = useState(false); const [error, setError] = useState(""); const [summary, setSummary] = useState<Summary | null>(null);
  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canEditSales);
  function choose(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setSummary(null); setError(""); }
  async function upload() {
    if (!file || !user) return; setUploading(true); setError("");
    try { const form = new FormData(); form.set("file", file); const response = await fetch("/api/imports/att", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Upload failed."); setSummary(data.summary); setFile(null); if (fileInput.current) fileInput.current.value = ""; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); } finally { setUploading(false); }
  }
  if (!allowed) return null;
  return <section className="panel tfiber-panel"><div className="panel-title"><div><h3>Upload ATT sales report</h3><p>Each Video, Internet, and Voice package is recorded once per Order ID. Original CSV files are retained for audit history.</p></div><span className="attention-icon blue"><FileSpreadsheet size={19}/></span></div><div className="tfiber-controls"><input ref={fileInput} type="file" accept=".csv,text/csv" onChange={choose}/><button className="button primary" disabled={!file || uploading} onClick={() => void upload()}>{uploading ? <><LoaderCircle className="spin" size={15}/>Importing…</> : <><Upload size={15}/>Upload & import</>}</button>{file && <small>{file.name} · {(file.size / 1024).toFixed(0)} KB</small>}</div>{error && <p className="form-error">{error}</p>}{summary && <div className="import-summary"><CheckCircle2 size={18}/><span><b>{summary.rowsImported.toLocaleString()} package sales recorded</b><small>{summary.rowsMatched.toLocaleString()} matched to roster · {summary.rowsUnmatched.toLocaleString()} retained for future matching · {summary.rowsSkipped.toLocaleString()} source rows skipped</small></span></div>}</section>;
}
