import { describe, expect, it } from "vitest";
import { viewAsRequestIsReadOnly } from "./view-as";

describe("view-as request safety", () => {
  it("allows read requests", () => {
    expect(viewAsRequestIsReadOnly("GET")).toBe(true);
    expect(viewAsRequestIsReadOnly("head")).toBe(true);
  });

  it("blocks mutations", () => {
    expect(viewAsRequestIsReadOnly("POST")).toBe(false);
    expect(viewAsRequestIsReadOnly("PATCH")).toBe(false);
    expect(viewAsRequestIsReadOnly("DELETE")).toBe(false);
  });
});
