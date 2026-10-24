import type { KnockSource } from "@/src/lib/knocks/types";

export type ImportKind = "companyASales" | "companyBSales" | "companyAKnocks" | "companyBKnocks";

const patterns: Record<ImportKind, RegExp> = {
  companyASales: /sales[_ -]?order/i,
  companyBSales: /company b orders/i,
  companyAKnocks: /^reports?_?/i,
  companyBKnocks: /^book1(?:\.[a-z0-9]+)?$/i,
};

const labels: Record<ImportKind, string> = {
  companyASales: "Sales_order - Company A",
  companyBSales: "Company B Orders - Company B",
  companyAKnocks: "report - Company A Knocks",
  companyBKnocks: "Book1 - Company B Knocks",
};

export function expectedImportFileLabel(kind: ImportKind) {
  return labels[kind];
}

export function validateImportFileName(kind: ImportKind, fileName: string) {
  return patterns[kind].test(fileName.trim());
}

export function recognizedEmailImportKind(fileName: string): ImportKind | null {
  const normalized = fileName.trim();
  if (/\.csv$/i.test(normalized) && validateImportFileName("companyASales", normalized)) return "companyASales";
  if (!/\.(xlsx|xls)$/i.test(normalized)) return null;
  if (validateImportFileName("companyBSales", normalized)) return "companyBSales";
  if (validateImportFileName("companyBKnocks", normalized)) return "companyBKnocks";
  if (validateImportFileName("companyAKnocks", normalized)) return "companyAKnocks";
  return null;
}

export function validateKnockImportFileName(source: KnockSource, fileName: string) {
  return validateImportFileName(source === "companya_activity" ? "companyAKnocks" : "companyBKnocks", fileName);
}

export function expectedKnockImportFileLabel(source: KnockSource) {
  return expectedImportFileLabel(source === "companya_activity" ? "companyAKnocks" : "companyBKnocks");
}
