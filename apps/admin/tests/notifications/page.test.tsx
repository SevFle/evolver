import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationsPage from "../../src/app/notifications/page";

describe("NotificationsPage", () => {
  it("renders heading", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Notification Rules")).toBeDefined();
  });

  it("renders coming soon text", () => {
    render(<NotificationsPage />);
    expect(screen.getByText(/coming soon/)).toBeDefined();
  });
});
