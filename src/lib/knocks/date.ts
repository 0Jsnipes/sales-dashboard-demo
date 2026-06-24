function safeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
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
