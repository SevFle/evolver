import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RootLayout from "../../src/app/layout";

describe("RootLayout", () => {
  it("renders children inside body", () => {
    const { getByText } = render(
      <RootLayout>
        <p>Hello from layout</p>
      </RootLayout>
    );
    expect(getByText("Hello from layout")).toBeDefined();
  });

  it("renders multiple children", () => {
    const { getByText } = render(
      <RootLayout>
        <p>First</p>
        <p>Second</p>
      </RootLayout>
    );
    expect(getByText("First")).toBeDefined();
    expect(getByText("Second")).toBeDefined();
  });

  it("renders with empty children", () => {
    const { container } = render(<RootLayout>{""}</RootLayout>);
    expect(container).toBeDefined();
  });

  it("renders nested elements inside body", () => {
    const { container, getByText } = render(
      <RootLayout>
        <div data-testid="nested">
          <span>Nested content</span>
        </div>
      </RootLayout>
    );
    expect(container.querySelector("[data-testid='nested']")).not.toBeNull();
    expect(getByText("Nested content")).toBeDefined();
  });

  it("wraps children in a container that provides html structure", () => {
    const { container } = render(
      <RootLayout>
        <span data-testid="test-child">child</span>
      </RootLayout>
    );
    expect(container.querySelector("[data-testid='test-child']")).not.toBeNull();
  });

  it("renders fragments as children", () => {
    const { getByText } = render(
      <RootLayout>
        <>
          <p>Fragment A</p>
          <p>Fragment B</p>
        </>
      </RootLayout>
    );
    expect(getByText("Fragment A")).toBeDefined();
    expect(getByText("Fragment B")).toBeDefined();
  });
});
