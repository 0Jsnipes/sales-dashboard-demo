import type { Rep } from "@/src/types/rep";

export function makeRep(overrides: Partial<Rep> = {}): Rep {
  return {
    repUid: "rep-1",
    displayName: "Jane Doe",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@example.com",
    emailNormalized: "jane.doe@example.com",
    salesIds: ["SR-100"],
    aliases: [],
    managerUid: null,
    managerName: "No manager",
    locationId: "loc-1",
    locationName: "Downtown",
    programIds: [],
    vendorType: "organic",
    weeklySalesGoal: 5,
    weeklyKnocksGoal: 50,
    status: "active",
    authUid: null,
    accountStatus: "active",
    onboarding: { onboarded: true, checks: {} },
    ...overrides,
  };
}
