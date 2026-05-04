import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApiKeysPage from "../src/app/api-keys/page";
import NotificationsPage from "../src/app/notifications/page";
import SettingsPage from "../src/app/settings/page";

describe("ApiKeysPage", () => {
  it("renders the API Keys heading", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText("API Keys")).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText("API key management coming soon.")).toBeDefined();
  });

  it("applies valid style objects (not null) to container", () => {
    const { container } = render(<ApiKeysPage />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style).toBeDefined();
    expect(wrapper.style.padding).toBe("2rem");
  });
});

describe("NotificationsPage", () => {
  it("renders the Notification Rules heading", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Notification Rules")).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Notification rule management coming soon.")).toBeDefined();
  });

  it("applies valid style objects (not null) to container", () => {
    const { container } = render(<NotificationsPage />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style).toBeDefined();
    expect(wrapper.style.padding).toBe("2rem");
  });
});

describe("SettingsPage", () => {
  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Tenant Settings")).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Branding and notification settings coming soon.")).toBeDefined();
  });

  it("applies valid style objects (not null) to container", () => {
    const { container } = render(<SettingsPage />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style).toBeDefined();
    expect(wrapper.style.padding).toBe("2rem");
  });
});
