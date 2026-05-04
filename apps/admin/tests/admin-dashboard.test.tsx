import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminDashboard from "../src/app/page";

describe("AdminDashboard", () => {
  it("renders the ShipLens Admin heading", () => {
    render(<AdminDashboard />);
    expect(
      screen.getByRole("heading", { level: 1, name: "ShipLens Admin" })
    ).toBeDefined();
  });

  it("renders the welcome message", () => {
    render(<AdminDashboard />);
    expect(
      screen.getByText("Welcome to ShipLens. Select a section to get started.")
    ).toBeDefined();
  });

  it("renders a nav element with navigation links", () => {
    render(<AdminDashboard />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeDefined();
  });

  it("renders the Shipments link with correct href", () => {
    render(<AdminDashboard />);
    const link = screen.getByRole("link", { name: "Shipments" });
    expect(link.getAttribute("href")).toBe("/shipments");
  });

  it("renders the Settings link with correct href", () => {
    render(<AdminDashboard />);
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("renders the API Keys link with correct href", () => {
    render(<AdminDashboard />);
    const link = screen.getByRole("link", { name: "API Keys" });
    expect(link.getAttribute("href")).toBe("/api-keys");
  });

  it("renders the Notifications link with correct href", () => {
    render(<AdminDashboard />);
    const link = screen.getByRole("link", { name: "Notifications" });
    expect(link.getAttribute("href")).toBe("/notifications");
  });

  it("renders exactly 4 navigation links", () => {
    render(<AdminDashboard />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("nav links use the primary color", () => {
    const { container } = render(<AdminDashboard />);
    const links = container.querySelectorAll("a");
    links.forEach((link) => {
      expect((link as HTMLElement).style.color).toBe("var(--color-primary)");
    });
  });

  it("has a container div with padding", () => {
    const { container } = render(<AdminDashboard />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", () => {
    const { container } = render(<AdminDashboard />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("1200px");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<AdminDashboard />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders the heading with correct font size", () => {
    const { container } = render(<AdminDashboard />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontSize).toBe("1.5rem");
  });

  it("renders the heading with correct font weight", () => {
    const { container } = render(<AdminDashboard />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("renders the welcome paragraph with muted color", () => {
    const { container } = render(<AdminDashboard />);
    const p = container.querySelectorAll("p");
    expect(p.length).toBeGreaterThanOrEqual(1);
    const welcomeP = Array.from(p).find(
      (el) => el.textContent?.includes("Welcome to ShipLens")
    ) as HTMLElement;
    expect(welcomeP.style.color).toBe("var(--color-muted)");
  });

  it("nav has flex display with gap", () => {
    const { container } = render(<AdminDashboard />);
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav.style.display).toBe("flex");
    expect(nav.style.gap).toBe("1rem");
  });

  it("snapshot matches", () => {
    const { container } = render(<AdminDashboard />);
    expect(container).toMatchSnapshot();
  });
});
