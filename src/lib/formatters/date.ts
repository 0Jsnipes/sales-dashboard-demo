function toValidDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  if (typeof value === "string") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.valueOf()) ? date : null;
    }

    if (typeof candidate.seconds === "number") {
      const millis = candidate.seconds * 1000 + Math.floor((candidate.nanoseconds ?? 0) / 1_000_000);
      const date = new Date(millis);
      return Number.isNaN(date.valueOf()) ? null : date;
    }
  }

  return null;
}

export function formatDate(value: unknown, options?: Intl.DateTimeFormatOptions) {
  const date = toValidDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatDateTime(value: unknown) {
  const date = toValidDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
