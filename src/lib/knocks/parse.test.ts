import { describe, expect, it } from "vitest";
import { makeRep } from "@/test/fixtures/rep";
import { parseCompanyAActivityKnockRows, parseCompanyBKnockRows } from "./parse";

describe("parseCompanyAActivityKnockRows", () => {
  const reps = [makeRep({ repUid: "rep-1", displayName: "Jane Doe", email: "jane.doe@example.com" })];

  it("normalizes valid rows and matches a rep by email", () => {
    const { rows, summary } = parseCompanyAActivityKnockRows(
      [{ Id: "1", Name: "Jane Doe", Activity: "Sold", Date: "2026-06-01", Email: "jane.doe@example.com", "Activity Lead ID": "L-1" }],
      reps,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      knockUid: "companya_activity:1",
      provider: "Company A",
      repName: "Jane Doe",
      normalizedStatus: "sale",
      repId: "rep-1",
      matchStatus: "matched",
      matchMethod: "email",
    });
    expect(summary).toMatchObject({ totalRowsSeen: 1, validRows: 1, skippedRows: 0, matchedRows: 1, unmatchedRows: 0 });
  });

  it("skips rows with no parseable activity date and leaves them out of validRows", () => {
    const { rows, summary } = parseCompanyAActivityKnockRows(
      [{ Id: "2", Name: "Jane Doe", Activity: "Sold", Date: "" }],
      reps,
    );
    expect(rows).toHaveLength(0);
    expect(summary).toMatchObject({ totalRowsSeen: 1, validRows: 0, skippedRows: 1 });
  });

  it("ignores fully blank rows without counting them as skipped", () => {
    const { summary } = parseCompanyAActivityKnockRows([{ Id: "", Name: "", Activity: "", Date: "" }], reps);
    expect(summary).toMatchObject({ totalRowsSeen: 1, validRows: 0, skippedRows: 0 });
  });

  it("leaves unmatched rows unmatched when no rep lines up", () => {
    const { rows } = parseCompanyAActivityKnockRows(
      [{ Id: "3", Name: "Nobody Here", Activity: "Try 1", Date: "2026-06-01" }],
      reps,
    );
    expect(rows[0]).toMatchObject({ matchStatus: "unmatched", repId: null });
  });

  it("counts duplicate knock UIDs within the same file", () => {
    const { summary } = parseCompanyAActivityKnockRows(
      [
        { Id: "1", Name: "Jane Doe", Activity: "Sold", Date: "2026-06-01" },
        { Id: "1", Name: "Jane Doe", Activity: "Sold", Date: "2026-06-01" },
      ],
      reps,
    );
    expect(summary.duplicateKnockUidsInFile).toBe(1);
  });
});

describe("parseCompanyBKnockRows", () => {
  const reps = [makeRep({ repUid: "rep-1", displayName: "Jane Doe", email: "jane.doe@example.com" })];

  it("normalizes valid rows and matches a rep by name", () => {
    const { rows, summary } = parseCompanyBKnockRows(
      [{ Rep: "Jane Doe", Status: "New Sale", "Disposition Time (Eastern)": "2026-06-01 10:00:00", "Lead ID": "L-9", external_id: "EXT-9", street_1: "123 Main St", City: "Springfield", state: "IL", Zip: "62704" }],
      reps,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "Company B",
      repName: "Jane Doe",
      normalizedStatus: "sale",
      repId: "rep-1",
      matchStatus: "matched",
      matchMethod: "exact_name",
      address: { street: "123 Main St", city: "Springfield", state: "IL", zip: "62704" },
    });
    expect(summary).toMatchObject({ totalRowsSeen: 1, validRows: 1, matchedRows: 1 });
  });

  it("parses the exported Eastern timestamp format without shifting the activity date", () => {
    const { rows } = parseCompanyBKnockRows(
      [{ Rep: "Jane Doe", Status: "Try 1", "Disposition Time (Eastern)": "Jul 8, 2026, 11:58:50\u202fPM", "Lead ID": "L-10" }],
      reps,
    );
    expect(rows[0]).toMatchObject({
      activityDate: "2026-07-09T03:58:50.000Z",
      activityDateKey: "2026-07-08",
      weekStart: "2026-07-06",
      monthKey: "2026-07",
    });
  });

  it("skips rows with an unparseable disposition time", () => {
    const { summary } = parseCompanyBKnockRows(
      [{ Rep: "Jane Doe", Status: "New Sale", "Disposition Time (Eastern)": "not-a-date" }],
      reps,
    );
    expect(summary).toMatchObject({ totalRowsSeen: 1, validRows: 0, skippedRows: 1 });
  });

  it("normalizes unmapped statuses to other rather than dropping them", () => {
    const { rows } = parseCompanyBKnockRows(
      [{ Rep: "Jane Doe", Status: "Some Brand New Disposition", "Disposition Time (Eastern)": "2026-06-01 10:00:00" }],
      reps,
    );
    expect(rows[0]?.normalizedStatus).toBe("other");
  });
});
