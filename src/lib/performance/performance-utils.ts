import type { SaleOutcome, SalesOrderRecord } from "@/src/lib/sales/outcomes";
import { isPastDue, normalizeSaleOutcome, saleOutcomeLabel } from "@/src/lib/sales/outcomes";

export type PerformanceOrder = SalesOrderRecord & {
  orderUid: string;
  id: string;
  providerKey?: string;
  orderId: string;
  provider: string;
  repName: string;
  managerName?: string;
  locationName?: string;
  customer: string;
  status: string;
  saleDate?: string;
  estimatedInstallDate?: string;
  daysSinceSale?: number | null;
};

export function outcomeLabel(order: SalesOrderRecord) {
  return saleOutcomeLabel(normalizeSaleOutcome(order));
}

export function outcomeBadgeVariant(outcome: SaleOutcome) {
  switch (outcome) {
    case "installed": return "success" as const;
    case "pending": return "outline" as const;
    case "past_due": return "warning" as const;
    case "canceled": return "danger" as const;
    case "churned": return "secondary" as const;
    default: return "outline" as const;
  }
}

export function calculateInstallRate(total: number, installed: number) {
  return total ? Math.round((installed / total) * 100) : 0;
}

export function calculateCancellationRate(total: number, canceled: number) {
  return total ? Math.round((canceled / total) * 100) : 0;
}

export { isPastDue, normalizeSaleOutcome };
