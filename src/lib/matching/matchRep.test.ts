import { describe, expect, it } from "vitest";
import { makeRep } from "@/test/fixtures/rep";
import { matchImportRowToRep } from "./matchRep";

describe("matchImportRowToRep", () => {
  it("matches on an exact normalized sales ID", () => {
    const reps = [makeRep({ repUid: "rep-1", salesIds: ["SR-100"] })];
    const result = matchImportRowToRep({ rawSalesId: "sr 100" }, reps);
    expect(result).toEqual({ repUid: "rep-1", confidence: 1, method: "salesId", reason: "Exact sales ID" });
  });

  it("matches on an exact normalized email when no sales ID matches", () => {
    const reps = [makeRep({ repUid: "rep-1", salesIds: ["SR-100"], email: "Jane.Doe@Example.com" })];
    const result = matchImportRowToRep({ rawSalesId: "not-a-match", email: "  jane.doe@example.com  " }, reps);
    expect(result).toEqual({ repUid: "rep-1", confidence: 1, method: "email", reason: "Exact email" });
  });

  it("matches on an alias name after stripping an '- Company B' suffix from the import row", () => {
    const reps = [makeRep({ repUid: "rep-1", displayName: "Jane Doe", aliases: ["JD"] })];
    const result = matchImportRowToRep({ rawRepName: "jd - Company B" }, reps);
    expect(result).toEqual({ repUid: "rep-1", confidence: 0.98, method: "alias", reason: "Exact normalized name" });
  });

  it("matches on the rep's own display name when it is not an alias", () => {
    const reps = [makeRep({ repUid: "rep-1", displayName: "Jane Doe", aliases: [] })];
    const result = matchImportRowToRep({ rawRepName: "Jane Doe" }, reps);
    expect(result).toEqual({ repUid: "rep-1", confidence: 0.98, method: "normalizedName", reason: "Exact normalized name" });
  });

  it("prioritizes sales ID over email and name when multiple signals are present", () => {
    const reps = [
      makeRep({ repUid: "rep-1", salesIds: ["SR-999"], email: "other@example.com", displayName: "Other Rep" }),
      makeRep({ repUid: "rep-2", salesIds: ["SR-100"], email: "jane.doe@example.com", displayName: "Jane Doe" }),
    ];
    const result = matchImportRowToRep({ rawSalesId: "SR-100", email: "other@example.com", rawRepName: "Other Rep" }, reps);
    expect(result.repUid).toBe("rep-2");
    expect(result.method).toBe("salesId");
  });

  it("returns no match when nothing on the roster lines up", () => {
    const reps = [makeRep({ repUid: "rep-1" })];
    const result = matchImportRowToRep({ rawSalesId: "UNKNOWN", email: "nobody@example.com", rawRepName: "Nobody Here" }, reps);
    expect(result).toEqual({ repUid: null, confidence: 0, method: null, reason: "No high-confidence roster match" });
  });

  it("returns no match against an empty roster", () => {
    const result = matchImportRowToRep({ rawSalesId: "SR-100" }, []);
    expect(result.repUid).toBeNull();
  });
});
