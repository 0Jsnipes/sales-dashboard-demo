import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { enableWorksheetFilters } from "./worksheet";

describe("enableWorksheetFilters", () => {
  it("adds a filter across the complete populated worksheet range", () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { Date: "2026-07-16", Rep: "Taylor" },
      { Date: "2026-07-15", Rep: "Jordan" },
    ]);

    enableWorksheetFilters(worksheet);

    expect(worksheet["!autofilter"]).toEqual({ ref: "A1:B3" });
  });

  it("leaves an empty worksheet unchanged", () => {
    const worksheet = XLSX.utils.json_to_sheet([]);

    enableWorksheetFilters(worksheet);

    expect(worksheet["!autofilter"]).toBeUndefined();
  });
});
