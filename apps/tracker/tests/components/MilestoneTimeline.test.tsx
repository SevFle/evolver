import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MilestoneTimeline } from "../../src/components/MilestoneTimeline";
import type { TrackingMilestone } from "../../src/lib/tracking-api";

describe("MilestoneTimeline", () => {
  const milestones: TrackingMilestone[] = [
    {
      type: "picked_up",
      description: "Package picked up",
      location: "Shanghai",
      occurredAt: "2025-01-15T10:00:00Z",
    },
    {
      type: "in_transit",
      description: "In transit",
      location: "Pacific Ocean",
      occurredAt: "2025-01-16T08:00:00Z",
    },
    {
      type: "delivered",
      description: "Delivered",
      occurredAt: "2025-01-25T14:00:00Z",
    },
  ];

  it("renders empty state message when no milestones", () => {
    const { getByText } = render(<MilestoneTimeline milestones={[]} />);
    expect(getByText(/No milestone updates yet/)).toBeDefined();
  });

  it("renders empty state icon", () => {
    const { container } = render(<MilestoneTimeline milestones={[]} />);
    const icon = container.querySelector(".milestone-empty-icon");
    expect(icon).not.toBeNull();
  });

  it("renders section title", () => {
    const { getByText } = render(<MilestoneTimeline milestones={milestones} />);
    expect(getByText("Shipment Timeline")).toBeDefined();
  });

  it("renders all milestones", () => {
    const { getByText, getAllByText } = render(
      <MilestoneTimeline milestones={milestones} />
    );
    expect(getByText(/Package picked up/)).toBeDefined();
    expect(getAllByText(/In transit/)[0]).toBeDefined();
    expect(getAllByText(/Delivered/)[0]).toBeDefined();
  });

  it("renders milestone type with underscores replaced by spaces", () => {
    const { getByText } = render(<MilestoneTimeline milestones={milestones} />);
    expect(getByText("Picked up")).toBeDefined();
  });

  it("renders location when provided", () => {
    const { getByText } = render(<MilestoneTimeline milestones={milestones} />);
    expect(getByText("Shanghai")).toBeDefined();
    expect(getByText("Pacific Ocean")).toBeDefined();
  });

  it("renders single milestone", () => {
    const { getByText } = render(
      <MilestoneTimeline
        milestones={[
          {
            type: "booked",
            description: "Order booked",
            occurredAt: "2025-01-14T09:00:00Z",
          },
        ]}
      />
    );
    expect(getByText("Order booked")).toBeDefined();
    expect(getByText("Booked")).toBeDefined();
  });

  it("renders milestone without description", () => {
    const { getByText } = render(
      <MilestoneTimeline
        milestones={[
          {
            type: "departed_origin",
            occurredAt: "2025-01-15T12:00:00Z",
          },
        ]}
      />
    );
    expect(getByText("Departed origin")).toBeDefined();
  });

  it("renders milestone without location", () => {
    const { getByText } = render(
      <MilestoneTimeline
        milestones={[
          {
            type: "customs_cleared",
            description: "Cleared customs",
            occurredAt: "2025-01-20T10:00:00Z",
          },
        ]}
      />
    );
    expect(getByText("Cleared customs")).toBeDefined();
    expect(getByText("Customs cleared")).toBeDefined();
  });

  it("renders formatted date from occurredAt", () => {
    const { getByText } = render(<MilestoneTimeline milestones={milestones} />);
    const date = new Date("2025-01-15T10:00:00Z").toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    );
    expect(getByText(date, { exact: false })).toBeDefined();
  });

  it("renders all milestones in order", () => {
    const { container } = render(
      <MilestoneTimeline milestones={milestones} />
    );
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(3);
  });

  it("renders ordered list element", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const list = container.querySelector("ol");
    expect(list).not.toBeNull();
  });

  it("renders Latest badge on first milestone", () => {
    const { getByText } = render(<MilestoneTimeline milestones={milestones} />);
    expect(getByText("Latest")).toBeDefined();
  });

  it("applies latest dot class on first milestone", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const dots = container.querySelectorAll(".milestone-dot");
    expect(dots[0].classList.contains("milestone-dot-latest")).toBe(true);
  });

  it("applies default dot class on non-latest milestones", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const dots = container.querySelectorAll(".milestone-dot");
    expect(dots[1].classList.contains("milestone-dot-default")).toBe(true);
  });

  it("applies exception dot class on exception milestones", () => {
    const { container } = render(
      <MilestoneTimeline
        milestones={[
          {
            type: "exception",
            description: "Delay reported",
            occurredAt: "2025-01-20T10:00:00Z",
          },
        ]}
      />
    );
    const dot = container.querySelector(".milestone-dot");
    expect(dot?.classList.contains("milestone-dot-exception")).toBe(true);
  });

  it("applies primary color to latest dot", () => {
    const { container } = render(
      <MilestoneTimeline milestones={milestones} primaryColor="#ff0000" />
    );
    const latestDot = container.querySelector(".milestone-dot-latest") as HTMLElement | null;
    expect(latestDot?.style.backgroundColor).toBe("rgb(255, 0, 0)");
  });

  it("renders location icon alongside location text", () => {
    const { container, getByText } = render(
      <MilestoneTimeline milestones={milestones} />
    );
    const locationSpan = getByText("Shanghai").closest(".milestone-location");
    expect(locationSpan?.querySelector("svg")).not.toBeNull();
  });

  it("renders time icon alongside time text", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const timeSpans = container.querySelectorAll(".milestone-time");
    expect(timeSpans.length).toBeGreaterThan(0);
    expect(timeSpans[0].querySelector("svg")).not.toBeNull();
  });

  it("renders milestone connecting lines between items", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const lines = container.querySelectorAll(".milestone-line");
    expect(lines.length).toBe(2);
  });

  it("does not render connecting line on last milestone", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const items = container.querySelectorAll(".milestone-item");
    const lastItem = items[items.length - 1];
    expect(lastItem.querySelector(".milestone-line")).toBeNull();
  });
});
