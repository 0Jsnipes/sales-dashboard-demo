import type { WorkSheet } from "xlsx";

export function enableWorksheetFilters<T extends WorkSheet>(worksheet: T) {
  const range = worksheet["!ref"];
  const hasCells = Object.keys(worksheet).some((key) => /^[A-Z]+[1-9]\d*$/.test(key));
  if (range && hasCells) worksheet["!autofilter"] = { ref: range };
  return worksheet;
}
