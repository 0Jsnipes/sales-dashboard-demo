export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined).format(Number(value ?? 0));
}

export function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(value: number, digits = 1) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value ?? 0));
}
