import { describe, expect, it } from "vitest";
import { normalizePermissions } from "./access";

describe("team page permission", () => {
  it("keeps Teams visible for existing profiles that predate the permission", () => {
    expect(normalizePermissions({ canViewRoster: false }).canViewTeams).toBe(true);
  });

  it("honors an explicitly disabled Teams permission", () => {
    expect(normalizePermissions({ canViewTeams: false }).canViewTeams).toBe(false);
  });
});
