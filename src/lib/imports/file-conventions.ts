import type { KnockSource } from "@/src/lib/knocks/types";

export type ImportKind = "attSales" | "tfiberSales" | "attKnocks" | "tfiberKnocks";

const patterns: Record<ImportKind, RegExp> = {
  attSales: /sales[_ -]?order/i,
  tfiberSales: /ab marketing orders/i,
  attKnocks: /^reports?_?/i,
  tfiberKnocks: /^book1(?:\.[a-z0-9]+)?$/i,
};

const labels: Record<ImportKind, string> = {
  attSales: "Sales_order - ATT",
  tfiberSales: "AB Marketing Orders - T-fiber",
  attKnocks: "report - ATT Knocks",
  tfiberKnocks: "Book1 - t-fiber Knocks",
};

export function expectedImportFileLabel(kind: ImportKind) {
  return labels[kind];
}

export function validateImportFileName(kind: ImportKind, fileName: string) {
  return patterns[kind].test(fileName.trim());
}

export function recognizedEmailImportKind(fileName: string): ImportKind | null {
  const normalized = fileName.trim();
  if (/\.csv$/i.test(normalized) && validateImportFileName("attSales", normalized)) return "attSales";
  if (!/\.(xlsx|xls)$/i.test(normalized)) return null;
  if (validateImportFileName("tfiberSales", normalized)) return "tfiberSales";
  if (validateImportFileName("tfiberKnocks", normalized)) return "tfiberKnocks";
  if (validateImportFileName("attKnocks", normalized)) return "attKnocks";
  return null;
}

export function validateKnockImportFileName(source: KnockSource, fileName: string) {
  return validateImportFileName(source === "att_salesrabbit" ? "attKnocks" : "tfiberKnocks", fileName);
}

export function expectedKnockImportFileLabel(source: KnockSource) {
  return expectedImportFileLabel(source === "att_salesrabbit" ? "attKnocks" : "tfiberKnocks");
}
