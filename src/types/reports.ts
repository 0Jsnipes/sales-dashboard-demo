export interface WeeklyReport {
  weekISO: string;
  repUid: string;
  displayName: string;
  managerUid: string | null;
  managerName: string;
  locationId: string;
  locationName: string;
  sales: number[];
  knocks: number[];
  companyASales: number[];
  companyBSales: number[];
  manualSales: number[];
  salesGoal: number;
  knocksGoal: number;
}
