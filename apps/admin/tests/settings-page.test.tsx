import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "../src/app/settings/page";

describe("SettingsPage", () => {
  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Tenant Settings" })
    ).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<SettingsPage />);
    expect(
      screen.getByText("Branding and notification settings coming soon.")
    ).toBeDefined();
  });

  it("has a container div with padding", () => {
    const { container } = render(<SettingsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", () => {
    const { container } = render(<SettingsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("640px");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<SettingsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders muted color on description paragraph", () => {
    const { container } = render(<SettingsPage />);
    const p = container.querySelector("p") as HTMLElement;
    expect(p).toBeDefined();
    expect(p.style.color).toBe("var(--color-muted)");
  });

  it("renders the heading with correct font weight", () => {
    const { container } = render(<SettingsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("renders heading with correct font size", () => {
    const { container } = render(<SettingsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontSize).toBe("1.25rem");
  });

  it("snapshot matches", () => {
    const { container } = render(<SettingsPage />);
    expect(container).toMatchSnapshot();
  });
});
