export type KnockSource = "companya_salesrabbit" | "companyb";

export type KnockProvider = "Company A" | "Company B";

export type NormalizedKnockStatus =
  | "attempt"
  | "sale"
  | "go_back"
  | "not_interested"
  | "existing_customer"
  | "competitor"
  | "no_soliciting"
  | "vacant"
  | "home_for_sale"
  | "does_not_qualify"
  | "lead_created"
  | "other"
  | "unknown";

export type KnockMatchMethod = "email" | "source_id" | "exact_name" | "alias" | null;

export type KnockMatchConfidence = "high" | "medium" | "low" | null;

export type NormalizedKnockRow = {
  knockUid: string;
  source: KnockSource;
  provider: KnockProvider;
  program: KnockProvider;
  sourceActivityId?: string | null;
  sourceLeadId?: string | null;
  sourceRepExternalId?: string | null;
  repId?: string | null;
  repName: string;
  repEmail?: string | null;
  team?: string | null;
  manager?: string | null;
  location?: string | null;
  rawStatus: string;
  normalizedStatus: NormalizedKnockStatus;
  activityDate: string;
  activityDateKey: string;
  weekStart: string;
  monthKey: string;
  company?: string | null;
  lcp?: string | null;
  address?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  leadName?: string | null;
  proximity?: string | null;
  quantity: number;
  matchStatus: "matched" | "unmatched";
  matchMethod?: KnockMatchMethod;
  matchConfidence?: KnockMatchConfidence;
  raw: Record<string, unknown>;
};

export type KnockPreviewSummary = {
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
