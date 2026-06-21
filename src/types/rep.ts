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
  locationId: string;
  locationName: string;
  programIds: string[];
  vendorType: VendorType;
  weeklySalesGoal: number;
  status: RepStatus;
  authUid: string | null;
  accountStatus: "none" | "invited" | "active" | "disabled";
  onboarding: { onboarded: boolean; checks: Record<string, boolean> };
  socials?: { instagram?: string; facebook?: string; tiktok?: string; linkedin?: string };
  terminatedAt?: unknown;
  terminatedBy?: string;
  terminationEmailStatus?: "notSent" | "queued" | "sent" | "failed";
  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}
