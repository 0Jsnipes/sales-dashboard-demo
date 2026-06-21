export function toDateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateId(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function startOfWeek(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value;
}

export function endOfWeek(date = new Date()) {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  return value;
}

export function weekRangeLabel(start: string, end: string) {
  const first = parseDateId(start);
  const last = parseDateId(end);
  return `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function isoWeek(date: Date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekDates(start: string) {
  const monday = parseDateId(start);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return {
      dateId: toDateId(date),
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      label: date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
    };
  });
}
