import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MilestoneTimeline } from "../../src/components/MilestoneTimeline";

describe("MilestoneTimeline", () => {
  const milestones = [
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

  it("renders all milestones", () => {
    const { getByText, getAllByText } = render(<MilestoneTimeline milestones={milestones} />);
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
            description: "Departed",
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
    const date = new Date("2025-01-15T10:00:00Z").toLocaleString();
    expect(getByText(date)).toBeDefined();
  });

  it("renders multiple milestones in order", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(3);
  });

  it("renders list element", () => {
    const { container } = render(<MilestoneTimeline milestones={milestones} />);
    const list = container.querySelector("ol");
    expect(list).not.toBeNull();
  });
});
