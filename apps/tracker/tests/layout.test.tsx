import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RootLayout from "../src/app/layout";

describe("RootLayout", () => {
  it("renders children content", () => {
    const { getByText } = render(
      <RootLayout>
        <p>Hello Tracker</p>
      </RootLayout>
    );
    expect(getByText("Hello Tracker")).toBeDefined();
  });

  it("wraps children correctly", () => {
    const { getByText } = render(
      <RootLayout>
        <div data-testid="child">Child Content</div>
      </RootLayout>
    );
    expect(getByText("Child Content")).toBeDefined();
  });

  it("renders multiple children", () => {
    const { getByText } = render(
      <RootLayout>
        <span>A</span>
        <span>B</span>
      </RootLayout>
    );
    expect(getByText("A")).toBeDefined();
    expect(getByText("B")).toBeDefined();
  });

  it("renders without crashing with empty children", () => {
    const { container } = render(<RootLayout>{""}</RootLayout>);
    expect(container).toBeDefined();
  });

  it("renders nested component trees", () => {
    const { getByText } = render(
      <RootLayout>
        <section>
          <h1>Page Title</h1>
          <p>Page body</p>
        </section>
      </RootLayout>
    );
    expect(getByText("Page Title")).toBeDefined();
    expect(getByText("Page body")).toBeDefined();
  });
});
