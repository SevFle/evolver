import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApiKeysPage from "../src/app/api-keys/page";

describe("ApiKeysPage", () => {
  it("renders the API Keys heading", () => {
    render(<ApiKeysPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "API Keys" })
    ).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<ApiKeysPage />);
    expect(
      screen.getByText("API key management coming soon.")
    ).toBeDefined();
  });

  it("has a container div with padding", () => {
    const { container } = render(<ApiKeysPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", () => {
    const { container } = render(<ApiKeysPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("640px");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<ApiKeysPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders muted color on description paragraph", () => {
    const { container } = render(<ApiKeysPage />);
    const p = container.querySelector("p") as HTMLElement;
    expect(p).toBeDefined();
    expect(p.style.color).toBe("var(--color-muted)");
  });

  it("renders the heading with correct font weight", () => {
    const { container } = render(<ApiKeysPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("snapshot matches", () => {
    const { container } = render(<ApiKeysPage />);
    expect(container).toMatchSnapshot();
  });
});
