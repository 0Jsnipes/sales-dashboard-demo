"use client";

import { useEffect, useMemo, useState } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { authedJson } from "@/src/lib/api/client";
import { useAuth } from "@/src/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportingKind = "sales" | "knocks";

type ReportingRow = {
  id: string;
  sortDate: string;
  title: string;
  subtitle: string;
  values: Record<string, string>;
  detail: Record<string, unknown>;
};

type ReportingResponse = {
  kind: ReportingKind;
  columns: string[];
  rows: ReportingRow[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function detailEntries(detail: Record<string, unknown>) {
  return Object.entries(detail)
    .filter(([, value]) => value != null && text(value) !== "")
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function ReportingPage() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const [kind, setKind] = useQueryState("kind", parseAsString.withDefault("sales"));
  const activeKind: ReportingKind = kind === "knocks" ? "knocks" : "sales";
  const [data, setData] = useState<ReportingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKind, setLoadingKind] = useState<ReportingKind>(activeKind);
  const [query, setQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string>(activeKind === "sales" ? "Sale Date" : "Date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [managerFilter, setManagerFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [pageSize, setPageSize] = useState("50");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<ReportingRow | null>(null);

  const allowed = profile?.role === "superAdmin" || (profile?.role === "admin" && profile.permissions.canViewReporting);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    authedJson<ReportingResponse>(`/api/reporting?kind=${activeKind}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        setError(null);
        setLoadingKind(value.kind);
        setSortColumn(value.kind === "sales" ? "Sale Date" : "Date");
        setSortDirection("desc");
        setQuery("");
        setManagerFilter("all");
        setRepFilter("all");
        setLocationFilter("all");
        setProviderFilter("all");
        setVendorFilter("all");
        setPage(1);
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "Unable to load reporting rows.";
        setError(message);
        toast.error(message);
      });
    return () => {
      active = false;
    };
  }, [activeKind, allowed]);

  const filterOptions = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      managers: [...new Set(rows.map((row) => text(row.values.Manager)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      reps: [...new Set(rows.map((row) => text(row.values.Rep)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      locations: [...new Set(rows.map((row) => text(row.values.Location)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      providers: [...new Set(rows.map((row) => text(row.values.Provider)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      vendors: [...new Set(rows.map((row) => text(row.values.Vendor)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = normalize(query);
    const filtered = data.rows.filter((row) => {
      if (term) {
        const haystack = [row.title, row.subtitle, ...Object.values(row.values)].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (managerFilter !== "all" && text(row.values.Manager) !== managerFilter) return false;
      if (repFilter !== "all" && text(row.values.Rep) !== repFilter) return false;
      if (locationFilter !== "all" && text(row.values.Location) !== locationFilter) return false;
      if (providerFilter !== "all" && text(row.values.Provider) !== providerFilter) return false;
      if (vendorFilter !== "all" && text(row.values.Vendor) !== vendorFilter) return false;
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (!sortColumn) return right.sortDate.localeCompare(left.sortDate);
      const leftValue = text(left.values[sortColumn] ?? (sortColumn.toLowerCase().includes("date") ? left.sortDate : ""));
      const rightValue = text(right.values[sortColumn] ?? (sortColumn.toLowerCase().includes("date") ? right.sortDate : ""));
      const direction = sortDirection === "asc" ? 1 : -1;
      return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [data, locationFilter, managerFilter, providerFilter, query, repFilter, sortColumn, sortDirection, vendorFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / Number(pageSize)));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * Number(pageSize);
    return rows.slice(start, start + Number(pageSize));
  }, [currentPage, pageSize, rows]);
  const loading = !data || loadingKind !== activeKind;

  function exportRows() {
    if (!data?.columns.length || !rows.length) return;
    const csv = [data.columns, ...rows.map((row) => data.columns.map((column) => row.values[column] || ""))]
      .map((line) => line.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporting-${activeKind}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (!allowed) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-6 text-sm">Reporting is not available for this account.</CardContent>
      </Card>
    );
  }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Reporting</CardTitle>
                <Badge variant={loading ? "outline" : "success"}>{loading ? "Loading" : "Live"}</Badge>
              </div>
              <CardDescription className="mt-2">Sales and knocks reporting with export, top-level filters, and paged rows.</CardDescription>
            </div>
            <Tabs value={activeKind} onValueChange={(value) => { const next = value === "knocks" ? "knocks" : "sales"; setLoadingKind(next); void setKind(next); }}>
              <TabsList>
                <TabsTrigger value="sales">Sales</TabsTrigger>
                <TabsTrigger value="knocks">Knocks</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search current report" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
            </div>
            <Button variant="outline" onClick={() => { setQuery(""); setManagerFilter("all"); setRepFilter("all"); setLocationFilter("all"); setProviderFilter("all"); setVendorFilter("all"); setPage(1); }}>
              <SlidersHorizontal className="h-4 w-4" />
              Reset filters
            </Button>
            <Button variant="outline" onClick={exportRows} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Select value={managerFilter} onValueChange={(value) => { setManagerFilter(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {filterOptions.managers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={repFilter} onValueChange={(value) => { setRepFilter(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {filterOptions.reps.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={(value) => { setLocationFilter(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {filterOptions.locations.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={(value) => { setProviderFilter(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {filterOptions.providers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={(value) => { setVendorFilter(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {filterOptions.vendors.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{rows.length} filtered rows</p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/70">
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-danger">{error}</div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(data?.columns ?? []).map((column) => (
                        <TableHead key={column} className="min-w-[180px]">
                          <button
                            type="button"
                            className="flex items-center gap-2 font-medium"
                            onClick={() => {
                              if (sortColumn === column) setSortDirection((current) => current === "asc" ? "desc" : "asc");
                              else {
                                setSortColumn(column);
                                setSortDirection(column.toLowerCase().includes("date") ? "desc" : "asc");
                              }
                            }}
                          >
                            <span>{column}</span>
                            <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={Math.max(1, data?.columns.length ?? 1)} className="h-24 text-center text-muted-foreground">
                          Loading rows...
                        </TableCell>
                      </TableRow>
                    ) : visibleRows.length ? (
                      visibleRows.map((row) => (
                        <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedRow(row)}>
                          {(data?.columns ?? []).map((column) => (
                            <TableCell key={`${row.id}:${column}`} className="max-w-[260px] truncate">
                              {row.values[column] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={Math.max(1, data?.columns.length ?? 1)} className="h-24 text-center text-muted-foreground">
                          No rows match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Page {currentPage} of {pageCount}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage >= pageCount}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {selectedRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRow.title}</DialogTitle>
                <DialogDescription>{selectedRow.subtitle}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                {detailEntries(selectedRow.detail).map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-border/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                    <p className="mt-2 break-words text-sm">{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
