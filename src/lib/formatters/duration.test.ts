import { describe, expect, it } from "vitest";
import { formatHoursAsDuration } from "./duration";

describe("formatHoursAsDuration", () => {
  it("shows sub-hour durations as minutes", () => {
    expect(formatHoursAsDuration(0.5)).toBe("30 min");
    expect(formatHoursAsDuration(0.89)).toBe("53 min");
  });

  it("shows hours and remaining minutes without decimals", () => {
    expect(formatHoursAsDuration(1)).toBe("1 hr");
    expect(formatHoursAsDuration(2.5)).toBe("2 hr 30 min");
  });
});
