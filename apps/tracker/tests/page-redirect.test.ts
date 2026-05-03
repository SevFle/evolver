import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe("OldTrackingPage redirect", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedirect.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage(trackingId: string) {
    const { default: OldTrackingPage } = await import(
      "@/app/[trackingId]/page"
    );
    const params = Promise.resolve({ trackingId });
    try {
      await OldTrackingPage({ params });
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  }

  it("redirects to /track/{trackingId} for simple ID", async () => {
    const msg = await renderPage("SL-ABC123");
    expect(msg).toBe("REDIRECT:/track/SL-ABC123");
  });

  it("URL-encodes tracking ID with special characters", async () => {
    const msg = await renderPage("SL ABC");
    expect(msg).toBe("REDIRECT:/track/SL%20ABC");
  });

  it("URL-encodes tracking ID with slashes", async () => {
    const msg = await renderPage("SL/ABC");
    expect(msg).toBe("REDIRECT:/track/SL%2FABC");
  });

  it("URL-encodes tracking ID with percent sign", async () => {
    const msg = await renderPage("SL%20");
    expect(msg).toBe("REDIRECT:/track/SL%2520");
  });

  it("URL-encodes tracking ID with hash", async () => {
    const msg = await renderPage("SL#123");
    expect(msg).toBe("REDIRECT:/track/SL%23123");
  });

  it("URL-encodes tracking ID with question mark", async () => {
    const msg = await renderPage("SL?123");
    expect(msg).toBe("REDIRECT:/track/SL%3F123");
  });

  it("URL-encodes tracking ID with unicode characters", async () => {
    const msg = await renderPage("SL-ÜNÜCÖDE");
    expect(msg).toBe("REDIRECT:/track/SL-%C3%9CN%C3%9CC%C3%96DE");
  });

  it("handles tracking ID with already-encoded characters", async () => {
    const msg = await renderPage("SL%2F");
    expect(msg).toBe("REDIRECT:/track/SL%252F");
  });

  it("handles empty tracking ID", async () => {
    const msg = await renderPage("");
    expect(msg).toBe("REDIRECT:/track/");
  });

  it("always calls redirect exactly once", async () => {
    await renderPage("SL-123");
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
