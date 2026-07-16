import type { RepAccessRole } from "@/src/lib/reps/access-role";

export type RepStatus = "active" | "inactive" | "terminated";
export type VendorType = "organic" | "subVendor";

export interface Rep {
  repUid: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  emailNormalized: string;
  phone?: string;
  salesIds: string[];
  aliases: string[];
  managerUid: string | null;
  managerName: string;
  teamId?: string | null;
  locationId: string;
  locationName: string;
  programIds: string[];
  vendorType: VendorType;
  accessRole?: RepAccessRole;
  weeklySalesGoal: number;
  weeklyKnocksGoal: number;
  status: RepStatus;
  authUid: string | null;
  accountStatus: "none" | "invited" | "active" | "disabled";
  onboarding: { onboarded: boolean; checks: Record<string, boolean> };
  socials?: { instagram?: string; facebook?: string; tiktok?: string; linkedin?: string };
  terminatedAt?: unknown;
  terminatedBy?: string;
  terminationEmailStatus?: "notSent" | "queued" | "sent" | "failed";
  inactiveAt?: unknown;
  inactiveBy?: string;
  inactiveReason?: "manual" | "noSalesThreeWeeks" | string;
  reactivatedAt?: unknown;
  reactivatedBy?: string;
  firstSaleDateId?: string;
  lastSaleDateId?: string;
  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}
