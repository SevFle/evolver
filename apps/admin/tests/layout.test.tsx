import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout from "../src/app/layout";

describe("RootLayout", () => {
  it("renders children passed to it", () => {
    render(
      <RootLayout>
        <div data-testid="child">Test Child</div>
      </RootLayout>
    );

    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.getByText("Test Child")).toBeDefined();
  });

  it("renders multiple children", () => {
    render(
      <RootLayout>
        <span>First</span>
        <span>Second</span>
      </RootLayout>
    );

    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });

  it("renders nested child elements", () => {
    render(
      <RootLayout>
        <section>
          <p>Nested content</p>
        </section>
      </RootLayout>
    );

    expect(screen.getByText("Nested content")).toBeDefined();
  });

  it("renders nothing when no children provided", () => {
    const { container } = render(<RootLayout children={undefined} />);
    expect(container.textContent ?? "").toBe("");
  });

  it("snapshot matches", () => {
    const { container } = render(
      <RootLayout>
        <div>Snapshot child</div>
      </RootLayout>
    );
    expect(container).toMatchSnapshot();
  });
});
