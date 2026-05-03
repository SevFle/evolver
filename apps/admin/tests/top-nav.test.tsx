import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/shipments",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { TopNav } from "@/components/TopNav";

describe("TopNav", () => {
  it("renders the ShipLens brand", () => {
    render(<TopNav />);
    expect(screen.getByText("ShipLens")).toBeDefined();
  });

  it("renders all nav items", () => {
    render(<TopNav />);
    expect(screen.getByText("Shipments")).toBeDefined();
    expect(screen.getByText("API Keys")).toBeDefined();
    expect(screen.getByText("Tracking Page Config")).toBeDefined();
  });

  it("links to correct routes", () => {
    render(<TopNav />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/shipments");
    expect(hrefs).toContain("/api-keys");
    expect(hrefs).toContain("/settings");
    expect(hrefs).toContain("/");
  });

  it("highlights active nav item based on pathname", () => {
    render(<TopNav />);
    const shipmentsLink = screen.getByText("Shipments");
    expect(shipmentsLink.style.fontWeight).toBe("600");
    expect(shipmentsLink.style.color).toBe("var(--color-primary)");
  });

  it("does not highlight inactive nav items", () => {
    render(<TopNav />);
    const apiKeysLink = screen.getByText("API Keys");
    expect(apiKeysLink.style.fontWeight).toBe("400");
  });
});
