function safeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  const text = String(value ?? "").replace(/[\u00a0\u202f]/g, " ").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function easternWallTime(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const offsetAt = (timestamp: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - timestamp;
  };
  let timestamp = guess - offsetAt(guess);
  timestamp = guess - offsetAt(timestamp);
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/** Parses Company B's timezone-free Disposition Time value as America/New_York. */
export function parseEasternDispositionTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  const text = String(value ?? "").replace(/[\u00a0\u202f]/g, " ").trim();
  if (!text) return null;
  const named = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  const numeric = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  let second: number;
  let meridiem: string | undefined;
  if (named) {
    month = MONTHS[named[1]!.toLowerCase()] ?? 0;
    day = Number(named[2]);
    year = Number(named[3]);
    hour = Number(named[4]);
    minute = Number(named[5]);
    second = Number(named[6] ?? 0);
    meridiem = named[7];
  } else if (numeric) {
    month = Number(numeric[1]);
    day = Number(numeric[2]);
    year = Number(numeric[3]);
    hour = Number(numeric[4]);
    minute = Number(numeric[5]);
    second = Number(numeric[6] ?? 0);
    meridiem = numeric[7];
  } else {
    return safeDate(text);
  }
  if (meridiem) {
    hour %= 12;
    if (meridiem.toUpperCase() === "PM") hour += 12;
  }
  if (!month || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return easternWallTime(year, month, day, hour, minute, second);
}

export function toEasternDateKey(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toDateKey(date: unknown) {
  const parsed = safeDate(date);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function getWeekStartKey(date: unknown) {
  const parsed = safeDate(date);
  if (!parsed) return "";
  const cursor = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const day = cursor.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  cursor.setDate(cursor.getDate() + delta);
  return toDateKey(cursor);
}

export function getMonthKey(date: unknown) {
  const parsed = safeDate(date);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function parseFlexibleDate(value: unknown) {
  return safeDate(value);
}
