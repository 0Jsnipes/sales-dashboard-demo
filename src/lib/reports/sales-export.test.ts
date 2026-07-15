import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSalesExportRow, buildSourceExportRows, EXCEL_DATE_FORMAT } from "./sales-export";

function expectDate(value: unknown, year: number, month: number, day: number) {
  expect(value).toBeInstanceOf(Date);
  const date = value as Date;
  expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([year, month, day]);
}

describe("sales export dates", () => {
  it("turns order date strings into real spreadsheet dates", () => {
    const row = buildSalesExportRow({
      provider: "ATT",
      orderDateId: "2026-07-02",
      installationDateId: "2026-07-10",
      rawData: { "Order Date": "7/2/2026" },
    });

    expectDate(row["Order Date"], 2026, 7, 2);
    expectDate(row["Sale Date"], 2026, 7, 2);
    expectDate(row["Install Date (Normalized)"], 2026, 7, 10);
  });

  it("writes dates as sortable Excel number cells with a four-digit year", () => {
    const rows = buildSourceExportRows([
      { provider: "ATT", rawData: { "Order Date": "7/2/2026" } },
    ]);
    const worksheet = XLSX.utils.json_to_sheet(rows, { dateNF: EXCEL_DATE_FORMAT });

    expect(worksheet.A2.t).toBe("n");
    expect(worksheet.A2.z).toBe(EXCEL_DATE_FORMAT);
  });

  it("leaves invalid date-looking values unchanged", () => {
    const [row] = buildSourceExportRows([
      { provider: "ATT", rawData: { "Order Date": "2/30/2026" } },
    ]);

    expect(row["Order Date"]).toBe("2/30/2026");
  });
});
