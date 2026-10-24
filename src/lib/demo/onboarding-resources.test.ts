import { beforeEach, describe, expect, it, vi } from "vitest";
import { onboardingResources } from "@/src/components/onboarding/onboarding-resources";
import { GET, POST } from "@/app/api/onboarding-resources/route";

const mocks = vi.hoisted(() => ({ get: vi.fn(), add: vi.fn() }));

vi.mock("@/src/lib/firebase/admin", () => ({
  getAdminDb: () => ({ collection: () => mocks }),
}));
vi.mock("@/src/lib/firebase/server-auth", () => ({
  requireActor: async () => ({ token: { uid: "demo-user" } }),
  canManageResources: () => true,
}));

describe("demo resources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ships resource examples without outbound destinations", () => {
    expect(onboardingResources.length).toBeGreaterThan(0);
    for (const resource of onboardingResources) {
      expect(resource.status).toBe("demo");
      expect(resource).not.toHaveProperty("href");
    }
  });

  it("omits destinations from previously saved resources", async () => {
    mocks.get.mockResolvedValue({ docs: [{
      id: "saved-resource",
      data: () => ({
        category: "Tools", label: "Saved tool", description: "Example resource",
        href: "https://example.com/legacy-destination",
      }),
    }] });

    const response = await GET(new Request("http://localhost/api/onboarding-resources"));
    expect(response.status).toBe(200);
    const { resources } = await response.json();
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ label: "Saved tool", status: "demo" });
    expect(resources[0]).not.toHaveProperty("href");
  });

  it("does not retain URLs submitted with new demo resources", async () => {
    mocks.add.mockResolvedValue({ id: "new-resource" });
    const response = await POST(new Request("http://localhost/api/onboarding-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "Tools", label: "Demo tool", description: "Example resource",
        url: "https://example.com/new-destination",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.add.mock.calls[0][0]).not.toHaveProperty("href");
    expect(mocks.add.mock.calls[0][0]).not.toHaveProperty("url");
    const { resource } = await response.json();
    expect(resource.status).toBe("demo");
    expect(resource).not.toHaveProperty("href");
  });
});
