import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApiKeysPage from "../../src/app/api-keys/page";

describe("ApiKeysPage", () => {
  it("renders heading", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText("API Keys")).toBeDefined();
  });

  it("renders coming soon text", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText(/coming soon/)).toBeDefined();
  });
});
