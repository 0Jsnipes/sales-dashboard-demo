import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorResponse, resolveErrorStatus } from "./error-response";

describe("resolveErrorStatus", () => {
  it("maps UNAUTHENTICATED to 401", () => {
    expect(resolveErrorStatus(new Error("UNAUTHENTICATED"))).toEqual({ message: "UNAUTHENTICATED", status: 401 });
  });

  it("maps PROFILE_NOT_FOUND to 403", () => {
    expect(resolveErrorStatus(new Error("PROFILE_NOT_FOUND"))).toEqual({ message: "PROFILE_NOT_FOUND", status: 403 });
  });

  it("falls back to 500 for unrecognized errors", () => {
    expect(resolveErrorStatus(new Error("Firestore is down"))).toEqual({ message: "Firestore is down", status: 500 });
  });

  it("uses the fallback message for non-Error throws", () => {
    expect(resolveErrorStatus("plain string throw", "UPLOAD_FAILED")).toEqual({ message: "UPLOAD_FAILED", status: 500 });
  });
});

describe("errorResponse", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs unexpected (500) errors server-side", async () => {
    const response = errorResponse("test-route", new Error("boom"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "boom" });
    expect(console.error).toHaveBeenCalledWith("[api:test-route]", expect.any(Error));
  });

  it("does not log expected auth errors", async () => {
    const response = errorResponse("test-route", new Error("UNAUTHENTICATED"));
    expect(response.status).toBe(401);
    expect(console.error).not.toHaveBeenCalled();
  });
});
