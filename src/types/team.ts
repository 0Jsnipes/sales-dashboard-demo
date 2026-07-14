export interface Team {
  teamId: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
  members: string[];
  memberDetails?: Array<{
    repUid: string;
    displayName: string;
    email: string;
    status: string;
  }>;
  /** Legacy field accepted while older team documents are migrated on write. */
  repUids?: string[];
  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}
