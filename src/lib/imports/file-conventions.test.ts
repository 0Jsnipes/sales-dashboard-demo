import { describe, expect, it } from "vitest";
import { recognizedEmailImportKind } from "./file-conventions";

describe("email attachment recognition", () => {
  it("selects the orders workbook and ignores the expired-orders workbook", () => {
    expect(recognizedEmailImportKind("AB Marketing Orders to Date.xlsx")).toBe("companyBSales");
    expect(recognizedEmailImportKind("AB Marketing Expired, Cancelled Orders.xlsx")).toBeNull();
  });

  it("recognizes supported Company A sales and knock filenames", () => {
    expect(recognizedEmailImportKind("Sales_order_2026-07-15.csv")).toBe("companyASales");
    expect(recognizedEmailImportKind("Book1.xlsx")).toBe("companyBKnocks");
    expect(recognizedEmailImportKind("report.xlsx")).toBe("companyAKnocks");
  });

  it("ignores unrelated spreadsheets and inline images", () => {
    expect(recognizedEmailImportKind("Other report.xlsx")).toBeNull();
    expect(recognizedEmailImportKind("logo.png")).toBeNull();
  });
});
