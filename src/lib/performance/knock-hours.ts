export type KnockHoursPeriod = "daily" | "weekly" | "monthly" | "custom";

export type KnockHoursActivity = {
  repUid: string;
  dateId: string;
  occurredAt: Date;
};

export type KnockHoursSummary = {
  repUid: string;
  knocks: number;
  hoursWorked: number;
  daysWorked: number;
  firstKnockAt: string;
  lastKnockAt: string;
};

const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;

export function resolveKnockHoursRange(period: KnockHoursPeriod, anchor: string, customEnd = "") {
  if (!DATE_ID.test(anchor)) return null;
  const date = new Date(`${anchor}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== anchor) return null;
  if (period === "custom") {
    if (!DATE_ID.test(customEnd)) return null;
    const end = new Date(`${customEnd}T12:00:00Z`);
    if (Number.isNaN(end.valueOf()) || end.toISOString().slice(0, 10) !== customEnd || anchor > customEnd) return null;
    return { start: anchor, end: customEnd };
  }
  if (period === "daily") return { start: anchor, end: anchor };
  if (period === "monthly") return { start: `${anchor.slice(0, 8)}01`, end: anchor };
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return { start: date.toISOString().slice(0, 10), end: anchor };
}

/** Weekly/monthly hours are the sum of each day's first-to-last knock span. */
export function aggregateKnockHours(activities: KnockHoursActivity[]): KnockHoursSummary[] {
  const byRepDay = new Map<string, { repUid: string; first: Date; last: Date; knocks: number }>();
  for (const activity of activities) {
    if (!activity.repUid || Number.isNaN(activity.occurredAt.valueOf())) continue;
    const key = `${activity.repUid}::${activity.dateId}`;
    const current = byRepDay.get(key) ?? { repUid: activity.repUid, first: activity.occurredAt, last: activity.occurredAt, knocks: 0 };
    if (activity.occurredAt < current.first) current.first = activity.occurredAt;
    if (activity.occurredAt > current.last) current.last = activity.occurredAt;
    current.knocks += 1;
    byRepDay.set(key, current);
  }

  const byRep = new Map<string, { repUid: string; knocks: number; milliseconds: number; daysWorked: number; first: Date; last: Date }>();
  for (const day of byRepDay.values()) {
    const current = byRep.get(day.repUid) ?? { repUid: day.repUid, knocks: 0, milliseconds: 0, daysWorked: 0, first: day.first, last: day.last };
    current.knocks += day.knocks;
    current.milliseconds += Math.max(0, day.last.valueOf() - day.first.valueOf());
    current.daysWorked += 1;
    if (day.first < current.first) current.first = day.first;
    if (day.last > current.last) current.last = day.last;
    byRep.set(day.repUid, current);
  }

  return [...byRep.values()]
    .map((row) => ({
      repUid: row.repUid,
      knocks: row.knocks,
      hoursWorked: Math.round((row.milliseconds / 3_600_000) * 100) / 100,
      daysWorked: row.daysWorked,
      firstKnockAt: row.first.toISOString(),
      lastKnockAt: row.last.toISOString(),
    }))
    .sort((left, right) => right.hoursWorked - left.hoursWorked || right.knocks - left.knocks || left.repUid.localeCompare(right.repUid));
}
