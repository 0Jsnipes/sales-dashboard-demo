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
  attSales: number[];
  tfiberSales: number[];
  manualSales: number[];
  salesGoal: number;
  knocksGoal: number;
}
