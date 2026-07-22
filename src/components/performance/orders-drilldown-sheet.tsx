"use client";

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlatEmptyState } from "@/components/ui/data-panel";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/src/lib/formatters/date";
import { formatNumber } from "@/src/lib/formatters/number";
import { etaValue, outcomeBadgeVariant, unitsFor, type PerformanceOrder } from "@/src/lib/performance/performance-utils";
import { saleOutcomeLabel } from "@/src/lib/sales/outcomes";

export function OrdersDrilldownSheet({
  open,
  onOpenChange,
  title,
  description,
  emptyTitle,
  emptyDescription,
  rows,
  onExport,
  onReassign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  emptyTitle: string;
  emptyDescription: string;
  rows: PerformanceOrder[];
  onExport: () => void;
  onReassign?: (order: PerformanceOrder) => void;
}) {
  const units = rows.reduce((sum, order) => sum + unitsFor(order), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(100vw,1200px)] sm:max-w-[1200px] overflow-y-auto">
        <SheetHeader className="pr-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                {description ? `${description} - ` : ""}{formatNumber(rows.length)} rows - {formatNumber(units)} units
              </SheetDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onExport} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {rows.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale date</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Rep</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Customer / order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Units</TableHead>
                    {onReassign ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{formatDate(order.orderDateId)}</TableCell>
                      <TableCell>{etaValue(order) || " - "}</TableCell>
                      <TableCell>{order.repName}</TableCell>
                      <TableCell>{order.managerName || "No manager"}</TableCell>
                      <TableCell>{order.locationName || "Not assigned"}</TableCell>
                      <TableCell>{order.provider}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.customer}</p>
                          <p className="text-xs text-muted-foreground">{order.orderId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={outcomeBadgeVariant(order.outcome ?? "unknown")}>{saleOutcomeLabel(order.outcome ?? "unknown")}</Badge>
                      </TableCell>
                      <TableCell>{unitsFor(order)}</TableCell>
                      {onReassign ? (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => onReassign(order)}>
                            Reassign
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <FlatEmptyState title={emptyTitle} description={emptyDescription} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
