import { describe, it, expect } from "vitest";

describe("API health endpoint", () => {
  it("returns ok status", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe("ok");
    expect(data.service).toBe("HookRelay");
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBeDefined();
  });
});
