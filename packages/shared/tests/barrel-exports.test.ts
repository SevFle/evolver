import { describe, it, expect } from "vitest";
import {
  generateTrackingId,
  slugify,
  formatApiResponse,
  formatApiError,
  isValidEmail,
  isValidPhone,
} from "../src/index";
import type {
  ApiResponse,
  PaginatedResponse,
  ShipmentPayload,
  MilestonePayload,
  TenantConfig,
  ShipmentStatus,
  MilestoneType,
} from "../src/index";

describe("barrel exports from index.ts", () => {
  it("re-exports utility functions", () => {
    expect(typeof generateTrackingId).toBe("function");
    expect(typeof slugify).toBe("function");
    expect(typeof formatApiResponse).toBe("function");
    expect(typeof formatApiError).toBe("function");
    expect(typeof isValidEmail).toBe("function");
    expect(typeof isValidPhone).toBe("function");
  });

  it("re-exported functions work correctly", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(formatApiResponse("test")).toEqual({ success: true, data: "test" });
    expect(formatApiError("fail")).toEqual({
      success: false,
      error: "fail",
      status: undefined,
    });
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidPhone("+14155552671")).toBe(true);
    expect(generateTrackingId().startsWith("SL-")).toBe(true);
  });

  it("re-exports type definitions (verified at compile time)", () => {
    const response: ApiResponse<string> = { success: true, data: "ok" };
    expect(response.success).toBe(true);

    const paginated: PaginatedResponse<string> = {
      success: true,
      data: ["a"],
      total: 1,
      page: 1,
      pageSize: 10,
    };
    expect(paginated.total).toBe(1);

    const shipment: ShipmentPayload = {
      trackingId: "SL-1",
      origin: "A",
      destination: "B",
    };
    expect(shipment.trackingId).toBe("SL-1");

    const milestone: MilestonePayload = { type: "picked_up" };
    expect(milestone.type).toBe("picked_up");

    const tenant: TenantConfig = {
      id: "t1",
      name: "Test",
      slug: "test",
    };
    expect(tenant.id).toBe("t1");

    const status: ShipmentStatus = "in_transit";
    expect(status).toBe("in_transit");

    const milestoneType: MilestoneType = "delivered";
    expect(milestoneType).toBe("delivered");
  });
});
