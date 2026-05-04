import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationsPage from "../src/app/notifications/page";

describe("NotificationsPage", () => {
  it("renders the Notification Rules heading", () => {
    render(<NotificationsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Notification Rules" })
    ).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<NotificationsPage />);
    expect(
      screen.getByText("Notification rule management coming soon.")
    ).toBeDefined();
  });

  it("has a container div with padding", () => {
    const { container } = render(<NotificationsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", () => {
    const { container } = render(<NotificationsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("640px");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<NotificationsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders muted color on description paragraph", () => {
    const { container } = render(<NotificationsPage />);
    const p = container.querySelector("p") as HTMLElement;
    expect(p).toBeDefined();
    expect(p.style.color).toBe("var(--color-muted)");
  });

  it("renders the heading with correct font weight", () => {
    const { container } = render(<NotificationsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("renders heading with correct font size", () => {
    const { container } = render(<NotificationsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontSize).toBe("1.25rem");
  });

  it("snapshot matches", () => {
    const { container } = render(<NotificationsPage />);
    expect(container).toMatchSnapshot();
  });
});
